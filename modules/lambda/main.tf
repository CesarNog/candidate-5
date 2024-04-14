resource "aws_lambda_function" "this" {  
  function_name = var.function_name
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  s3_bucket     = var.lambda_s3_bucket
  s3_key        = var.lambda_s3_key
  role          = var.iam_role_arn
  timeout = 300
  memory_size = 128

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = var.dynamodb_table_name
    }
  }
}
