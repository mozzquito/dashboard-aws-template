# AWS Dashboard Template

Pattern สำหรับสร้าง internal dashboard บน AWS (S3 + Lambda + API Gateway)

## โครงสร้างโปรเจค

```
dashboard-aws-template/
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

## เมื่อสร้าง Dashboard ใหม่

### 1. Copy template นี้

```bash
cp -r dashboard-aws-template dashboard-aws-MY_PROJECT
cd dashboard-aws-MY_PROJECT
```

### 2. แก้ `terraform/main.tf`

| ค่า | เปลี่ยนเป็น |
|-----|-------------|
| `local.name` | ชื่อ project เช่น `spvi-prod-dashboard` |
| `local.account_id` | AWS Account ID |
| `local.region` | region เช่น `ap-southeast-1` |
| `backend.bucket` | S3 bucket สำหรับ terraform state |
| `backend.profile` | AWS profile |
| `provider.profile` | AWS profile |

### 3. แก้ `terraform/s3.tf`

```hcl
bucket = "YOUR_CUSTOM_DOMAIN"   # เช่น spvi-prod.harmonyx.works
```

> ชื่อ bucket **ต้องตรงกับ** custom domain ที่ชี้มา (Cloudflare CNAME DNS only)

### 4. แก้ `terraform/lambda.tf`

เพิ่ม/แก้ environment variables:

```hcl
ECS_CLUSTERS = "cluster-1,cluster-2"
EC2_IDS      = "i-xxx,i-yyy"
RDS_CLUSTER  = "my-cluster"
```

### 5. เพิ่ม AWS Service ใหม่ใน `terraform/index.py`

**ขั้นตอน:**
1. เพิ่ม boto3 client บรรทัดต้นไฟล์
2. เพิ่ม function `get_xxx()` สำหรับดึงข้อมูล
3. เพิ่ม route `if path == "/xxx"` ใน `handler()`
4. เพิ่ม IAM permission ใน `iam.tf`

**ตัวอย่าง เพิ่ม CodeBuild:**
```python
# 1. เพิ่ม client
cb = boto3.client("codebuild", region_name=REGION)

# 2. เพิ่ม route ใน handler()
if path == "/codebuild/projects":
    names = cb.list_projects()["projects"]
    ...
```

```hcl
# 3. เพิ่มใน iam.tf
{ Effect = "Allow", Action = ["codebuild:ListProjects", ...], Resource = "*" }
```

### 6. เพิ่ม Section ใน Frontend

**`frontend/dashboard.html`** — เพิ่ม section card:
```html
<section class="card bg-gray-900/60 ...">
  <div class="px-6 py-4 border-b ..." onclick="toggle('myservice')">
    <div class="w-8 h-8 bg-purple-500/20 ...">🔨</div>
    <h2>My Service</h2>
    <span id="myserviceCount" ...></span>
  </div>
  <div id="myserviceTable" ...>Loading...</div>
</section>
```

**`frontend/js/dashboard.js`** — เพิ่ม load function:
```javascript
async function loadMyService() {
  const data = await apiCall('/myservice/list');
  document.getElementById('myserviceCount').textContent = `${data.length}`;
  document.getElementById('myserviceTable').innerHTML = `...`;
}
loadMyService();
```

**`frontend/js/api.js`** — แก้ `API_URL`:
```javascript
const API_URL = 'https://YOUR_API_GW_ID.execute-api.REGION.amazonaws.com/prod';
```

---

## Deploy

```bash
# 1. Package Lambda
cd terraform && zip -j lambda.zip index.py

# 2. Terraform apply
terraform init
terraform apply -var="dashboard_password=xxx" -var="jwt_secret=xxx"

# 3. Sync frontend
aws s3 sync ../frontend/ s3://YOUR_BUCKET/ --profile YOUR_PROFILE --delete
```

## Cloudflare DNS

```
Type:   CNAME
Name:   subdomain
Target: YOUR_BUCKET_NAME.s3-website-ap-southeast-1.amazonaws.com
Proxy:  DNS only (grey cloud) ← สำคัญมาก
```

---

## Services ที่รองรับแล้ว (ใน spvi-dev)

| Service | List | Action | Admin Only |
|---------|------|--------|------------|
| EC2 | ✅ | Start / Stop | ✅ |
| ECS | ✅ | Start / Stop (desiredCount) | ✅ |
| RDS | ✅ | Start / Stop | ✅ |
| Lambda | ✅ | Invoke | ✅ |
| CodeBuild | ✅ | Start Build + History | ✅ |

## เพิ่ม Service ถัดไปที่น่าสนใจ

- [ ] CloudWatch Alarms
- [ ] S3 bucket sizes
- [ ] Cost Explorer (monthly spend)
- [ ] ECR image tags
# dashboard-aws-template
