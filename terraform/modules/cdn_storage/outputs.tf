output "bucket_name" {
  value       = aws_s3_bucket.scenes_bucket.bucket
  description = "Name of the S3 bucket storing scenes."
}

output "bucket_arn" {
  value       = aws_s3_bucket.scenes_bucket.arn
  description = "ARN of the S3 bucket storing scenes."
}

output "bucket_regional_domain_name" {
  value       = aws_s3_bucket.scenes_bucket.bucket_regional_domain_name
  description = "Regional domain name of the S3 bucket."
}

output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.scenes_cdn.domain_name
  description = "Domain name of the CloudFront CDN distribution."
}

output "cloudfront_distribution_arn" {
  value       = aws_cloudfront_distribution.scenes_cdn.arn
  description = "ARN of the CloudFront CDN distribution."
}
