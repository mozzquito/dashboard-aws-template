resource "aws_iam_role" "lambda" {
  name = "${local.name}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "lambda" {
  name = "DashboardPolicy"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["logs:*"], Resource = "*" },
      { Effect = "Allow", Action = ["ec2:DescribeInstances", "ec2:StartInstances", "ec2:StopInstances"], Resource = "*" },
      { Effect = "Allow", Action = ["ecs:DescribeClusters", "ecs:ListServices", "ecs:DescribeServices", "ecs:UpdateService"], Resource = "*" },
      { Effect = "Allow", Action = ["rds:DescribeDBClusters", "rds:StartDBCluster", "rds:StopDBCluster"], Resource = "*" },
      { Effect = "Allow", Action = ["lambda:ListFunctions", "lambda:InvokeFunction"], Resource = "*" },
      { Effect = "Allow", Action = ["codebuild:ListProjects", "codebuild:BatchGetProjects", "codebuild:ListBuildsForProject", "codebuild:BatchGetBuilds", "codebuild:StartBuild"], Resource = "*" },
      { Effect = "Allow", Action = ["ssm:GetParameter", "ssm:PutParameter"], Resource = "arn:aws:ssm:${local.region}:${local.account_id}:parameter/dashboard-aws/*" }
    ]
  })
}
