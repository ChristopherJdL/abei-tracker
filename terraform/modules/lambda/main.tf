# ==========================================
# 1. Packaging & Dependencies
# ==========================================
resource "null_resource" "install_dependencies" {
  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    command = <<EOT
      rm -rf ${var.lambda_package_dir}
      mkdir -p ${var.lambda_package_dir}
      python3 -m pip install -r ${var.lambda_code_dir}/requirements.txt -t ${var.lambda_package_dir} --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.12 --upgrade
      cp ${var.lambda_code_dir}/lambda_function.py ${var.lambda_package_dir}/
      cp -r ${var.lambda_code_dir}/modules ${var.lambda_package_dir}/
      cp -r ${var.lambda_code_dir}/assets ${var.lambda_package_dir}/
    EOT
  }
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = var.lambda_package_dir
  output_path = var.lambda_zip_path
  depends_on  = [null_resource.install_dependencies]
}

data "archive_file" "committer_zip" {
  type        = "zip"
  source_file = "${var.lambda_code_dir}/github_committer.py"
  output_path = var.committer_zip_path
}

# ==========================================
# 2. Lambda #2: GitHub Committer
# ==========================================
resource "aws_lambda_function" "github_committer" {
  filename         = data.archive_file.committer_zip.output_path
  source_code_hash = data.archive_file.committer_zip.output_base64sha256
  function_name    = "github-committer"
  role             = var.lambda_role_arn
  handler          = "github_committer.lambda_handler"
  runtime          = "python3.12"
  timeout          = 60 # GitHub API calls finish quickly

  environment {
    variables = {
      GITHUB_TOKEN = var.github_token
      GITHUB_OWNER = var.github_owner
      GITHUB_REPO  = var.github_repo
    }
  }
}

# Policy allowing Lambda #1 (Image Gen) to invoke Lambda #2 (GitHub Committer)
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
  role       = var.lambda_role_name
  policy_arn = aws_iam_policy.lambda_invoke_policy.arn
}

# ==========================================
# 3. Lambda #1: Image Generator
# ==========================================
resource "aws_lambda_function" "image_gen" {
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  function_name    = "gemini-image-generator"
  role             = var.lambda_role_arn
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  timeout          = 900 # 15 minutes max
  memory_size      = 1024

  environment {
    variables = {
      PYTHONPATH                   = "/var/task"
      GEMINI_API_KEY               = var.gemini_api_key
      GITHUB_TOKEN                 = var.github_token
      GITHUB_COMMITTER_LAMBDA_NAME = aws_lambda_function.github_committer.function_name
      SCENES_BUCKET                = var.scenes_bucket_name
      CDN_DOMAIN                   = var.cdn_domain
    }
  }
}

# ==========================================
# 4. Lambda #1 Function URL (Public Endpoint)
# ==========================================
resource "aws_lambda_function_url" "image_gen_url" {
  function_name      = aws_lambda_function.image_gen.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["content-type", "authorization"]
    expose_headers    = ["date", "keep-alive"]
    max_age           = 86400
  }
}
