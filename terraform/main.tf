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
  default     = "us-east-1"
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

# Trigger resource to force a run in Terraform Cloud
resource "null_resource" "tfc_trigger" {
  triggers = {
    build_trigger = timestamp()
  }
}

# ==========================================
# 1. Lambda #1 Build & Package
# ==========================================
resource "null_resource" "install_dependencies" {
  triggers = {
    requirements = filesha256("${path.module}/requirements.txt")
    code         = filesha256("${path.module}/lambda_function.py")
  }

  provisioner "local-exec" {
    command = <<EOT
      mkdir -p ${path.module}/lambda_package
      pip3 install -r ${path.module}/requirements.txt -t ${path.module}/lambda_package
      cp ${path.module}/lambda_function.py ${path.module}/lambda_package/
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
  source_file = "${path.module}/github_committer.py"
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
  memory_size      = 512

  environment {
    variables = {
      PYTHONPATH                   = "/var/task"
      GEMINI_API_KEY              = var.gemini_api_key
      GITHUB_TOKEN                = var.github_token
      GITHUB_COMMITTER_LAMBDA_NAME = aws_lambda_function.github_committer.function_name
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
# 7. Outputs
# ==========================================
output "lambda_endpoint" {
  value       = aws_lambda_function_url.image_gen_url.function_url
  description = "The HTTP POST endpoint for Lambda #1 (Image Generator)."
}

output "github_committer_function_name" {
  value       = aws_lambda_function.github_committer.function_name
  description = "The name of Lambda #2 (GitHub Committer)."
}
