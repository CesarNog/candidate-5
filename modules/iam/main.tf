resource "aws_iam_role" "lambda_execution_role" {
  name = "candidate-5-lambda_execution_role_${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Effect = "Allow"
        Sid = ""
      },
    ]
  })
}

resource "aws_iam_policy" "lambda_policy" {
  name        = "candidate-5-lambda_policy_${var.environment}"
  description = "IAM policy for Lambda to access EC2, DynamoDB, RDS, S3, and AWS Config"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "ec2:*",
          "dynamodb:*",
          "lambda:*",
          "rds:*",
          "s3:*",
          "config:*",
          "iam:*",
          "logs:*",
          "elasticloadbalancing:*"
        ],
        Resource = "*",
        Effect   = "Allow"
      },
      {
        Action   = "config:DescribeComplianceByConfigRule",
        Resource = "arn:aws:config:*:*:config-rule/*",
        Effect   = "Allow"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_policy_attachment" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_policy.arn
}
