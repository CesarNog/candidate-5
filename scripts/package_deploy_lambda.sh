#!/bin/bash

# Navigate to the directory containing the Lambda function code
cd "$(dirname "$0")"
cd ../modules/lambda/lambda_function/code/

zip -r ./candidate-5-lambda.zip . -i index.js

if [ $? -ne 0 ]; then
    echo "Failed to create ZIP file. Check for errors in the ZIP command."
    exit 1
fi

# Upload the ZIP file to the S3 bucket
aws s3 cp ./candidate-5-lambda.zip s3://candidate-5-bucket/ --output json

# Check the status of the AWS S3 copy command
if [ $? -eq 0 ]; then
    echo "Lambda function code has been successfully packaged and uploaded to S3 bucket."

    # Update the Lambda function code
    update_output=$(aws lambda update-function-code \
        --function-name candidate-5-InventoryLambdaFunction \
        --s3-bucket candidate-5-bucket \
        --s3-key candidate-5-lambda.zip \
        --output json)

    # Check if the update was successful
    if echo "$update_output" | grep -q '"FunctionName"'; then
        echo "Lambda function code has been successfully updated."
    else
        echo "Failed to update Lambda function code. Check AWS CLI outputs for details."
        exit 1
    fi
else
    echo "Failed to upload ZIP file to S3. Check AWS CLI outputs for details."
    exit 1
fi
