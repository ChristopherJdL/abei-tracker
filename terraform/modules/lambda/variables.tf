variable "lambda_role_arn" {
  type        = string
  description = "ARN of the IAM role for the Lambda functions."
}

variable "lambda_role_name" {
  type        = string
  description = "Name of the IAM role for the Lambda functions."
}

variable "lambda_code_dir" {
  type        = string
  description = "Absolute or relative path to the lambda_code directory."
}

variable "lambda_package_dir" {
  type        = string
  description = "Path where dependencies will be installed and packaged."
}

variable "lambda_zip_path" {
  type        = string
  description = "Path for the image generator zip archive."
}

variable "committer_zip_path" {
  type        = string
  description = "Path for the GitHub committer zip archive."
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

variable "github_owner" {
  type        = string
  default     = "ChristopherJdL"
  description = "GitHub repository owner."
}

variable "github_repo" {
  type        = string
  default     = "abei-tracker"
  description = "GitHub repository name."
}

variable "scenes_bucket_name" {
  type        = string
  description = "Name of the S3 bucket where generated scenes are saved."
}

variable "cdn_domain" {
  type        = string
  description = "Domain name of the CloudFront CDN distribution."
}
