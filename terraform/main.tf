terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {
    bucket         = "YOUR_TERRAFORM_STATE_BUCKET"   # แก้ตรงนี้
    key            = "terraform/dashboard/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "terraform-lock"
    profile        = "YOUR_AWS_PROFILE"              # แก้ตรงนี้
  }
}

provider "aws" {
  region  = "ap-southeast-1"
  profile = "YOUR_AWS_PROFILE"                       # แก้ตรงนี้
}

locals {
  name       = "YOUR_PROJECT_NAME"                   # แก้ตรงนี้ เช่น spvi-prod-dashboard
  account_id = "YOUR_ACCOUNT_ID"                     # แก้ตรงนี้
  region     = "ap-southeast-1"
}
