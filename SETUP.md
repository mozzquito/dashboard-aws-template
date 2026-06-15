# AWS Dashboard Template

Internal dashboard สำหรับ monitor และ control AWS resources ผ่าน web browser  
Stack: **S3 (static web) + API Gateway + Lambda (Python) + SSM**

---

## โครงสร้างโปรเจค

```
dashboard-aws-template/
├── README.md
├── terraform/
│   ├── main.tf          → provider, backend S3, locals (ชื่อ/account/region)
│   ├── s3.tf            → S3 bucket สำหรับ host frontend (ชื่อ bucket = custom domain)
│   ├── lambda.tf        → Lambda function + env vars (ECS/EC2/RDS targets)
│   ├── apigateway.tf    → API Gateway REST → Lambda proxy
│   ├── iam.tf           → IAM role + policy สำหรับ Lambda
│   ├── outputs.tf       → output: website_url, api_url, s3_bucket
│   └── index.py         → Lambda handler ทุก API route อยู่ที่นี่
└── frontend/
    ├── index.html       → หน้า Login
    ├── dashboard.html   → หน้าหลัก (EC2/ECS/RDS/Lambda/CodeBuild)
    ├── register.html    → เพิ่ม user (admin only)
    ├── users.html       → จัดการ user (admin only)
    └── js/
        ├── api.js       → API_URL + fetch helpers
        ├── auth.js      → login / redirect logic
        └── dashboard.js → render ทุก section + actions
```

---

## สิ่งที่มีให้ Out of the Box

| Service | ดูข้อมูล | Action | สิทธิ์ |
|---------|----------|--------|--------|
| EC2 | name, type, state | Start / Stop | Admin |
| ECS | cluster, service, running/desired | Start / Stop | Admin |
| RDS | cluster, status | Start / Stop | Admin |
| Lambda | name, runtime, state | Invoke | Admin |
| CodeBuild | projects, build history | Start Build | Admin |
| Users | username, role | Add / Delete / Update | Admin |

**Roles:** `admin` (full access) · `readonly` (ดูได้อย่างเดียว)  
**Auth:** JWT แบบ custom (hmac-sha256) เก็บใน SSM Parameter Store

---

## Checklist สิ่งที่ต้องแก้เมื่อ copy template

| ไฟล์ | ค่าที่ต้องแก้ |
|------|--------------|
| `terraform/main.tf` | `YOUR_PROJECT_NAME`, `YOUR_ACCOUNT_ID`, `YOUR_AWS_PROFILE`, `YOUR_TERRAFORM_STATE_BUCKET` |
| `terraform/s3.tf` | `YOUR_CUSTOM_DOMAIN` |
| `terraform/lambda.tf` | `ECS_CLUSTERS`, `EC2_IDS`, `RDS_CLUSTER` |
| `frontend/dashboard.html` | `YOUR_ACCOUNT_ID` (บรรทัด navbar) |
| `frontend/js/api.js` | `YOUR_API_GW_ID` (ได้หลัง `terraform apply`) |

---

## Setup ใหม่ (Step by Step)

### ขั้นตอนที่ 1 — Copy template

```bash
cp -r dashboard-aws-template dashboard-aws-YOURPROJECT
cd dashboard-aws-YOURPROJECT
```

---

### ขั้นตอนที่ 2 — แก้ `terraform/main.tf`

```hcl
locals {
  name       = "YOURPROJECT-dashboard"   # ← แก้
  account_id = "123456789012"            # ← แก้ AWS Account ID
  region     = "ap-southeast-1"         # ← แก้ถ้าใช้ region อื่น
}
```

และแก้ backend:
```hcl
backend "s3" {
  bucket  = "your-terraform-state-bucket"  # ← แก้
  profile = "your-aws-profile"             # ← แก้
  ...
}
```

---

### ขั้นตอนที่ 3 — แก้ `terraform/s3.tf`

```hcl
resource "aws_s3_bucket" "frontend" {
  bucket = "your-subdomain.yourdomain.com"  # ← แก้ให้ตรงกับ custom domain
}
```

> ⚠️ ชื่อ bucket **ต้องตรงกับ** domain ที่จะชี้มา เช่น `spvi-prod.harmonyx.works`

---

### ขั้นตอนที่ 4 — แก้ `terraform/lambda.tf`

```hcl
environment {
  variables = {
    ECS_CLUSTERS = "cluster-a,cluster-b"          # ← แก้ ชื่อ ECS cluster คั่นด้วย ,
    EC2_IDS      = "i-0abc123,i-0def456"          # ← แก้ Instance ID คั่นด้วย ,
    RDS_CLUSTER  = "my-rds-cluster"               # ← แก้ ชื่อ RDS cluster คั่นด้วย ,
  }
}
```

---

### ขั้นตอนที่ 5 — Deploy

```bash
cd terraform

# package Lambda
zip -j lambda.zip index.py

# init (ครั้งแรกเท่านั้น)
terraform init

# apply
terraform apply \
  -var="dashboard_password=YOUR_PASSWORD" \
  -var="jwt_secret=YOUR_JWT_SECRET"
```

หลัง apply จะได้ output:
```
api_url     = "https://xxxxxxxxxx.execute-api.ap-southeast-1.amazonaws.com/prod"
website_url = "http://your-subdomain.yourdomain.com.s3-website-ap-southeast-1.amazonaws.com"
s3_bucket   = "your-subdomain.yourdomain.com"
```

---

### ขั้นตอนที่ 6 — แก้ `frontend/js/api.js`

```javascript
const API_URL = 'https://xxxxxxxxxx.execute-api.ap-southeast-1.amazonaws.com/prod';
// ← ใส่ api_url จาก terraform output
```

---

### ขั้นตอนที่ 7 — Sync frontend ขึ้น S3

```bash
aws s3 sync ../frontend/ s3://your-subdomain.yourdomain.com/ \
  --profile your-aws-profile \
  --delete
```

---

### ขั้นตอนที่ 8 — ตั้ง DNS (Cloudflare)

| Field | ค่า |
|-------|-----|
| Type | CNAME |
| Name | `your-subdomain` |
| Target | `your-subdomain.yourdomain.com.s3-website-ap-southeast-1.amazonaws.com` |
| Proxy | **DNS only (grey cloud)** ← ต้องปิด proxy |

---

### ขั้นตอนที่ 9 — เข้าใช้งาน

เปิด `http://your-subdomain.yourdomain.com`

- **Username:** `admin`
- **Password:** ค่าที่ใส่ใน `-var="dashboard_password=..."`

> หาก login ไม่ได้ครั้งแรก ให้ลบ SSM parameter แล้วลองใหม่:
> ```bash
> aws ssm delete-parameter \
>   --name "/dashboard-aws/users" \
>   --profile your-aws-profile \
>   --region ap-southeast-1
> ```

---

## เพิ่ม AWS Service ใหม่

### 1. เพิ่ม boto3 client ใน `terraform/index.py`

```python
cb = boto3.client("codebuild", region_name=REGION)
```

### 2. เพิ่ม route ใน `handler()` ใน `terraform/index.py`

```python
if path == "/myservice/list" and method == "GET":
    data = myservice.list_xxx()
    return cors([...])
```

### 3. เพิ่ม IAM permission ใน `terraform/iam.tf`

```hcl
{ Effect = "Allow", Action = ["myservice:ListXxx", "myservice:GetXxx"], Resource = "*" }
```

### 4. เพิ่ม section ใน `frontend/dashboard.html`

```html
<section class="card bg-gray-900/60 backdrop-blur border border-gray-700/30 rounded-2xl overflow-hidden">
  <div class="px-6 py-4 border-b border-gray-700/30 flex items-center gap-3 cursor-pointer" onclick="toggle('myservice')">
    <div class="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center text-sm">🔧</div>
    <h2 class="font-semibold">My Service</h2>
    <span id="myserviceCount" class="text-xs bg-gray-700/50 px-2 py-0.5 rounded-full text-gray-400"></span>
    <span class="ml-auto text-gray-400" id="myserviceArrow">▼</span>
  </div>
  <div id="myserviceTable" class="p-4 text-gray-400 text-sm">Loading...</div>
</section>
```

### 5. เพิ่ม load function ใน `frontend/js/dashboard.js`

```javascript
async function loadMyService() {
  const data = await apiCall('/myservice/list');
  document.getElementById('myserviceCount').textContent = `${data.length}`;
  document.getElementById('myserviceTable').innerHTML = `<table>...</table>`;
}
loadMyService();
```

### 6. Redeploy

```bash
cd terraform && zip -j lambda.zip index.py
terraform apply -var="dashboard_password=xxx" -var="jwt_secret=xxx"
aws s3 sync ../frontend/ s3://YOUR_BUCKET/ --profile YOUR_PROFILE --delete
```

---

## IAM Permissions ที่มีแล้ว

```
logs:*
ec2: DescribeInstances, StartInstances, StopInstances
ecs: DescribeClusters, ListServices, DescribeServices, UpdateService
rds: DescribeDBClusters, StartDBCluster, StopDBCluster
lambda: ListFunctions, InvokeFunction
codebuild: ListProjects, BatchGetProjects, ListBuildsForProject, BatchGetBuilds, StartBuild
ssm: GetParameter, PutParameter (scoped to /dashboard-aws/*)
```

---

## Auth Flow

```
Login → Lambda verify password → สร้าง JWT (base64 hmac-sha256, expire 8h)
     → เก็บใน localStorage
     → ทุก request ส่ง Authorization: Bearer <token>
     → Lambda verify token ทุก request
```

Users เก็บใน SSM `/dashboard-aws/users` เป็น JSON encrypted (SecureString)
