output "lambda_function_arn" {
  value = aws_lambda_function.this.arn
  description = "The ARN of the Lambda function."
}
