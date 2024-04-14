module "iam" {
  source      = "./modules/iam"
  environment = var.environment
  base_name = var.base_name
}

module "s3_lambda_code" {
  source      = "./modules/s3"
  environment = var.environment
  bucket_name = var.lambda_s3_bucket
}

module "lambda" {
  source         = "./modules/lambda"
  function_name  = var.lambda_function_name
  lambda_s3_bucket = var.lambda_s3_bucket
  lambda_s3_key    = var.lambda_s3_key
  iam_role_arn = module.iam.lambda_execution_role_arn


  depends_on = [
    module.s3_lambda_code
  ]
}

module "dynamodb_inventory" {
  source = "./modules/dynamodb"
  table_name = "${var.username}-${var.dynamodb_table_name_suffix}"
}

module "dynamodb_issues_reported_by_user" {
  source = "./modules/dynamodb"
  table_name = "${var.username}-issues-reported-by-user"
}
