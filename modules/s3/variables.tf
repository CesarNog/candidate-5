variable "bucket_name" {
  type        = string
  description = "Name of the S3 bucket to store Lambda function code"
}

variable "environment" {
  type        = string
  description = "The deployment environment (e.g., dev, prod)"
}
