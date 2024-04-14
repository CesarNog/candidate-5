variable "region" {
  type        = string
  default     = "eu-north-1"
  description = "AWS region where the resources will be created"
}

variable "environment" {
  default = "dev"
  type        = string
  description = "The deployment environment (e.g., dev, prod)"
}

variable "base_name" {
  default = "dev"
  type        = string
  description = "The base name of the deployment resources"
}

variable "username" {
  default = "candidate-5"
  type        = string
  description = "Username to prefix DynamoDB table names and other resources"
}

variable "lambda_function_name" {
  type        = string
  default     = "candidate-5-InventoryLambdaFunction"
  description = "Name of the AWS Lambda function to create"
}

variable "dynamodb_table_name_suffix" {
  type        = string
  default     = "inventory"
  description = "Suffix for the DynamoDB table name, used with the username prefix"
}

variable "lambda_s3_bucket" {
  type        = string
  default = "candidate-5-bucket"
  description = "S3 bucket name where the Lambda function code is stored"
}

variable "lambda_s3_key" {
  type        = string
  default = "candidate-5-lambda.zip"
  description = "S3 key for the Lambda function code ZIP file"
}
