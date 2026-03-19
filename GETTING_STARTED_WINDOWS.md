# Getting Started — Windows (PowerShell)

> **CO528 Mini Project** — Cloud-Native Microservices Platform  
> Windows-native guide using **PowerShell** (no WSL required).  
> All differences from the original `GETTING_STARTED.md` are highlighted with ⚠️.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [One-Time Machine Setup](#2-one-time-machine-setup)
3. [Build All Docker Images](#3-build-all-docker-images)
4. [Deploy Infrastructure](#4-deploy-infrastructure)
5. [Set Up Keycloak](#5-set-up-keycloak)
6. [Inject the JWT Public Key](#6-inject-the-jwt-public-key)
7. [Deploy All Services](#7-deploy-all-services)
8. [Verify the Cluster](#8-verify-the-cluster)
9. [Run the Web App](#9-run-the-web-app)
10. [Run E2E Tests](#10-run-e2e-tests)
11. [Useful Day-to-Day Commands](#11-useful-day-to-day-commands)
12. [Troubleshooting](#12-troubleshooting)
13. [Quick Reference — Full Startup Order](#13-quick-reference--full-startup-order)

---

## 1. Prerequisites

Install these tools. **Do not use WSL** — all commands run natively in PowerShell.

| Tool | Version | Install |
|------|---------|---------|
| **Docker Desktop** | 24.x | https://docs.docker.com/get-docker/ |
| **Minikube** | 1.32.x | https://minikube.sigs.k8s.io/docs/start/ |
| **kubectl** | 1.28.x | https://kubernetes.io/docs/tasks/tools/ |
| **Node.js** | 20.x LTS | https://nodejs.org/ |

Verify (run in PowerShell):

```powershell
docker --version
minikube version
kubectl version --client
node --version
```

---

## 2. One-Time Machine Setup

### 2a. Start Minikube

```powershell
minikube start --cpus=4 --memory=8192 --disk-size=30g --driver=docker
```

### 2b. Enable Required Addons

```powershell
minikube addons enable ingress
minikube addons enable metrics-server
```

Wait for the ingress controller to be ready:

```powershell
kubectl wait --namespace ingress-nginx `
  --for=condition=ready pod `
  --selector=app.kubernetes.io/component=controller `
  --timeout=120s
```

### 2c. Add `miniproject.local` to Hosts File

⚠️ **Windows requires admin rights to edit the hosts file.**

1. Run PowerShell **as Administrator**
2. Run the following (replace `192.168.49.2` with your actual `minikube ip` output):

```powershell
# Get Minikube IP
minikube ip
# Example: 192.168.49.2

# Add to hosts file (requires Admin PowerShell)
Add-Content -Path "$env:SystemRoot\System32\drivers\etc\hosts" `
  -Value "$(minikube ip)  miniproject.local" -Encoding ASCII
```

Verify:
```powershell
ping miniproject.local
```

> **After every `minikube start` (resume):** Re-check the IP hasn't changed with `minikube ip` and re-run the hosts file command if it has.

---

## 3. Build All Docker Images

⚠️ **Windows equivalent of `eval $(minikube docker-env)`:**

```powershell
# Point your shell's Docker CLI at Minikube's daemon
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

# Verify you are inside Minikube (should show minikube images)
docker images | Select-String "k8s"
```

Now build each service from the project root:

```powershell
# user-service
docker build --no-cache -t mini_project-user-service:latest services/user-service/

# feed-service
docker build --no-cache -t feed-service:v11 services/feed-service/

# job-service
docker build --no-cache -t job-service:v4 services/job-service/

# event-service
docker build --no-cache -t event-service:v3 services/event-service/

# notification-service
docker build --no-cache -t mini_project-notification-service:latest services/notification-service/

# research-service
docker build --no-cache -t research-service:v8 services/research-service/

# analytics-service
docker build --no-cache -t analytics-service:v4 services/analytics-service/

# messaging-service
docker build --no-cache -t mini_project-messaging-service:v2 services/messaging-service/
```

Verify all 8 images exist:

```powershell
docker images | Select-String "user-service|feed-service|job-service|event-service|notification|research|analytics|messaging"
```

---

## 4. Deploy Infrastructure

```powershell
# From the project root
kubectl apply -f k8s/namespace.yaml
kubectl apply -k k8s/secrets/
kubectl apply -k k8s/infra/
```

Wait for all 4 infra pods to show `1/1 Running`:

```powershell
kubectl get pods -n miniproject -w
# Press Ctrl+C when all 4 are Running:
# keycloak-0    1/1  Running
# minio-0       1/1  Running
# mongodb-0     1/1  Running
# redis-0       1/1  Running
```

---

## 5. Set Up Keycloak

### 5a. Open a Port-Forward to Keycloak

⚠️ Keep this running in a **separate PowerShell window** for the duration of setup:

```powershell
kubectl port-forward -n miniproject svc/keycloak 8081:8080
```

> **Note:** Use port `8081` (not `8080`) on Windows because port 8080 is often occupied by other local services.

Keycloak admin UI: **http://localhost:8081/auth** (admin / admin)

### 5b. Create the Realm, Roles, and Client

⚠️ **Critical Windows difference:** `kcadm.sh` runs **inside the Keycloak pod** via `kubectl exec`.  
From inside the pod, Keycloak listens on `http://localhost:8080/auth` (not 8081 — the port-forward only exists on your host).

⚠️ **Use `bash -c` for single commands, or pipe a heredoc for multi-command sessions** to preserve the login session cookie between commands.

Run all Keycloak setup in one piped bash session (copy-paste the entire block):

```powershell
@"
/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password admin
/opt/keycloak/bin/kcadm.sh create realms -s realm=miniproject -s enabled=true
/opt/keycloak/bin/kcadm.sh create roles -r miniproject -s name=student
/opt/keycloak/bin/kcadm.sh create roles -r miniproject -s name=alumni
/opt/keycloak/bin/kcadm.sh create roles -r miniproject -s name=admin
/opt/keycloak/bin/kcadm.sh create clients -r miniproject -s clientId=web-client -s enabled=true -s publicClient=true -s 'redirectUris=["http://miniproject.local/*","http://localhost:5173/*"]' -s 'webOrigins=["+"]'
/opt/keycloak/bin/kcadm.sh update realms/miniproject -s accessTokenLifespan=3600
"@ | kubectl exec -i -n miniproject keycloak-0 -- bash
```

### 5c. Create Test Users

```powershell
@"
/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password admin
/opt/keycloak/bin/kcadm.sh create users -r miniproject -s username=ashan -s email=ashan@e2e.test -s enabled=true -s emailVerified=true
/opt/keycloak/bin/kcadm.sh set-password -r miniproject --username ashan --new-password 'Password123!'
/opt/keycloak/bin/kcadm.sh add-roles -r miniproject --uusername ashan --rolename student
/opt/keycloak/bin/kcadm.sh create users -r miniproject -s username=nimali -s email=nimali@e2e.test -s enabled=true -s emailVerified=true
/opt/keycloak/bin/kcadm.sh set-password -r miniproject --username nimali --new-password 'Password123!'
/opt/keycloak/bin/kcadm.sh add-roles -r miniproject --uusername nimali --rolename alumni
/opt/keycloak/bin/kcadm.sh create users -r miniproject -s username=drraj -s email=dr.raj@e2e.test -s enabled=true -s emailVerified=true
/opt/keycloak/bin/kcadm.sh set-password -r miniproject --username drraj --new-password 'Password123!'
/opt/keycloak/bin/kcadm.sh add-roles -r miniproject --uusername drraj --rolename admin
"@ | kubectl exec -i -n miniproject keycloak-0 -- bash
```

Test users created:

| User | Email | Password | Role |
|------|-------|----------|------|
| `ashan` | `ashan@e2e.test` | `Password123!` | student |
| `nimali` | `nimali@e2e.test` | `Password123!` | alumni |
| `drraj` | `dr.raj@e2e.test` | `Password123!` | admin |

---

## 6. Inject the JWT Public Key

⚠️ **Keycloak's public key endpoint uses `/auth` prefix** on this deployment.

### 6a. Get the Public Key

With the port-forward still open on 8081:

```powershell
# Fetch and save the public key
$key = (Invoke-WebRequest -Uri "http://localhost:8081/auth/realms/miniproject" `
  -UseBasicParsing | Select-Object -ExpandProperty Content | ConvertFrom-Json).public_key
$key | Out-File -FilePath "$env:TEMP\kc_pubkey.txt" -Encoding ASCII -NoNewline
Write-Host "Key length: $($key.Length)"   # Should be ~392 chars
```

> **Alternative:** Open http://localhost:8081/auth → Realm Settings → Keys → RS256 row → click **Public key** button → copy.

### 6b. Update the Secret File

```powershell
$key = Get-Content "$env:TEMP\kc_pubkey.txt" -Raw
@"
apiVersion: v1
kind: Secret
metadata:
  name: jwt-secret
  namespace: miniproject
type: Opaque
stringData:
  JWT_PUBLIC_KEY: "$key"
  KEYCLOAK_PUBLIC_KEY: "$key"
  KEYCLOAK_URL: "http://keycloak:8080/auth"
  KEYCLOAK_REALM: "miniproject"
"@ | Out-File -FilePath "k8s\secrets\jwt-secret.yaml" -Encoding ASCII
```

Apply the updated secret:

```powershell
kubectl apply -k k8s/secrets/
```

> **Important:** `KEYCLOAK_URL` is set to `http://keycloak:8080/auth` (pod-to-pod internal DNS + `/auth` path).

---

## 7. Deploy All Services

```powershell
kubectl apply -k k8s/
```

> ⚠️ If you see `no matches for kind "ClusterIssuer"` — this is expected. cert-manager is not installed for local dev. The error is non-fatal; all services still deploy. This line is commented out in `k8s/kustomization.yaml`.

Wait for all pods to reach `Running`:

```powershell
kubectl get pods -n miniproject -w
```

Expected final state (all `true` in READY column):

```
analytics-service-xxx     1/1  Running
event-service-xxx         1/1  Running
feed-service-xxx          1/1  Running
job-service-xxx           1/1  Running
keycloak-0                1/1  Running
messaging-service-xxx     1/1  Running
minio-0                   1/1  Running
mongodb-0                 1/1  Running
notification-service-xxx  1/1  Running
redis-0                   1/1  Running
research-service-xxx      1/1  Running
user-service-xxx          1/1  Running
```

> `mongodb-backup-xxx` may be `Pending` — this is a CronJob backup pod and is **not** required for the platform to function.

---

## 8. Verify the Cluster

```powershell
kubectl get pods -n miniproject
kubectl get svc -n miniproject
kubectl get ingress -n miniproject

# Smoke-test health endpoints (requires miniproject.local in hosts)
Invoke-WebRequest -Uri "http://miniproject.local/api/v1/user-service/api/v1/users/health" -UseBasicParsing
Invoke-WebRequest -Uri "http://miniproject.local/api/v1/feed-service/api/v1/feed/health" -UseBasicParsing
```

---

## 9. Run the Web App

```powershell
cd web
npm install
npm run dev
```

Open: **http://localhost:5173**

Log in with any test user from Step 5c.

---

## 10. Run E2E Tests

### 10a. Install Root Dependencies (first time only)

```powershell
# From project root
npm install
```

### 10b. Create Test Tokens

⚠️ **The `setup_personas.sh` bash script cannot run on Windows without WSL.** Use this PowerShell alternative:

```powershell
# From project root — get token for each user
function Get-KeycloakToken($username, $password) {
    $body = "client_id=web-client&username=$username&password=$password&grant_type=password"
    $response = Invoke-WebRequest -Uri "http://miniproject.local/api/v1/auth/realms/miniproject/protocol/openid-connect/token" `
        -Method POST -Body $body -ContentType "application/x-www-form-urlencoded" -UseBasicParsing
    return ($response.Content | ConvertFrom-Json).access_token
}

Get-KeycloakToken "ashan" "Password123!"   | Out-File ".e2e_student_token" -Encoding ASCII -NoNewline
Get-KeycloakToken "nimali" "Password123!"  | Out-File ".e2e_alumni_token"  -Encoding ASCII -NoNewline
Get-KeycloakToken "drraj" "Password123!"   | Out-File ".e2e_admin_token"   -Encoding ASCII -NoNewline
Write-Host "Tokens written."
```

### 10c. Run the Full Suite

⚠️ **`bash tests/e2e/run_all.sh` does not work on Windows natively.** Run individual tests with Node:

```powershell
# Run each scenario individually
node tests/e2e/test_s1.js
node tests/e2e/test_s2.js
node tests/e2e/test_s3.js
node tests/e2e/test_s4.js
node tests/e2e/test_s5.js
node tests/e2e/test_s6.js
node tests/e2e/test_s7.js
node tests/e2e/test_s8.js
node tests/e2e/test_s9.js
node tests/e2e/test_s10.js
```

Or install Git Bash / WSL to run `bash tests/e2e/run_all.sh` as-is.

---

## 11. Useful Day-to-Day Commands

### Minikube Docker Environment (required before building images)

```powershell
# Run this in every new terminal before docker build commands
& minikube -p minikube docker-env --shell powershell | Invoke-Expression
```

### Keycloak Admin

```powershell
# Port-forward (keep open in a separate terminal)
kubectl port-forward -n miniproject svc/keycloak 8081:8080
# UI: http://localhost:8081/auth  (admin / admin)
```

### MinIO Console

```powershell
kubectl port-forward -n miniproject svc/minio 9001:9001
# UI: http://localhost:9001  (rootuser / rootpassword123)
```

### Restart a Service After Code Change

```powershell
# 1. Point Docker at Minikube
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

# 2. Rebuild with a new tag (never reuse — Docker will serve cached layers)
docker build --no-cache -t feed-service:v12 services/feed-service/

# 3. Update the Deployment
kubectl set image deployment/feed-service -n miniproject feed-service=feed-service:v12
kubectl rollout status deployment/feed-service -n miniproject --timeout=90s
```

### View Logs

```powershell
kubectl logs -n miniproject deployment/user-service -f
kubectl logs -n miniproject deployment/feed-service -f
kubectl logs -n miniproject statefulset/keycloak -f
```

### Stop / Resume Minikube

```powershell
minikube stop    # Saves state
minikube start   # Resumes — re-run docker-env and check hosts IP
```

---

## 12. Troubleshooting

### Keycloak `kcadm.sh` returns 404

The deployment uses `--http-relative-path=/auth`. All Keycloak URLs must include `/auth`:

- From **inside the pod**: `http://localhost:8080/auth`
- From **your browser**: `http://localhost:8081/auth`
- From **other pods** (internal DNS): `http://keycloak:8080/auth`

### `kcadm.sh` returns `Connection refused` when using port 8081

`kcadm.sh` runs **inside the Keycloak pod**. The port-forward on `8081` only exists on your host machine. Always use `http://localhost:8080/auth` inside `kubectl exec` commands.

### `kcadm.sh` returns `null [unknown_error]` on second command

Each `kubectl exec` starts a new process with no session cookie. Use the piped bash heredoc pattern to run all commands in one session:

```powershell
@"
/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password admin
/opt/keycloak/bin/kcadm.sh <your-command-here>
"@ | kubectl exec -i -n miniproject keycloak-0 -- bash
```

### Port 8080 already in use

Windows often has services on port 8080. Use port 8081 for the Keycloak port-forward:

```powershell
kubectl port-forward -n miniproject svc/keycloak 8081:8080
```

Check what's on 8080:
```powershell
netstat -ano | findstr ":8080"
Get-Process -Id <PID>
```

### `Add-Content` to hosts file: Access Denied

Run PowerShell **as Administrator** to edit the hosts file.

### `minikube docker-env` on PowerShell

Do **not** use `eval $(minikube docker-env)` — that is bash syntax. Use:

```powershell
& minikube -p minikube docker-env --shell powershell | Invoke-Expression
```

### Service returns `401` on every request

The JWT public key in `k8s/secrets/jwt-secret.yaml` does not match the Keycloak realm key. Redo Step 6: fetch the key from `http://localhost:8081/auth/realms/miniproject`, update the file, and apply.

### `ImagePullBackOff` on service pods

The image was built outside Minikube's Docker daemon. Re-run `& minikube -p minikube docker-env --shell powershell | Invoke-Expression` and rebuild.

### Pod stuck in `CrashLoopBackOff`

```powershell
kubectl describe pod -n miniproject <pod-name>
kubectl logs -n miniproject <pod-name> --previous
```

Common causes:
- **JWT key not injected** — redo Step 6
- **MongoDB not ready** — restart the deployment: `kubectl rollout restart deployment/<service> -n miniproject`

---

## 13. Quick Reference — Full Startup Order

```powershell
# ── STEP 1: Start Minikube ──────────────────────────────────────────────────
minikube start --cpus=4 --memory=8192 --driver=docker
minikube addons enable ingress
minikube addons enable metrics-server

# Add hosts entry (Admin PowerShell required)
Add-Content -Path "$env:SystemRoot\System32\drivers\etc\hosts" `
  -Value "$(minikube ip)  miniproject.local" -Encoding ASCII

# ── STEP 2: Build images (inside Minikube's Docker) ─────────────────────────
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

docker build --no-cache -t mini_project-user-service:latest       services/user-service/
docker build --no-cache -t feed-service:v11                        services/feed-service/
docker build --no-cache -t job-service:v4                          services/job-service/
docker build --no-cache -t event-service:v3                        services/event-service/
docker build --no-cache -t mini_project-notification-service:latest services/notification-service/
docker build --no-cache -t research-service:v8                     services/research-service/
docker build --no-cache -t analytics-service:v4                    services/analytics-service/
docker build --no-cache -t mini_project-messaging-service:v2       services/messaging-service/

# ── STEP 3: Deploy infra + secrets ──────────────────────────────────────────
kubectl apply -f k8s/namespace.yaml
kubectl apply -k k8s/secrets/
kubectl apply -k k8s/infra/
# Wait: kubectl get pods -n miniproject -w  (all 4 infra pods → Running)

# ── STEP 4: Set up Keycloak ─────────────────────────────────────────────────
# In a SEPARATE terminal (keep running):
#   kubectl port-forward -n miniproject svc/keycloak 8081:8080

# Create realm, roles, client, users (from main terminal):
@"
/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080/auth --realm master --user admin --password admin
/opt/keycloak/bin/kcadm.sh create realms -s realm=miniproject -s enabled=true
/opt/keycloak/bin/kcadm.sh create roles -r miniproject -s name=student
/opt/keycloak/bin/kcadm.sh create roles -r miniproject -s name=alumni
/opt/keycloak/bin/kcadm.sh create roles -r miniproject -s name=admin
/opt/keycloak/bin/kcadm.sh create clients -r miniproject -s clientId=web-client -s enabled=true -s publicClient=true -s 'redirectUris=["http://miniproject.local/*","http://localhost:5173/*"]' -s 'webOrigins=["+"]'
/opt/keycloak/bin/kcadm.sh update realms/miniproject -s accessTokenLifespan=3600
/opt/keycloak/bin/kcadm.sh create users -r miniproject -s username=ashan -s email=ashan@e2e.test -s enabled=true -s emailVerified=true
/opt/keycloak/bin/kcadm.sh set-password -r miniproject --username ashan --new-password 'Password123!'
/opt/keycloak/bin/kcadm.sh add-roles -r miniproject --uusername ashan --rolename student
/opt/keycloak/bin/kcadm.sh create users -r miniproject -s username=nimali -s email=nimali@e2e.test -s enabled=true -s emailVerified=true
/opt/keycloak/bin/kcadm.sh set-password -r miniproject --username nimali --new-password 'Password123!'
/opt/keycloak/bin/kcadm.sh add-roles -r miniproject --uusername nimali --rolename alumni
/opt/keycloak/bin/kcadm.sh create users -r miniproject -s username=drraj -s email=dr.raj@e2e.test -s enabled=true -s emailVerified=true
/opt/keycloak/bin/kcadm.sh set-password -r miniproject --username drraj --new-password 'Password123!'
/opt/keycloak/bin/kcadm.sh add-roles -r miniproject --uusername drraj --rolename admin
"@ | kubectl exec -i -n miniproject keycloak-0 -- bash

# ── STEP 5: Inject JWT public key ───────────────────────────────────────────
$key = (Invoke-WebRequest -Uri "http://localhost:8081/auth/realms/miniproject" `
  -UseBasicParsing | Select-Object -ExpandProperty Content | ConvertFrom-Json).public_key
@"
apiVersion: v1
kind: Secret
metadata:
  name: jwt-secret
  namespace: miniproject
type: Opaque
stringData:
  JWT_PUBLIC_KEY: "$key"
  KEYCLOAK_PUBLIC_KEY: "$key"
  KEYCLOAK_URL: "http://keycloak:8080/auth"
  KEYCLOAK_REALM: "miniproject"
"@ | Out-File -FilePath "k8s\secrets\jwt-secret.yaml" -Encoding ASCII
kubectl apply -k k8s/secrets/

# ── STEP 6: Deploy all services ─────────────────────────────────────────────
kubectl apply -k k8s/
# Wait: kubectl get pods -n miniproject -w  (all 12 pods → Running)

# ── STEP 7: Run the web app ─────────────────────────────────────────────────
cd web; npm install; npm run dev
# Open: http://localhost:5173
```
