# AWS Dashboard Template

Pattern สำหรับสร้าง internal dashboard บน AWS (S3 + Lambda + API Gateway)

## โครงสร้างโปรเจค

```
dashboard-aws-template/
├── SETUP.md             # คู่มือ setup ฉบับเต็ม (อ่านนี้ก่อน)
├── README.md            # overview + pattern guide
├── terraform/
│   ├── main.tf          # provider, backend, locals
│   ├── s3.tf            # S3 bucket (ชื่อ = custom domain)
│   ├── lambda.tf        # Lambda function + variables
│   ├── apigateway.tf    # API Gateway → Lambda
│   ├── iam.tf           # IAM role + policy
│   ├── outputs.tf       # website_url, api_url, s3_bucket
│   └── index.py         # Lambda handler (Python 3.12)
└── frontend/
    ├── index.html       # Login page
    ├── dashboard.html   # Main dashboard
    ├── register.html    # Register user (admin only)
    ├── users.html       # User management (admin only)
    └── js/
        ├── api.js       # API_URL + helper functions
        ├── auth.js      # Login logic
        └── dashboard.js # Dashboard logic + render
```

---

## Services ที่รองรับแล้ว

| Service | List | Action | Admin Only |
|---------|------|--------|------------|
| EC2 | ✅ | Start / Stop | ✅ |
| ECS | ✅ | Start / Stop (desiredCount) | ✅ |
| RDS | ✅ | Start / Stop | ✅ |
| Lambda | ✅ | Invoke | ✅ |
| CodeBuild | ✅ | Start Build + History | ✅ |
| CloudWatch Alarms | ✅ | — | ❌ |
| S3 Bucket Sizes | ✅ | — | ❌ |
| Cost Explorer | ✅ | — | ❌ |
| ECR Images | ✅ | — | ❌ |

---

## Quick Start

```bash
# 1. Copy template
cp -r dashboard-aws-template dashboard-aws-MY_PROJECT
cd dashboard-aws-MY_PROJECT

# 2. แก้ค่าใน terraform/main.tf, s3.tf, lambda.tf, frontend/dashboard.html
#    ดูรายละเอียดใน SETUP.md

# 3. Deploy
cd terraform
zip -j lambda.zip index.py
terraform init
terraform apply -var="dashboard_password=xxx" -var="jwt_secret=xxx"

# 4. แก้ API_URL ใน frontend/js/api.js ด้วย api_url จาก terraform output
# 5. Sync frontend
aws s3 sync ../frontend/ s3://YOUR_BUCKET/ --profile YOUR_PROFILE --delete
```

---

## Cloudflare DNS

```
Type:   CNAME
Name:   subdomain
Target: YOUR_BUCKET_NAME.s3-website-ap-southeast-1.amazonaws.com
Proxy:  DNS only (grey cloud) ← สำคัญมาก
```

---

## เพิ่ม Service ใหม่

1. เพิ่ม boto3 client ใน `terraform/index.py`
2. เพิ่ม route `if path == "/xxx"` ใน `handler()`
3. เพิ่ม IAM permission ใน `terraform/iam.tf`
4. เพิ่ม section card ใน `frontend/dashboard.html`
5. เพิ่ม `loadXxx()` function ใน `frontend/js/dashboard.js`
6. Redeploy: zip lambda → terraform apply → s3 sync

ดู step-by-step พร้อม code examples ใน **SETUP.md**
