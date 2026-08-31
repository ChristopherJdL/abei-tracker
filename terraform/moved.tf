# ==============================================================================
# State Migration: Move root resources to modular structure
#
# These moved blocks prevent Terraform from destroying existing resources and
# map existing state items to their new addresses inside modules.
# ==============================================================================

# ------------------------------------------------------------------------------
# Module: cdn_storage (S3 & CloudFront)
# ------------------------------------------------------------------------------
moved {
  from = aws_s3_bucket.scenes_bucket
  to   = module.cdn_storage.aws_s3_bucket.scenes_bucket
}

moved {
  from = aws_s3_bucket_public_access_block.scenes_pab
  to   = module.cdn_storage.aws_s3_bucket_public_access_block.scenes_pab
}

moved {
  from = aws_cloudfront_origin_access_control.s3_oac
  to   = module.cdn_storage.aws_cloudfront_origin_access_control.s3_oac
}

moved {
  from = aws_cloudfront_distribution.scenes_cdn
  to   = module.cdn_storage.aws_cloudfront_distribution.scenes_cdn
}

moved {
  from = aws_s3_bucket_policy.allow_cloudfront
  to   = module.cdn_storage.aws_s3_bucket_policy.allow_cloudfront
}

# ------------------------------------------------------------------------------
# Module: iam (IAM Roles & Policies)
# ------------------------------------------------------------------------------
moved {
  from = aws_iam_role.lambda_role
  to   = module.iam.aws_iam_role.lambda_role
}

moved {
  from = aws_iam_role_policy_attachment.lambda_logs
  to   = module.iam.aws_iam_role_policy_attachment.lambda_logs
}

moved {
  from = aws_iam_policy.lambda_s3_write_policy
  to   = module.iam.aws_iam_policy.lambda_s3_write_policy
}

moved {
  from = aws_iam_role_policy_attachment.lambda_s3_write_attach
  to   = module.iam.aws_iam_role_policy_attachment.lambda_s3_write_attach
}

# ------------------------------------------------------------------------------
# Module: lambda (Lambdas, Packaging, and Function URLs)
# ------------------------------------------------------------------------------
moved {
  from = null_resource.install_dependencies
  to   = module.lambda.null_resource.install_dependencies
}

moved {
  from = aws_lambda_function.image_gen
  to   = module.lambda.aws_lambda_function.image_gen
}

moved {
  from = aws_lambda_function_url.image_gen_url
  to   = module.lambda.aws_lambda_function_url.image_gen_url
}

moved {
  from = aws_lambda_function.github_committer
  to   = module.lambda.aws_lambda_function.github_committer
}

moved {
  from = aws_iam_policy.lambda_invoke_policy
  to   = module.lambda.aws_iam_policy.lambda_invoke_policy
}

moved {
  from = aws_iam_role_policy_attachment.lambda_invoke_attach
  to   = module.lambda.aws_iam_role_policy_attachment.lambda_invoke_attach
}
