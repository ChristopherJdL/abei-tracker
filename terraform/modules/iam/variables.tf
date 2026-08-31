variable "role_name" {
  type        = string
  default     = "gemini-image-gen-lambda-role"
  description = "Name of the IAM role for the Lambdas."
}

variable "s3_bucket_arn" {
  type        = string
  description = "ARN of the S3 bucket where Lambda can write scenes."
}
