# Candidate-5 Resolution

## Requirements

- **Terraform**: Version 1.8.0. Download or upgrade from the [official Terraform website](https://www.terraform.io/downloads.html).
- **NodeJS**: Version 20.x. Available for download on the [official Node.js website](https://nodejs.org/en/download/).
- **AWS CLI**: Version 2.15.38. Instructions and download link can be found on the [AWS CLI official page](https://aws.amazon.com/cli/).

## How to Run

Follow these steps to set up and deploy the project components:

1. **Initialize Terraform**:
   - Make sure Terraform CLI is installed.
   - Open your prefered terminal.
   - Navigate to the root directory.
   - Run the command `terraform init` to initialize a working directory containing Terraform configuration files.

2. **Apply Terraform Configuration**:
   - After initialization, run the command `terraform apply`.
   - Confirm the execution plan by entering `yes` when prompted. This step will set up the required infrastructure on AWS.

3. **Deploy Lambda Function**:
   - Ensure that the AWS CLI is configured with the appropriate credentials and default region (`eu-north-1`).
   - Run the script `./scripts/package_deploy_lambda.sh`. This script packages the Lambda function code and uploads it to the S3 bucket named `candidate-5-bucket`.

- Lambda Event content for testing purposes:
{
“body”: “{\“userName\”: \“candidate-5\”, \“createAccessKey\”: true, \“issues\”: [\“EC2 instance security groups as inbound and outbound traffic are open for all users\”, \“Found missing MFA of root user and all users\”, \“Add users to security group\”, \“Add permissions boundaries for IAM entities\”, \“EBS volumes are not encrypted\”]}”
}

The latest version was succesfully deployed and tested as candidate-5-InventoryLambdaFunction on eu-north-1:
https://eu-north-1.console.aws.amazon.com/lambda/home?region=eu-north-1#/functions/candidate-5-InventoryLambdaFunction?tab=configure

Feel free to test it using the saved Event:
https://eu-north-1.console.aws.amazon.com/lambda/home?region=eu-north-1#/functions/candidate-5-InventoryLambdaFunction?tab=testing

Note: The deployment is configured to run in the AWS region `eu-north-1`. 
Ensure that your AWS CLI is set to this region, or update the configuration if a different region is preferred.


## Terraform Modules

| Name | Source |
|------|--------|
| [dynamodb_inventory](#module_dynamodb_inventory) | ./modules/dynamodb |
| [dynamodb_issues_reported_by_user](#module_dynamodb_issues_reported_by_user) | ./modules/dynamodb |
| [iam](#module_iam) | ./modules/iam |
| [lambda](#module_lambda) | ./modules/lambda |
| [s3_lambda_code](#module_s3_lambda_code) | ./modules/s3 |


## Terraform Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| [base_name](#input_base_name) | The base name of the deployment resources | `string` | `"dev"` | yes |
| [dynamodb_table_name_suffix](#input_dynamodb_table_name_suffix) | Suffix for the DynamoDB table name, used with the username prefix | `string` | `"inventory"` | yes |
| [environment](#input_environment) | The deployment environment (e.g., dev, prod) | `string` | `"dev"` | yes |
| [lambda_function_name](#input_lambda_function_name) | Name of the AWS Lambda function to create | `string` | `"candidate-5-InventoryLambdaFunction"` | yes |
| [lambda_s3_bucket](#input_lambda_s3_bucket) | S3 bucket name where the Lambda function code is stored | `string` | `"candidate-5-bucket"` | yes |
| [lambda_s3_key](#input_lambda_s3_key) | S3 key for the Lambda function code ZIP file | `string` | `"candidate-5-lambda.zip"` | yes |
| [region](#input_region) | AWS region where the resources will be created | `string` | `"eu-north-1"` | yes |
| [username](#input_username) | Username to prefix DynamoDB table names and other resources | `string` | `"candidate-5"` | yes |

## Terraform Outputs

| Name | Description |
|------|-------------|
| [dynamodb_table_arn](#output_dynamodb_table_arn) | ARN of the DynamoDB table created in the DynamoDB module |
| [dynamodb_table_name](#output_dynamodb_table_name) | Table name of DynamoDB inventory |
| [lambda_function_arn](#output_lambda_function_arn) | ARN of Lambda function |
