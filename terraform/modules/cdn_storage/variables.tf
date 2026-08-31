variable "aws_region" {
  type        = string
  description = "AWS region for naming the S3 bucket."
}

variable "bucket_name_prefix" {
  type        = string
  default     = "abei-tracker-scenes"
  description = "Prefix for the scenes S3 bucket name."
}
