# ==========================================
# Module 1: S3 Bucket & CloudFront CDN
# ==========================================
module "cdn_storage" {
  source = "./modules/cdn_storage"

  aws_region = var.aws_region
}

# ==========================================
# Module 2: IAM Roles & Policies
# ==========================================
module "iam" {
  source = "./modules/iam"

  s3_bucket_arn = module.cdn_storage.bucket_arn
}

# ==========================================
# Module 3: Lambda Functions & Packaging
# ==========================================
module "lambda" {
  source = "./modules/lambda"

  lambda_role_arn    = module.iam.lambda_role_arn
  lambda_role_name   = module.iam.lambda_role_name
  lambda_code_dir    = "${path.root}/lambda_code"
  lambda_package_dir = "${path.root}/lambda_package"
  lambda_zip_path    = "${path.root}/lambda_function.zip"
  committer_zip_path = "${path.root}/github_committer.zip"
  gemini_api_key     = var.gemini_api_key
  github_token       = var.github_token
  github_owner       = var.github_owner
  github_repo        = var.github_repo
  scenes_bucket_name = module.cdn_storage.bucket_name
  cdn_domain         = module.cdn_storage.cloudfront_domain_name
}
