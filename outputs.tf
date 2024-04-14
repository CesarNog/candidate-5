output "lambda_function_arn" {
  value = module.lambda.lambda_function_arn
}

output "dynamodb_table_name" {
  value = module.dynamodb_inventory.table_name
}

output "dynamodb_table_arn" {
  value = module.dynamodb_inventory.table_arn
  description = "ARN of the DynamoDB table created in the DynamoDB module"
}
