variable "aws_region" {
  type        = string
  default     = "eu-west-2"
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
