output "bucket_name" {
  value       = aws_s3_bucket.lambda_code.bucket
  description = "The name of the S3 bucket for Lambda code"
}

output "bucket_arn" {
  value       = aws_s3_bucket.lambda_code.arn
  description = "The ARN of the S3 bucket for Lambda code"
}
