import json
import os
import boto3
import hmac
import hashlib
import base64
import time

REGION = "ap-southeast-1"
ADMIN_USERNAME = os.environ.get("DASHBOARD_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("DASHBOARD_PASSWORD", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "secret")
EC2_IDS = [i for i in os.environ.get("EC2_IDS", "").split(",") if i]
ECS_CLUSTERS = [c for c in os.environ.get("ECS_CLUSTERS", "").split(",") if c]
RDS_CLUSTERS = [c for c in os.environ.get("RDS_CLUSTER", "").split(",") if c]
USERS_PARAM = "/dashboard-aws/users"

ec2 = boto3.client("ec2", region_name=REGION)
ecs = boto3.client("ecs", region_name=REGION)
rds = boto3.client("rds", region_name=REGION)
lmb = boto3.client("lambda", region_name=REGION)
ssm = boto3.client("ssm", region_name=REGION)
cb = boto3.client("codebuild", region_name=REGION)
cw = boto3.client("cloudwatch", region_name=REGION)
s3c = boto3.client("s3", region_name=REGION)
s3r = boto3.resource("s3")
ce = boto3.client("ce", region_name="us-east-1")
ecr = boto3.client("ecr", region_name=REGION)


def hash_pw(pw):
    return hmac.new(JWT_SECRET.encode(), pw.encode(), hashlib.sha256).hexdigest()


def get_users():
    try:
        resp = ssm.get_parameter(Name=USERS_PARAM, WithDecryption=True)
        return json.loads(resp["Parameter"]["Value"])
    except Exception:
        users = {ADMIN_USERNAME: {"password": hash_pw(ADMIN_PASSWORD), "role": "admin"}}
        save_users(users)
        return users


def save_users(users):
    ssm.put_parameter(Name=USERS_PARAM, Value=json.dumps(users), Type="SecureString", Overwrite=True)


def make_token(username, role):
    payload = f"{username}:{role}:{int(time.time()) + 28800}"
    sig = hmac.new(JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.b64encode(f"{payload}:{sig}".encode()).decode()


def verify_token(token):
    try:
        decoded = base64.b64decode(token).decode()
        parts = decoded.rsplit(":", 1)
        payload, sig = parts[0], parts[1]
        username, role, exp = payload.split(":")
        if int(exp) < time.time():
            return None, None
        expected = hmac.new(JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        return (username, role) if hmac.compare_digest(sig, expected) else (None, None)
    except Exception:
        return None, None


def cors(body, status=200):
    return {
        "statusCode": status,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body),
    }


def get_status():
    ec2_list = []
    try:
        for r in ec2.describe_instances(InstanceIds=EC2_IDS)["Reservations"]:
            for i in r["Instances"]:
                name = next((t["Value"] for t in i.get("Tags", []) if t["Key"] == "Name"), i["InstanceId"])
                ec2_list.append({"id": i["InstanceId"], "name": name, "type": i.get("InstanceType", ""), "state": i["State"]["Name"]})
    except Exception as e:
        ec2_list.append({"id": "error", "name": str(e), "state": "error"})

    ecs_list = []
    for cluster in ECS_CLUSTERS:
        try:
            all_arns = []
            paginator = ecs.get_paginator('list_services')
            for page in paginator.paginate(cluster=cluster):
                all_arns.extend(page['serviceArns'])
            if all_arns:
                for i in range(0, len(all_arns), 10):
                    batch = all_arns[i:i+10]
                    for s in ecs.describe_services(cluster=cluster, services=batch)["services"]:
                        ecs_list.append({"cluster": cluster, "name": s["serviceName"], "running": s["runningCount"], "desired": s["desiredCount"]})
        except Exception:
            pass

    rds_list = []
    for cluster_id in RDS_CLUSTERS:
        try:
            for c in rds.describe_db_clusters(DBClusterIdentifier=cluster_id)["DBClusters"]:
                rds_list.append({"id": c["DBClusterIdentifier"], "status": c["Status"]})
        except Exception as e:
            rds_list.append({"id": cluster_id, "status": str(e)})

    return {"ec2": ec2_list, "ecs": ecs_list, "rds": rds_list}


def handler(event, context):
    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")

    if method == "OPTIONS":
        return cors({})

    if path == "/login" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        users = get_users()
        u = users.get(body.get("username", ""))
        if u and u["password"] == hash_pw(body.get("password", "")):
            return cors({"token": make_token(body["username"], u["role"]), "role": u["role"]})
        return cors({"error": "Invalid credentials"}, 401)

    if path == "/register" and method == "POST":
        auth = (event.get("headers") or {}).get("Authorization", "")
        _, caller_role = verify_token(auth.replace("Bearer ", ""))
        if caller_role != "admin":
            return cors({"error": "Admin only"}, 403)
        body = json.loads(event.get("body") or "{}")
        username = body.get("username", "").strip()
        password = body.get("password", "")
        role = body.get("role", "readonly")
        if not username or not password:
            return cors({"error": "Username and password required"}, 400)
        if role not in ("admin", "readonly"):
            return cors({"error": "Role must be admin or readonly"}, 400)
        users = get_users()
        if username in users:
            return cors({"error": "Username already exists"}, 400)
        users[username] = {"password": hash_pw(password), "role": role}
        save_users(users)
        return cors({"ok": True})

    auth = (event.get("headers") or {}).get("Authorization", "")
    username, role = verify_token(auth.replace("Bearer ", ""))
    if not username:
        return cors({"error": "Unauthorized"}, 401)

    if path == "/status" and method == "GET":
        return cors(get_status())

    if path == "/lambda/list" and method == "GET":
        funcs = lmb.list_functions()["Functions"]
        return cors([{"name": f["FunctionName"], "runtime": f.get("Runtime", ""), "state": f.get("State", "Active")} for f in funcs])

    if role != "admin":
        return cors({"error": "Forbidden: read-only access"}, 403)

    if path == "/users" and method == "GET":
        users = get_users()
        return cors([{"username": u, "role": v["role"]} for u, v in users.items()])

    if path == "/users/delete" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        target = body.get("username")
        if target == username:
            return cors({"error": "Cannot delete yourself"}, 400)
        users = get_users()
        if target not in users:
            return cors({"error": "User not found"}, 404)
        del users[target]
        save_users(users)
        return cors({"ok": True})

    if path == "/users/update" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        target = body.get("username")
        users = get_users()
        if target not in users:
            return cors({"error": "User not found"}, 404)
        if body.get("role"):
            users[target]["role"] = body["role"]
        if body.get("password"):
            users[target]["password"] = hash_pw(body["password"])
        save_users(users)
        return cors({"ok": True})

    if path == "/ec2/action" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        (ec2.start_instances if body["action"] == "start" else ec2.stop_instances)(InstanceIds=[body["id"]])
        return cors({"ok": True})

    if path == "/ecs/action" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        ecs.update_service(cluster=body["cluster"], service=body["service"], desiredCount=1 if body["action"] == "start" else 0)
        return cors({"ok": True})

    if path == "/rds/action" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        try:
            cluster_id = body.get("id", RDS_CLUSTERS[0] if RDS_CLUSTERS else "")
            (rds.start_db_cluster if body["action"] == "start" else rds.stop_db_cluster)(DBClusterIdentifier=cluster_id)
        except Exception as e:
            return cors({"error": str(e)}, 400)
        return cors({"ok": True})

    if path == "/lambda/invoke" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        resp = lmb.invoke(FunctionName=body["name"], Payload=json.dumps(body.get("payload", {})))
        return cors({"status": resp["StatusCode"], "result": json.loads(resp["Payload"].read())})

    if path == "/codebuild/projects" and method == "GET":
        names = cb.list_projects(sortBy="NAME")["projects"]
        if not names:
            return cors([])
        projects = cb.batch_get_projects(names=names)["projects"]
        return cors([{"name": p["name"], "source": p.get("source", {}).get("type", ""), "lastModified": str(p.get("lastModified", ""))} for p in projects])

    if path == "/codebuild/history" and method == "GET":
        project = (event.get("queryStringParameters") or {}).get("project")
        if not project:
            return cors({"error": "project required"}, 400)
        build_ids = cb.list_builds_for_project(projectName=project, sortOrder="DESCENDING")["ids"][:10]
        if not build_ids:
            return cors([])
        builds = cb.batch_get_builds(ids=build_ids)["builds"]
        return cors([{
            "id": b["id"].split(":")[-1],
            "status": b["buildStatus"],
            "startTime": str(b.get("startTime", "")),
            "endTime": str(b.get("endTime", "")),
            "initiator": b.get("initiator", ""),
        } for b in builds])

    if path == "/codebuild/start" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        resp = cb.start_build(projectName=body["project"])
        return cors({"buildId": resp["build"]["id"]})

    if path == "/cloudwatch/alarms" and method == "GET":
        alarms = cw.describe_alarms()["MetricAlarms"]
        return cors([{
            "name": a["AlarmName"],
            "state": a["StateValue"],
            "metric": a["MetricName"],
            "namespace": a["Namespace"],
            "reason": a.get("StateReason", ""),
        } for a in alarms])

    if path == "/s3/sizes" and method == "GET":
        buckets = s3c.list_buckets()["Buckets"]
        result = []
        for b in buckets:
            name = b["Name"]
            try:
                size = cw.get_metric_statistics(
                    Namespace="AWS/S3",
                    MetricName="BucketSizeBytes",
                    Dimensions=[
                        {"Name": "BucketName", "Value": name},
                        {"Name": "StorageType", "Value": "StandardStorage"},
                    ],
                    StartTime=__import__("datetime").datetime.utcnow() - __import__("datetime").timedelta(days=2),
                    EndTime=__import__("datetime").datetime.utcnow(),
                    Period=86400,
                    Statistics=["Average"],
                )
                dp = size.get("Datapoints", [])
                bytes_val = int(dp[-1]["Average"]) if dp else 0
            except Exception:
                bytes_val = 0
            result.append({"name": name, "bytes": bytes_val})
        return cors(result)

    if path == "/cost/monthly" and method == "GET":
        import datetime
        today = datetime.date.today()
        start = today.replace(day=1).isoformat()
        end = today.isoformat()
        resp = ce.get_cost_and_usage(
            TimePeriod={"Start": start, "End": end},
            Granularity="MONTHLY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )
        results = resp.get("ResultsByTime", [{}])[0].get("Groups", [])
        total = sum(float(g["Metrics"]["UnblendedCost"]["Amount"]) for g in results)
        services = sorted(
            [{"service": g["Keys"][0], "amount": float(g["Metrics"]["UnblendedCost"]["Amount"])} for g in results],
            key=lambda x: x["amount"], reverse=True
        )
        return cors({"total": round(total, 2), "currency": "USD", "period": f"{start} → {end}", "services": services[:15]})

    if path == "/ecr/images" and method == "GET":
        repos = ecr.describe_repositories()["repositories"]
        result = []
        for r in repos:
            try:
                images = ecr.describe_images(
                    repositoryName=r["repositoryName"],
                    filter={"tagStatus": "TAGGED"},
                )["imageDetails"]
                images.sort(key=lambda x: x.get("imagePushedAt", ""), reverse=True)
                latest = images[:3] if images else []
                result.append({
                    "repo": r["repositoryName"],
                    "tags": [t for img in latest for t in img.get("imageTags", [])],
                    "pushedAt": str(latest[0].get("imagePushedAt", "")) if latest else "",
                    "sizeMB": round(latest[0].get("imageSizeInBytes", 0) / 1024 / 1024, 1) if latest else 0,
                })
            except Exception:
                result.append({"repo": r["repositoryName"], "tags": [], "pushedAt": "", "sizeMB": 0})
        return cors(result)

    return cors({"error": "Not found"}, 404)
