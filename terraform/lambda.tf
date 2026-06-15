variable "dashboard_username" {
  default = "admin"
}

variable "dashboard_password" {
  sensitive = true
}

variable "jwt_secret" {
  sensitive = true
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name}-api"
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  runtime          = "python3.12"
  timeout          = 30
  filename         = "${path.module}/lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda.zip")

  environment {
    variables = {
      DASHBOARD_USERNAME = var.dashboard_username
      DASHBOARD_PASSWORD = var.dashboard_password
      JWT_SECRET         = var.jwt_secret
      AWS_ACCOUNT_ID     = local.account_id
      ECS_CLUSTERS = "cluster-1,cluster-2"           # แก้ตรงนี้
      EC2_IDS      = "i-xxx,i-yyy"                   # แก้ตรงนี้
      RDS_CLUSTER  = "my-cluster"                    # แก้ตรงนี้
    }
  }

  tags = { Name = "${local.name}-api" }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/*"
}
