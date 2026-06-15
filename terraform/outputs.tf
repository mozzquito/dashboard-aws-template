output "website_url" {
  value = "http://${aws_s3_bucket.frontend.bucket}.s3-website-${local.region}.amazonaws.com"
}

output "api_url" {
  value = aws_api_gateway_deployment.main.invoke_url
}

output "s3_bucket" {
  value = aws_s3_bucket.frontend.bucket
}
