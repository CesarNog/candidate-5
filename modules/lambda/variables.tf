variable "environment" {
  default = "dev"
  description = "The name of the Ennvironment"
}

variable "function_name" {
  description = "The name of the Lambda function"
}

variable "lambda_s3_bucket" {
  description = "The S3 bucket containing the Lambda function code"
}

variable "lambda_s3_key" {
  description = "The S3 key for the Lambda function code object"
}

variable "iam_role_arn" {
  type        = string
  description = "ARN of the IAM role for Lambda execution"
}

variable "dynamodb_table_name" {
  type        = string
  default = "candidate-5-inventory"
  description = "Name of the DynamoDB table"
}
