output "lambda_endpoint" {
  value       = module.lambda.image_gen_function_url
  description = "The HTTP POST endpoint for Lambda #1 (Image Generator)."
}

output "github_committer_function_name" {
  value       = module.lambda.github_committer_function_name
  description = "The name of Lambda #2 (GitHub Committer)."
}

output "s3_scenes_bucket_name" {
  value       = module.cdn_storage.bucket_name
  description = "Name of the S3 bucket storing Abei scenes."
}

output "cloudfront_cdn_domain" {
  value       = module.cdn_storage.cloudfront_domain_name
  description = "Domain name of the CloudFront CDN distribution."
}
