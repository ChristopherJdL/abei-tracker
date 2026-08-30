terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type        = string
  default     = "eu-west-2"
  description = "The AWS region to deploy resources."
}

variable "github_token" {
  type        = string
  default     = ""
  sensitive   = true
  description = "GitHub Personal Access Token for committing new sightings."
}

variable "gemini_api_key" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Gemini API Key for image generation."
}


# ==========================================
# 1. Lambda #1 Build & Package
# ==========================================
resource "null_resource" "install_dependencies" {
  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    command = <<EOT
      rm -rf ${path.module}/lambda_package
      mkdir -p ${path.module}/lambda_package
      python3 -m pip install -r ${path.module}/lambda_code/requirements.txt -t ${path.module}/lambda_package --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.12 --upgrade
      cp ${path.module}/lambda_code/lambda_function.py ${path.module}/lambda_package/
      cp -r ${path.module}/lambda_code/assets ${path.module}/lambda_package/
    EOT
  }
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_package"
  output_path = "${path.module}/lambda_function.zip"
  depends_on  = [null_resource.install_dependencies]
}

# ==========================================
# 2. Lambda #2 Build & Package (GitHub Committer)
# ==========================================
data "archive_file" "committer_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_code/github_committer.py"
  output_path = "${path.module}/github_committer.zip"
}

# ==========================================
# 3. IAM Roles & Policies
# ==========================================
resource "aws_iam_role" "lambda_role" {
  name = "gemini-image-gen-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# IAM Policy for CloudWatch logs
resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Policy allowing Lambda #1 to invoke Lambda #2
resource "aws_iam_policy" "lambda_invoke_policy" {
  name        = "gemini-lambda-invoke-committer-policy"
  description = "Allows Lambda #1 to invoke Lambda #2 asynchronously"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.github_committer.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_invoke_attach" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_invoke_policy.arn
}

# ==========================================
# 4. Lambda #2 Resource (GitHub Committer)
# ==========================================
resource "aws_lambda_function" "github_committer" {
  filename         = data.archive_file.committer_zip.output_path
  source_code_hash = data.archive_file.committer_zip.output_base64sha256
  function_name    = "github-committer"
  role             = aws_iam_role.lambda_role.arn
  handler          = "github_committer.lambda_handler"
  runtime          = "python3.12"
  timeout          = 60  # GitHub API calls finish quickly

  environment {
    variables = {
      GITHUB_TOKEN = var.github_token
      GITHUB_OWNER = "ChristopherJdL"
      GITHUB_REPO  = "abei-tracker"
    }
  }
}

# ==========================================
# 5. Lambda #1 Resource (Image Generator)
# ==========================================
resource "aws_lambda_function" "image_gen" {
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  function_name    = "gemini-image-generator"
  role             = aws_iam_role.lambda_role.arn
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  timeout          = 900  # 15 minutes max
  memory_size      = 1024

  environment {
    variables = {
      PYTHONPATH                   = "/var/task"
      GEMINI_API_KEY              = var.gemini_api_key
      GITHUB_TOKEN                = var.github_token
      GITHUB_COMMITTER_LAMBDA_NAME = aws_lambda_function.github_committer.function_name
      SCENES_BUCKET                = aws_s3_bucket.scenes_bucket.bucket
      CDN_DOMAIN                   = aws_cloudfront_distribution.scenes_cdn.domain_name
    }
  }
}

# ==========================================
# 6. Lambda #1 Function URL (Public Endpoint)
# ==========================================
resource "aws_lambda_function_url" "image_gen_url" {
  function_name      = aws_lambda_function.image_gen.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["content-type", "authorization"]
    expose_headers     = ["date", "keep-alive"]
    max_age           = 86400
  }
}

# ==========================================
# 7. S3 Bucket pour les scènes d'Abei
# ==========================================
resource "aws_s3_bucket" "scenes_bucket" {
  bucket = "abei-tracker-scenes-${var.aws_region}"
}

resource "aws_s3_bucket_public_access_block" "scenes_pab" {
  bucket = aws_s3_bucket.scenes_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ==========================================
# 8. CloudFront Origin Access Control (OAC)
# ==========================================
resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "abei-scenes-oac"
  description                       = "OAC pour le bucket S3 des scènes Abei"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ==========================================
# 9. CloudFront CDN Distribution (Free Tier)
# ==========================================
resource "aws_cloudfront_distribution" "scenes_cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Abei Tracker Scenes CDN"
  default_root_object = ""
  price_class         = "PriceClass_100" # Couvre US, Canada, Europe (Free Tier le plus économique)

  origin {
    domain_name              = aws_s3_bucket.scenes_bucket.bucket_regional_domain_name
    origin_id                = "S3-abei-tracker-scenes"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-abei-tracker-scenes"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400      # 1 jour
    max_ttl                = 31536000   # 1 an (images immuables)
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Bucket policy autorisant uniquement CloudFront OAC
resource "aws_s3_bucket_policy" "allow_cloudfront" {
  bucket = aws_s3_bucket.scenes_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.scenes_bucket.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.scenes_cdn.arn
          }
        }
      }
    ]
  })
}

# IAM Policy pour permettre aux Lambdas d'écrire dans le bucket S3
resource "aws_iam_policy" "lambda_s3_write_policy" {
  name        = "gemini-lambda-s3-write-policy"
  description = "Autorise les Lambdas à uploader des scènes dans S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${aws_s3_bucket.scenes_bucket.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_s3_write_attach" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_s3_write_policy.arn
}

# ==========================================
# 10. Outputs
# ==========================================
output "lambda_endpoint" {
  value       = aws_lambda_function_url.image_gen_url.function_url
  description = "The HTTP POST endpoint for Lambda #1 (Image Generator)."
}

output "github_committer_function_name" {
  value       = aws_lambda_function.github_committer.function_name
  description = "The name of Lambda #2 (GitHub Committer)."
}

output "s3_scenes_bucket_name" {
  value       = aws_s3_bucket.scenes_bucket.bucket
  description = "Name of the S3 bucket storing Abei scenes."
}

output "cloudfront_cdn_domain" {
  value       = aws_cloudfront_distribution.scenes_cdn.domain_name
  description = "Domain name of the CloudFront CDN distribution."
}
