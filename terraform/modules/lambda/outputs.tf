output "image_gen_function_name" {
  value       = aws_lambda_function.image_gen.function_name
  description = "Name of the Image Generator Lambda function."
}

output "image_gen_function_url" {
  value       = aws_lambda_function_url.image_gen_url.function_url
  description = "HTTP POST Function URL for the Image Generator Lambda."
}

output "github_committer_function_name" {
  value       = aws_lambda_function.github_committer.function_name
  description = "Name of the GitHub Committer Lambda function."
}

output "github_committer_function_arn" {
  value       = aws_lambda_function.github_committer.arn
  description = "ARN of the GitHub Committer Lambda function."
}
