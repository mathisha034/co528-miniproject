# Getting Started — Alumni Networking Platform

> **CO528 Mini Project** — Cloud-Native Microservices Platform  
> This guide walks a new developer through cloning the project, building all service images,
> deploying the full stack to a local Kubernetes cluster, and running both the web app and the
> complete E2E test suite from scratch.

---

## Table of Contents

1. [What You Are Running](#1-what-you-are-running)
2. [Prerequisites](#2-prerequisites)
3. [Project Structure](#3-project-structure)
4. [One-Time Machine Setup](#4-one-time-machine-setup)
5. [Build All Docker Images](#5-build-all-docker-images)
6. [Deploy Infrastructure](#6-deploy-infrastructure)
7. [Set Up Keycloak](#7-set-up-keycloak)
8. [Inject the JWT Public Key](#8-inject-the-jwt-public-key)
9. [Deploy All Services](#9-deploy-all-services)
10. [Verify the Cluster](#10-verify-the-cluster)
11. [Run the Web App](#11-run-the-web-app)
12. [Run E2E Tests](#12-run-e2e-tests)
13. [Useful Day-to-Day Commands](#13-useful-day-to-day-commands)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What You Are Running

An **alumni networking platform** composed of 8 NestJS microservices, a React/Vite SPA, and a shared infrastructure layer — all deployed on Kubernetes (Minikube for local dev).

| Layer | Components |
|-------|-----------|
| **Frontend** | React + Vite SPA (`web/`) running on `localhost:5173` |
| **API Services** | user · feed · job · event · notification · research · analytics · messaging |
| **Auth** | Keycloak 23 (realm: `miniproject`, roles: `student`, `alumni`, `admin`) |
| **Database** | MongoDB (StatefulSet, single replica) |
| **Cache** | Redis (StatefulSet) |
| **Object Storage** | MinIO (StatefulSet, bucket: `miniproject`) |
| **Ingress** | NGINX Ingress Controller → `http://miniproject.local` |

All inter-service calls are guarded by an internal token (`x-internal-token: miniproject-internal-auth-token`).  
All external API calls go through the NGINX ingress at `http://miniproject.local/api/v1/<service>-service/<path>`.

---

## 2. Prerequisites

Install the following tools before proceeding. Versions listed are the ones the project was built and tested with.

| Tool | Minimum Version | Install |
|------|----------------|---------|
| **Docker** | 24.x | https://docs.docker.com/get-docker/ |
| **Minikube** | 1.32.x | https://minikube.sigs.k8s.io/docs/start/ |
| **kubectl** | 1.28.x | https://kubernetes.io/docs/tasks/tools/ |
| **Node.js** | 20.x LTS | https://nodejs.org/ |
| **npm** | 10.x | bundled with Node.js |

Verify everything is installed:

```bash
docker --version        # Docker version 24.x.x
minikube version        # minikube version: v1.32.x
kubectl version --client  # Client Version: v1.28.x
node --version          # v20.x.x
npm --version           # 10.x.x
```

> **Linux / macOS only.** Windows users should use WSL2 with Ubuntu 22.04.

---

## 3. Project Structure

```
mini_project/
├── services/               # 8 NestJS microservices
│   ├── user-service/         # Auth, profiles           → port 3001
│   ├── feed-service/         # Posts, images, feed      → port 3002
│   ├── job-service/          # Jobs, applications       → port 3003
│   ├── event-service/        # Events, RSVPs            → port 3004
│   ├── notification-service/ # Async inbox              → port 3006
│   ├── research-service/     # Research & docs          → port 3007
│   ├── analytics-service/    # Admin dashboard          → port 3008
│   └── messaging-service/    # Real-time (MVP)          → port 3005
├── web/                    # React + Vite SPA
├── k8s/                    # All Kubernetes manifests
│   ├── kustomization.yaml    # Root — applies everything
│   ├── namespace.yaml
│   ├── ingress.yaml
│   ├── secrets/              # JWT, MinIO, MongoDB, Redis, Keycloak
│   ├── infra/                # MongoDB, Redis, MinIO, Keycloak StatefulSets
│   └── services/             # Per-service Deployment + Service + ConfigMap
├── tests/e2e/              # 10-scenario E2E test suite
│   ├── run_all.sh            # Run full suite
│   ├── setup_personas.sh     # Create test users in Keycloak
│   └── test_s1.js … test_s10.js
├── load-tests/             # k6 load test scripts
├── infra/                  # Prometheus, Loki, Grafana configs
├── terraform/              # IaC for AWS EKS (optional)
└── docs/                   # Architecture, API docs, test results
```

---

## 4. One-Time Machine Setup

### 4a. Start Minikube

The platform requires at least **4 CPUs and 8 GB RAM**. Adjust if your machine has more.

```bash
minikube start \
  --cpus=4 \
  --memory=8192 \
  --disk-size=30g \
  --driver=docker
```

### 4b. Enable Required Addons

```bash
minikube addons enable ingress
minikube addons enable ingress-dns   # optional but makes hostname routing easier
minikube addons enable metrics-server
```

Wait for the ingress controller pod to be ready:

```bash
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
```

### 4c. Add `miniproject.local` to `/etc/hosts`

The ingress uses the hostname `miniproject.local`. You must add it to your machine's hosts file.

```bash
# Get the Minikube IP
minikube ip
# Example output: 192.168.49.2

# Replace any old entry and add current IP (run with sudo)
sudo sed -i '/miniproject\.local/d' /etc/hosts
echo "$(minikube ip)  miniproject.local" | sudo tee -a /etc/hosts
```

Verify:
```bash
ping -c1 miniproject.local
```

> **Note:** If you restart Minikube and the IP changes, re-run both host update commands above.  
> Check the current entry: `grep miniproject.local /etc/hosts`

---

## 5. Build All Docker Images

All service images must be built **inside Minikube's Docker daemon** so that Kubernetes can find them without a container registry. This is a one-time build. Run the block below from the project root.

```bash
# Point your shell's Docker CLI at Minikube's daemon
eval $(minikube docker-env)

# Confirm you are inside Minikube (should show minikube-specific images)
docker images | grep k8s
```

Now build each service. Run these commands from the project root:

```bash
# user-service
docker build --no-cache -t mini_project-user-service:latest \
  services/user-service/

# feed-service
docker build --no-cache -t feed-service:v11 \
  services/feed-service/

# job-service
docker build --no-cache -t job-service:v4 \
  services/job-service/

# event-service
docker build --no-cache -t event-service:v3 \
  services/event-service/

# notification-service
docker build --no-cache -t mini_project-notification-service:latest \
  services/notification-service/

# research-service
docker build --no-cache -t research-service:v8 \
  services/research-service/

# analytics-service
docker build --no-cache -t analytics-service:v4 \
  services/analytics-service/

# messaging-service
docker build --no-cache -t mini_project-messaging-service:v2 \
  services/messaging-service/
```

Each build takes 2–5 minutes (it runs `npm install` + `npm run build` inside the container).

Verify all images exist:

```bash
docker images | grep -E "user-service|feed-service|job-service|event-service|notification|research|analytics|messaging"
```

Expected output — 8 rows including:

```
mini_project-user-service        latest   ...
feed-service                     v11      ...
job-service                      v4       ...
event-service                    v3       ...
mini_project-notification-service latest  ...
research-service                 v8       ...
analytics-service                v4       ...
mini_project-messaging-service   v2       ...
```

---

## 6. Deploy Infrastructure

The infrastructure (MongoDB, Redis, MinIO, Keycloak) must be running before services start because services read secrets and connect to these at startup.

```bash
# From the project root
cd /path/to/mini_project

# 1. Create the namespace
kubectl apply -f k8s/namespace.yaml

# 2. Deploy secrets (uses placeholder JWT key for now — updated in step 8)
kubectl apply -k k8s/secrets/

# 3. Deploy infra StatefulSets
kubectl apply -k k8s/infra/
```

Wait for all infrastructure pods to be ready (this can take 3–5 minutes on first run as images are pulled):

```bash
kubectl get pods -n miniproject -w
```

You are looking for all 4 pods to show `1/1 Running`:

```
keycloak-0            1/1     Running
minio-0               1/1     Running
mongodb-0             1/1     Running
redis-0               1/1     Running
```

Press `Ctrl+C` to stop watching once all are running.

---

## 7. Set Up Keycloak

Keycloak manages all user authentication. You need to create the realm, roles, client, and (optionally) test users inside it.

### 7a. Open a Port-Forward to Keycloak

In a **separate terminal** (keep this running during the setup steps):

```bash
kubectl port-forward -n miniproject svc/keycloak-http 8080:8080
```

Keycloak admin UI is now available at: **http://localhost:8080**  
Admin credentials: **username: `admin`** / **password: `admin`**

> Runtime user login path (web app OIDC flow) should use ingress over HTTPS:
> **https://miniproject.local/auth**
> This prevents browser cookie-policy failures during Keycloak redirect callbacks.

### 7b. Create the Realm, Roles, and Client

The setup script uses `kcadm.sh` inside the Keycloak pod. Run commands in the terminal where you have access to the cluster:

```bash
# Set a shell alias for convenience
KC="kubectl exec -n miniproject keycloak-0 -- /opt/keycloak/bin/kcadm.sh"

# Log in to the admin CLI
$KC config credentials \
  --server http://localhost:8080/auth \
  --realm master \
  --user admin \
  --password admin

# Create the miniproject realm
$KC create realms -s realm=miniproject -s enabled=true

# Create roles
$KC create roles -r miniproject -s name=student
$KC create roles -r miniproject -s name=alumni
$KC create roles -r miniproject -s name=admin

# Create the web client used by the frontend
$KC create clients -r miniproject \
  -s clientId=react-web-app \
  -s enabled=true \
  -s publicClient=true \
  -s directAccessGrantsEnabled=true \
  -s 'redirectUris=["https://miniproject.local/*","https://localhost:5174/*"]' \
  -s 'webOrigins=["https://miniproject.local","https://localhost:5174"]'

# Create the test client used by E2E scripts
$KC create clients -r miniproject \
  -s clientId=e2e-test-client \
  -s enabled=true \
  -s publicClient=true \
  -s directAccessGrantsEnabled=true \
  -s 'redirectUris=["*"]' \
  -s 'webOrigins=["+"]'

# Increase access token lifespan (optional — avoids token expiry during tests)
$KC update realms/miniproject -s accessTokenLifespan=3600
```

### 7c. Create Test Users (required for E2E tests)

```bash
# Student user
$KC create users -r miniproject \
  -s username=ashan \
  -s email=ashan@e2e.test \
  -s enabled=true \
  -s emailVerified=true
$KC set-password -r miniproject --username ashan --new-password Password123!

$KC add-roles -r miniproject \
  --uusername ashan --rolename student

# Alumni user
$KC create users -r miniproject \
  -s username=nimali \
  -s email=nimali@e2e.test \
  -s enabled=true \
  -s emailVerified=true
$KC set-password -r miniproject --username nimali --new-password Password123!

$KC add-roles -r miniproject \
  --uusername nimali --rolename alumni

# Admin user
$KC create users -r miniproject \
  -s username=drraj \
  -s email=dr.raj@e2e.test \
  -s enabled=true \
  -s emailVerified=true
$KC set-password -r miniproject --username drraj --new-password Password123!

$KC add-roles -r miniproject \
  --uusername drraj --rolename admin
```

> **Tip:** You can also do all of the above through the Keycloak web UI at **http://localhost:8080**.  
> Navigate to: Realm `miniproject` → Users / Roles / Clients.

---

## 8. Inject the JWT Public Key

Every NestJS service validates incoming JWTs using the Keycloak realm's **RSA-256 public key**. You must inject this key into the cluster secret.

### 8a. Get the Public Key

With the port-forward still open:

```bash
curl -s http://localhost:8080/auth/realms/miniproject \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['public_key'])" \
  2>/dev/null

# If the above fails, try:
curl -s http://localhost:8080/auth/realms/miniproject/protocol/openid-connect/certs | python3 -m json.tool
```

Or: open **http://localhost:8080/auth** → Realm Settings → Keys → RS256 row → click **Public key** button → copy the value.

### 8b. Update the Secret File

Open `k8s/secrets/jwt-secret.yaml` and replace both `REPLACE_WITH_KEYCLOAK_REALM_PUBLIC_KEY` values with a PEM-formatted key:

```yaml
# k8s/secrets/jwt-secret.yaml
stringData:
  JWT_PUBLIC_KEY: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ...\n-----END PUBLIC KEY-----"
  KEYCLOAK_PUBLIC_KEY: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ...\n-----END PUBLIC KEY-----"
  KEYCLOAK_URL: "http://keycloak:8080/auth"
  KEYCLOAK_REALM: "miniproject"
```

Important: preserve newline formatting in the PEM value. Invalid formatting will cause 401 errors across all services.

Apply the updated secret:

```bash
kubectl apply -k k8s/secrets/
```

---

## 9. Deploy All Services

Now deploy the application stack (services + ingress). This avoids cert-manager dependency errors on fresh local clusters:

```bash
kubectl apply -k k8s/services/
kubectl apply -f k8s/network-policy.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/auth-ingress.yaml
kubectl apply -f k8s/minio-ingress.yaml
```

If cert-manager CRDs are installed (`certificates.cert-manager.io`, `clusterissuers.cert-manager.io`), you can additionally apply:

```bash
kubectl apply -f k8s/certificate.yaml
```

If cert-manager CRDs are **not** installed, create a local self-signed TLS secret so ingress can still serve HTTPS (recommended for stable Keycloak login cookies):

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /tmp/miniproject.local.key \
  -out /tmp/miniproject.local.crt \
  -subj "/CN=miniproject.local" \
  -addext "subjectAltName=DNS:miniproject.local"

kubectl -n miniproject create secret tls miniproject-tls-secret \
  --cert=/tmp/miniproject.local.crt \
  --key=/tmp/miniproject.local.key \
  --dry-run=client -o yaml | kubectl apply -f -
```

Quick verification:

```bash
curl -I http://miniproject.local/auth/   # expect 308 redirect to https://...
curl -k https://miniproject.local/auth/realms/miniproject/.well-known/openid-configuration
```

Wait for all service pods to reach `Running`:

```bash
kubectl get pods -n miniproject -w
```

Expected final state (all `1/1 Running`):

```
analytics-service-xxx     1/1     Running
event-service-xxx         1/1     Running
feed-service-xxx          1/1     Running
job-service-xxx           1/1     Running
keycloak-0                1/1     Running
messaging-service-xxx     1/1     Running
minio-0                   1/1     Running
mongodb-0                 1/1     Running
notification-service-xxx  1/1     Running
redis-0                   1/1     Running
research-service-xxx      1/1     Running
user-service-xxx          1/1     Running
```

If any service is in `CrashLoopBackOff`, check logs:

```bash
kubectl logs -n miniproject deployment/<service-name> --previous
```

### Quick Smoke Test

```bash
curl http://miniproject.local/api/v1/user-service/health
# Expected: {"status":"ok","service":"user-service","timestamp":"..."}

curl http://miniproject.local/api/v1/feed-service/health
# Expected: {"status":"ok","service":"feed-service"}
```

---

## 10. Verify the Cluster

Check everything is healthy at once:

```bash
kubectl get pods -n miniproject
kubectl get svc -n miniproject
kubectl get ingress -n miniproject
```

Check resource usage:

```bash
kubectl top pods -n miniproject
```

View logs for a specific service:

```bash
kubectl logs -n miniproject deployment/feed-service -f
kubectl logs -n miniproject deployment/user-service -f
```

---

## 11. Run the Web App

The React SPA runs locally and proxies all API calls through to the Minikube ingress.

```bash
# From the project root
cd web

# Install dependencies (first time only)
npm install

# Start secure dev server for auth/login flows
npm run dev:https
```

Open your browser at: **https://localhost:5174**

Note:
- `npm run dev` (HTTP on port 5173) is still fine for non-auth UI work.
- For Keycloak login-required flows, always use `npm run dev:https`.

The Vite dev server proxies:
- `/api/v1/*` → `https://miniproject.local` (all service API calls)
- `/auth/*` → `https://miniproject.local` (Keycloak auth flows)

Log in with any of the test users created in Step 7c:

| User | Email | Password | Role |
|------|-------|----------|------|
| `ashan` | `ashan@e2e.test` | `Password123!` | student |
| `nimali` | `nimali@e2e.test` | `Password123!` | alumni |
| `drraj` | `dr.raj@e2e.test` | `Password123!` | admin |

---

## 12. Run E2E Tests

The test suite makes real HTTP calls against the live cluster. It uses plain Node.js — no extra test framework installation needed.

### 12a. Install Root Dependencies (first time only)

```bash
# From the project root
npm install
```

### 12b. Create Test Tokens

This script logs in each test user and writes their JWT tokens to files in the project root:

```bash
cd tests/e2e
bash setup_personas.sh
cd ../..
```

You should see three new files in the project root: `.e2e_student_token`, `.e2e_alumni_token`, `.e2e_admin_token`.

> **Re-run `setup_personas.sh` any time tokens expire** (default: 1 hour).

### 12c. Run the Full Suite

```bash
bash tests/e2e/run_all.sh
```

Expected output:

```
  Scenario  Status      Detail
  S1        PASS        PASS (0 gaps, ...)
  S2        PASS        PASS (0 gaps, ...)
  ...
  S10       PASS        PASS (0 gaps, ...)
All scenarios PASSED.
```

**Total: 331 assertions · 0 failures · 0 gaps**

### 12d. Run a Single Scenario

```bash
node tests/e2e/test_s1.js   # User profile
node tests/e2e/test_s2.js   # Feed + image upload
node tests/e2e/test_s3.js   # Jobs
node tests/e2e/test_s4.js   # Events
node tests/e2e/test_s5.js   # Research
node tests/e2e/test_s6.js   # Job posting
node tests/e2e/test_s7.js   # Analytics
node tests/e2e/test_s8.js   # Full cross-service journey
node tests/e2e/test_s9.js   # Concurrency
node tests/e2e/test_s10.js  # Resilience (modifies cluster — use dev cluster only)
```

### 12e. Run Individual Gap Unit Tests

Each gap has its own standalone test file:

```bash
node tests/e2e/test_s2_gaps.js   # MinIO object verification
node tests/e2e/test_s3_gaps.js   # Job application notifications
node tests/e2e/test_s4_gaps.js   # Event cancellation + fan-out
node tests/e2e/test_s5_gaps.js   # Research document size + archive block
node tests/e2e/test_s6_gaps.js   # Job type enum + open-only listing
node tests/e2e/test_s7_gaps.js   # Analytics extended fields + RBAC
node tests/e2e/test_s8_gaps.js   # Collaboration invite notification
node tests/e2e/test_s9_gaps.js   # GET /feed/:id single-post retrieval
```

---

## 13. Useful Day-to-Day Commands

### Cluster Status

```bash
# All pods in the project namespace
kubectl get pods -n miniproject

# Watch pods update in real time
kubectl get pods -n miniproject -w

# Pod resource usage
kubectl top pods -n miniproject
```

### Service Logs

```bash
kubectl logs -n miniproject deployment/user-service -f
kubectl logs -n miniproject deployment/feed-service -f
kubectl logs -n miniproject deployment/job-service -f
kubectl logs -n miniproject deployment/event-service -f
kubectl logs -n miniproject deployment/notification-service -f
kubectl logs -n miniproject deployment/research-service -f
kubectl logs -n miniproject deployment/analytics-service -f
kubectl logs -n miniproject statefulset/mongodb -f
kubectl logs -n miniproject statefulset/keycloak -f
```

### Restarting a Service

```bash
kubectl rollout restart deployment/feed-service -n miniproject
kubectl rollout status  deployment/feed-service -n miniproject
```

### Update a Service Image (after code changes)

```bash
eval $(minikube docker-env)

# Rebuild with a NEW tag (never reuse the same tag — Docker layer cache will serve stale code)
docker build --no-cache -t feed-service:v12 services/feed-service/

# Update the Deployment to use the new image
kubectl set image deployment/feed-service \
  -n miniproject \
  feed-service=feed-service:v12

kubectl rollout status deployment/feed-service -n miniproject --timeout=90s
```

### Access Keycloak Admin UI

```bash
# In a separate terminal
kubectl port-forward -n miniproject svc/keycloak-http 8080:8080
# Then open: http://localhost:8080  (admin / admin)
```

### Access MinIO Console

```bash
# In a separate terminal
kubectl port-forward -n miniproject svc/minio 9001:9001
# Then open: http://localhost:9001  (rootuser / rootpassword123)
```

### Access MongoDB Shell

```bash
kubectl exec -it -n miniproject mongodb-0 -- mongosh
use miniproject_db
db.users.find().limit(5).pretty()
db.posts.countDocuments()
```

### Stop / Resume Minikube

```bash
minikube stop     # Saves state (fast resume)
minikube start    # Restore everything

# Or delete entirely and start fresh:
minikube delete
```

> **After `minikube start` (resume):** Re-run `eval $(minikube docker-env)` in any terminal that needs to build images. Re-check that the IP in `/etc/hosts` still matches `minikube ip`.

---

## 14. Troubleshooting

### `Cannot GET /api/v1/...` from the browser / test

1. Check that `miniproject.local` resolves: `ping -c1 miniproject.local`
2. Check the ingress is deployed: `kubectl get ingress -n miniproject`
3. Check the target service pod is Running: `kubectl get pods -n miniproject`
4. Check service logs for startup errors: `kubectl logs -n miniproject deployment/<service>`

### Pod stuck in `CrashLoopBackOff`

```bash
kubectl describe pod -n miniproject <pod-name>
kubectl logs -n miniproject <pod-name> --previous
```

Common causes:
- **JWT key not injected** — the service cannot parse the public key from the secret. Redo Step 8.
- **MongoDB not ready** — the service started before `mongodb-0` was `Running`. Restart the deployment: `kubectl rollout restart deployment/<service> -n miniproject`

### `ImagePullBackOff` or `ErrImageNeverPull`

The image was not built inside Minikube's Docker daemon. Re-run the build commands from Step 5 after `eval $(minikube docker-env)`.

```bash
eval $(minikube docker-env)
docker images | grep feed-service   # should show the image
```

### Service starts but returns `401` on every request

The JWT public key in `k8s/secrets/jwt-secret.yaml` does not match the Keycloak realm key. Re-do Step 8: get the key from `http://localhost:8080/auth/realms/miniproject`, ensure PEM format/newlines are correct, update the file, and `kubectl apply -k k8s/secrets/`.

### Keycloak port-forward drops

Re-run:
```bash
kubectl port-forward -n miniproject svc/keycloak-http 8080:8080
```

### `GET /feed/upload` returns `503`

MinIO is not reachable from feed-service. Check:
```bash
kubectl get pods -n miniproject | grep minio
kubectl logs -n miniproject statefulset/minio
```
Also verify the ConfigMap has the correct `MINIO_ENDPOINT`:
```bash
kubectl get configmap feed-service-config -n miniproject -o yaml | grep MINIO
# Should show: MINIO_ENDPOINT: minio
```

If `MINIO_ENDPOINT` is missing or set to `localhost`, patch it:
```bash
kubectl patch configmap feed-service-config -n miniproject --type merge \
  -p '{"data":{"MINIO_ENDPOINT":"minio","MINIO_PORT":"9000","MINIO_BUCKET_NAME":"miniproject","MINIO_USE_SSL":"false"}}'
kubectl rollout restart deployment/feed-service -n miniproject
```

### E2E token files are missing

```bash
bash tests/e2e/setup_personas.sh
```

If it fails, verify the test users exist in Keycloak (Step 7c) and that `miniproject.local` resolves correctly.

### Tests pass but S7 (analytics) 403s

`GET /analytics/overview` is admin-only. Make sure the `.e2e_admin_token` file belongs to a user with the `admin` role in Keycloak. Check with:
```bash
node -e "const t=require('fs').readFileSync('.e2e_admin_token','utf8').trim(); const p=JSON.parse(Buffer.from(t.split('.')[1],'base64').toString()); console.log(p.realm_access?.roles);"
```

---

## Summary: Full Startup Order (Quick Reference)

```bash
# 1. Start Minikube
minikube start --cpus=4 --memory=8192 --driver=docker
minikube addons enable ingress metrics-server
sudo sed -i '/miniproject\.local/d' /etc/hosts
echo "$(minikube ip)  miniproject.local" | sudo tee -a /etc/hosts

# 2. Build images (inside Minikube's Docker)
eval $(minikube docker-env)
docker build --no-cache -t mini_project-user-service:latest       services/user-service/
docker build --no-cache -t feed-service:v11                        services/feed-service/
docker build --no-cache -t job-service:v4                          services/job-service/
docker build --no-cache -t event-service:v3                        services/event-service/
docker build --no-cache -t mini_project-notification-service:latest services/notification-service/
docker build --no-cache -t research-service:v8                     services/research-service/
docker build --no-cache -t analytics-service:v4                    services/analytics-service/
docker build --no-cache -t mini_project-messaging-service:v2       services/messaging-service/

# 3. Deploy infra + secrets
kubectl apply -f k8s/namespace.yaml
kubectl apply -k k8s/secrets/
kubectl apply -k k8s/infra/
# Wait for: keycloak-0, minio-0, mongodb-0, redis-0 → 1/1 Running

# 4. Set up Keycloak (in a separate terminal: kubectl port-forward -n miniproject svc/keycloak-http 8080:8080)
#    Then create realm / roles / clients / users — see Section 7

# 5. Inject JWT public key into secret — see Section 8
#    Edit k8s/secrets/jwt-secret.yaml then:
kubectl apply -k k8s/secrets/

# 6. Deploy all services
kubectl apply -k k8s/services/
kubectl apply -f k8s/network-policy.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/auth-ingress.yaml
kubectl apply -f k8s/minio-ingress.yaml
# Wait for all 12 pods → 1/1 Running

# 7. Run web app (secure auth flow)
cd web && npm install && npm run dev:https   # https://localhost:5174

# 8. Run E2E tests
cd tests/e2e && bash setup_personas.sh && cd ../..
bash tests/e2e/run_all.sh
# Expected: 331/331 PASS
```
