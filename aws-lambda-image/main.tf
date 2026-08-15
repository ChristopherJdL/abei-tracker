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

# 1. Pip Install & Package Build (runs on Terraform Cloud runner)
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

# 2. Zip the package directory (runs on Terraform Cloud runner)
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_package"
  output_path = "${path.module}/lambda_function.zip"
  depends_on  = [null_resource.install_dependencies]
}

# 3. IAM Role for Lambda
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

# 4. AWS Lambda Function
resource "aws_lambda_function" "image_gen" {
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  function_name    = "gemini-image-generator"
  role             = aws_iam_role.lambda_role.arn
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  timeout          = 900  # 15 minutes (AWS Lambda limit)
  memory_size      = 512  # 512 MB to handle image processing and networking comfortably

  environment {
    variables = {
      PYTHONPATH = "/var/task"
    }
  }
}

# 5. AWS Lambda Function URL (Public HTTP Endpoint)
resource "aws_lambda_function_url" "image_gen_url" {
  function_name      = aws_lambda_function.image_gen.function_name
  authorization_type = "NONE" # Public endpoint

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["POST", "OPTIONS"]
    allow_headers     = ["content-type", "authorization"]
    expose_headers     = ["date", "keep-alive"]
    max_age           = 86400
  }
}

# 6. Outputs
output "lambda_endpoint" {
  value       = aws_lambda_function_url.image_gen_url.function_url
  description = "The HTTP POST endpoint for the image generation service."
}
