# Deployment Guide

## Overview

Cityflow uses **GitHub Container Registry (GHCR)** to distribute Docker images for both the frontend and backend services. The CD pipeline automatically builds and publishes images on every push to `main` or when a release tag (`v*`) is created.

## Images

| Service   | Image                                  |
|-----------|----------------------------------------|
| Frontend  | `ghcr.io/orou500/cityflow-frontend`    |
| Backend   | `ghcr.io/orou500/cityflow-backend`     |

## Tagging Strategy

Tags are generated automatically by the CD pipeline:

| Trigger               | Tags                                      |
|-----------------------|-------------------------------------------|
| Push to `main`        | `latest`, `main`, `sha-<full-commit>`     |
| Release `v1.2.3`      | `1.2.3`, `1.2`, `sha-<full-commit>`      |
| Manual (`workflow_dispatch`) | `main`, `sha-<full-commit>`        |

> **Note:** The full commit SHA is used (not truncated) to ensure unique image tags and avoid ArgoCD sync issues.

## Pipeline

The CD workflow (`.github/workflows/cd.yml`):

1. **Triggered** by push to `main`, tag `v*`, release publish, or manual dispatch
2. **Runs CI** (reuses the CI workflow) to verify lint, format, tests, and build
3. **Builds & pushes** both `cityflow-frontend` and `cityflow-backend` images to GHCR
4. Images are **cached** via GitHub Actions cache for faster subsequent builds
5. **Updates Kubernetes manifests** in the `k8s/` directory with the new image tag
6. **Pushes** the updated manifests to trigger ArgoCD sync (with retry loop for push races)

## Pulling Images

```bash
# Authenticate with GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin

# Pull the latest images
docker pull ghcr.io/orou500/cityflow-frontend:latest
docker pull ghcr.io/orou500/cityflow-backend:latest
```

> A GitHub Personal Access Token (PAT) with `read:packages` scope is required for
> pulls outside GitHub Actions. For actions within the same repository, the
> auto-generated `GITHUB_TOKEN` is sufficient.

---

## Running with Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  cityflow-mongo:
    image: mongo:7
    volumes:
      - mongo-data:/data/db
    ports:
      - "27017:27017"

  cityflow-backend:
    image: ghcr.io/orou500/cityflow-backend:latest
    ports:
      - "5000:5000"
    environment:
      - MONGODB_URI=mongodb://cityflow-mongo:27017/cityflow
      - JWT_SECRET=<your-secret>
      - TICK_INTERVAL_MINUTES=60
    depends_on:
      - cityflow-mongo

  cityflow-frontend:
    image: ghcr.io/orou500/cityflow-frontend:latest
    ports:
      - "80:80"
    depends_on:
      - cityflow-backend

volumes:
  mongo-data:
```

> **Note:** The frontend nginx proxies `/api` requests to `http://cityflow-backend:5000`.
> The service name `cityflow-backend` is resolved automatically by the internal DNS.

## Running Manually

```bash
# Backend
docker run -d \
  --name cityflow-backend \
  -p 5000:5000 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/cityflow \
  -e JWT_SECRET=<your-secret> \
  ghcr.io/orou500/cityflow-backend:latest

# Frontend
docker run -d \
  --name cityflow-frontend \
  -p 80:80 \
  ghcr.io/orou500/cityflow-frontend:latest
```

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (v1.25+) — tested on K3s (ARM64)
- `kubectl` configured to connect to your cluster
- **Traefik** Ingress Controller (K3s ships with Traefik by default)
- Docker registry secret (`ghcr-pull`) for pulling GHCR images
- (Optional) ArgoCD for GitOps deployments

### Directory Structure

```
k8s/
├── namespace.yml                  # Namespace definition
├── kustomization.yml              # Kustomize overlay for ArgoCD
├── config/
│   ├── backend-configmap.yml      # Non-sensitive configuration
│   ├── backend-secrets.yml.example # Secret template (do NOT commit real values)
│   ├── oauth-secrets.yml.example   # OAuth secret template (Google/Discord)
│   └── networkpolicy-deny-all.yml # Default deny all ingress
├── mongodb/
│   ├── statefulset.yml            # MongoDB StatefulSet + PVC
│   ├── service.yml                # Headless service for MongoDB
│   └── networkpolicy.yml          # Allow only backend → MongoDB
├── backend/
│   ├── deployment.yml             # Backend Deployment (2 replicas)
│   ├── service.yml                # Backend ClusterIP Service
│   ├── backup-pvc.yml             # PersistentVolumeClaim for backups (5Gi)
│   └── networkpolicy.yml          # Allow frontend + ingress → backend
├── frontend/
│   ├── deployment.yml             # Frontend Deployment (2 replicas)
│   ├── service.yml                # Frontend ClusterIP Service
│   └── networkpolicy.yml          # Allow ingress → frontend
├── ingress/
│   └── ingress.yml                # Traefik Ingress with Let's Encrypt TLS
└── traefik/
    └── traefik-config.yml         # Traefik HelmChart CRD for ACME config
```

### Step 1 — Create the Namespace

```bash
kubectl apply -f k8s/namespace.yml
```

### Step 2 — Create Secrets

**Never commit real secrets to Git.** Create them imperatively:

```bash
# Generate credentials
MONGO_USER=cityflow
MONGO_PASS=$(openssl rand -base64 24)
JWT_SECRET=$(openssl rand -base64 32)
ADMIN_PASS=$(openssl rand -base64 16)

# MongoDB credentials (used by the StatefulSet)
kubectl create secret generic mongodb-credentials \
  --namespace=cityflow \
  --from-literal=username="$MONGO_USER" \
  --from-literal=password="$MONGO_PASS" \
  --dry-run=client -o yaml | kubectl apply -f -

# Backend application secrets
kubectl create secret generic backend-secrets \
  --namespace=cityflow \
  --from-literal=MONGODB_URI="mongodb://${MONGO_USER}:${MONGO_PASS}@cityflow-mongodb-0.cityflow-mongodb:27017/cityflow?authSource=admin" \
  --from-literal=JWT_SECRET="$JWT_SECRET" \
  --from-literal=ADMIN_PASSWORD="$ADMIN_PASS" \
  --from-literal=FRONTEND_URL="https://cityflow.sizops.co.il" \
  --dry-run=client -o yaml | kubectl apply -f -

# OAuth secrets (create after setting up Google/Discord OAuth apps)
# Replace <your-*> with values from Google Cloud Console / Discord Developer Portal
kubectl create secret generic oauth-secrets \
  --namespace=cityflow \
  --from-literal=OAUTH_GOOGLE_CLIENT_ID="<your-google-client-id>" \
  --from-literal=OAUTH_GOOGLE_CLIENT_SECRET="<your-google-client-secret>" \
  --from-literal=OAUTH_GOOGLE_REDIRECT_URI="https://cityflow.sizops.co.il/api/auth/google/callback" \
  --from-literal=OAUTH_DISCORD_CLIENT_ID="<your-discord-client-id>" \
  --from-literal=OAUTH_DISCORD_CLIENT_SECRET="<your-discord-client-secret>" \
  --from-literal=OAUTH_DISCORD_REDIRECT_URI="https://cityflow.sizops.co.il/api/auth/discord/callback" \
  --dry-run=client -o yaml | kubectl apply -f -

# GHCR pull secret (for pulling images from GitHub Container Registry)
kubectl create secret docker-registry ghcr-pull \
  --namespace=cityflow \
  --docker-server=ghcr.io \
  --docker-username=<github-username> \
  --docker-password=<github-pat> \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Step 3 — Create the Backup PVC

```bash
kubectl apply -f k8s/backend/backup-pvc.yml
```

### Step 4 — Deploy All Resources

```bash
kubectl apply -k k8s/
```

Or apply individual manifests:

```bash
kubectl apply -f k8s/config/
kubectl apply -f k8s/mongodb/
kubectl apply -f k8s/backend/
kubectl apply -f k8s/frontend/
kubectl apply -f k8s/ingress/
```

### Step 5 — Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n cityflow

# Check services
kubectl get svc -n cityflow

# Check ingress
kubectl get ingress -n cityflow

# Check backend logs
kubectl logs -n cityflow -l app.kubernetes.io/name=backend -f

# Check MongoDB logs
kubectl logs -n cityflow -l app.kubernetes.io/name=mongodb -f
```

### Step 6 — Configure DNS

Point your domain to the Ingress Controller's external IP:

```
cityflow.sizops.co.il  →  <INGRESS_EXTERNAL_IP>
```

### Step 7 — TLS Certificates

#### Option A — Traefik ACME (What We Use)

Traefik handles TLS termination automatically via Let's Encrypt ACME:

- The `k8s/traefik/traefik-config.yml` HelmChart CRD configures ACME with TLS-ALPN challenge
- The ingress resource uses `certresolver: letsencrypt` annotation
- Certificates are auto-renewed before expiry
- No manual certificate management needed

> **Note:** HTTP challenge was tested but returned 404 (Traefik ACME challenge router wasn't intercepting `.well-known/acme-challenge/` on port 80). TLS-ALPN challenge works on port 443.

#### Option B — Manual Certificate

Create a TLS secret from your certificate files:

```bash
kubectl create secret tls cityflow-tls \
  --namespace=cityflow \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key
```

#### Option C — cert-manager

1. Install cert-manager: https://cert-manager.io/docs/installation/
2. Create a ClusterIssuer for Let's Encrypt
3. Add `cert-manager.io/cluster-issuer` annotation to the ingress
4. Apply the updated ingress — cert-manager will automatically provision certificates

### Health Checks

| Component  | Liveness Probe           | Readiness Probe           |
|------------|--------------------------|---------------------------|
| Backend    | `GET /health` (HTTP)     | `GET /ready` (HTTP, checks DB) |
| Frontend   | `GET /healthz` (HTTP)    | `GET /healthz` (HTTP)     |
| MongoDB    | `mongosh --eval ping`    | `mongosh --eval ping`     |

### Security — Network Policies

The deployment includes NetworkPolicies that act as a firewall between pods:

| Policy | Effect |
|--------|--------|
| `deny-all-ingress` | Denies all inbound traffic to every pod by default |
| `mongodb-allow-backend-only` | Allows inbound to MongoDB **only** from backend pods (port 27017) |
| `backend-networkpolicy` | Allows inbound to backend from frontend and ingress controller |
| `frontend-networkpolicy` | Allows inbound to frontend from ingress controller |

**Result**: MongoDB is completely isolated — no pod, service, or external IP can reach it except the backend.

> **Note**: NetworkPolicies require a CNI plugin that supports them (Calico, Cilium, Weave, etc.).
> K3s ships with a built-in policy engine. Verify with:
> ```bash
> kubectl get networkpolicy -n cityflow
> ```

### Security — MongoDB Authentication

MongoDB runs with root authentication enabled:

- A `mongodb-credentials` Secret stores the username and password
- The MongoDB URI in `backend-secrets` includes `authSource=admin`
- Probes authenticate before checking health
- No unauthenticated access is possible

### Scaling

```bash
# Scale backend
kubectl scale deployment cityflow-backend --replicas=4 -n cityflow

# Scale frontend
kubectl scale deployment cityflow-frontend --replicas=3 -n cityflow
```

> MongoDB is deployed as a StatefulSet. Scaling to multiple replicas requires
> configuring a replica set. For production, consider using a managed MongoDB
> service (MongoDB Atlas, AWS DocumentDB, etc.).

---

## Environment Variables

| Variable               | Description                          | Default                          | Source     |
|------------------------|--------------------------------------|----------------------------------|------------|
| `PORT`                 | Backend listen port                  | `5000`                           | ConfigMap  |
| `MONGODB_URI`          | MongoDB connection string            | `mongodb://localhost:27017/cityflow` | Secret |
| `JWT_SECRET`           | Secret key for JWT signing           | **Required — no default**        | Secret     |
| `TICK_INTERVAL_MINUTES`| Game tick interval in minutes        | `60`                             | ConfigMap  |
| `ADMIN_EMAIL`          | Admin account email                  | `admin@cityflow.com`             | ConfigMap  |
| `ADMIN_PASSWORD`       | Admin account password               | `admin123`                       | Secret     |
| `SMTP_HOST`            | SMTP relay host                      | `smtp-relay.brevo.com`           | Secret     |
| `SMTP_PORT`            | SMTP relay port                      | `587`                            | Secret     |
| `SMTP_SECURE`          | Use TLS (true/false)                 | `false`                          | Secret     |
| `SMTP_USER`            | SMTP authentication login            | **Required**                     | Secret     |
| `SMTP_PASS`            | SMTP authentication key              | **Required**                     | Secret     |
| `EMAIL_FROM`           | Default sender address               | `noreply@sizops.co.il`           | Secret     |
| `FRONTEND_URL`         | Frontend URL for OAuth redirects     | `http://localhost:5173`           | ConfigMap  |
| `OAUTH_GOOGLE_CLIENT_ID`     | Google OAuth client ID         | **Empty (disabled)**             | Secret     |
| `OAUTH_GOOGLE_CLIENT_SECRET` | Google OAuth client secret     | **Empty (disabled)**             | Secret     |
| `OAUTH_GOOGLE_REDIRECT_URI`  | Google OAuth redirect URI      | Auto-detected                    | Secret     |
| `OAUTH_DISCORD_CLIENT_ID`    | Discord OAuth client ID        | **Empty (disabled)**             | Secret     |
| `OAUTH_DISCORD_CLIENT_SECRET`| Discord OAuth client secret    | **Empty (disabled)**             | Secret     |
| `OAUTH_DISCORD_REDIRECT_URI` | Discord OAuth redirect URI     | Auto-detected                    | Secret     |

---

## Secrets Management

Secrets are stored as Kubernetes Secrets and injected as environment variables into pods.

Three core secrets are required, plus optional OAuth secrets:

| Secret | Contents |
|--------|----------|
| `mongodb-credentials` | MongoDB root username and password |
| `backend-secrets` | `MONGODB_URI` (with credentials), `JWT_SECRET`, `ADMIN_PASSWORD`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`, `OAUTH_DISCORD_CLIENT_ID`, `OAUTH_DISCORD_CLIENT_SECRET`, `OAUTH_GOOGLE_REDIRECT_URI`, `OAUTH_DISCORD_REDIRECT_URI`, `FRONTEND_URL` |
| `ghcr-pull` | Docker registry credentials for pulling GHCR images |

**Rules:**
- Never commit real secret values to Git
- The `k8s/config/backend-secrets.yml.example` file is a **template** with placeholder values
- Create actual secrets using the `kubectl create secret` commands in Step 2
- For production, consider using an external secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault) with the External Secrets Operator

---

## ArgoCD Integration

The Kubernetes manifests are fully compatible with ArgoCD for GitOps workflows.

### Setup

1. Install ArgoCD in your cluster: https://argo-cd.readthedocs.io/en/stable/getting-started/
2. Create an ArgoCD Application pointing to the `k8s/` directory:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: cityflow
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/orou500/cityflow.git
    targetRevision: main
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: cityflow
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

3. Apply the Application manifest:
```bash
kubectl apply -f argocd-application.yml
```

### How It Works

- ArgoCD watches the `k8s/` directory in the Git repository
- The CD pipeline updates image tags in deployment manifests with the full `$GITHUB_SHA`
- On every push to `main`, ArgoCD detects drift and syncs automatically
- The `kustomization.yml` file defines all resources in the correct apply order
- Secrets must be managed separately (ArgoCD does not sync secrets by default)

---

## Backup & Restore

Backups are managed from the **Admin Panel** (Database tab) or via API endpoints.

### How It Works

- Backups use the native MongoDB driver (no CLI tools like `mongodump`)
- Data is exported as EJSON lines (one document per line) and gzip-compressed
- Backup files are stored on a PersistentVolumeClaim (`cityflow-backups`, 5Gi)
- Automatic retention keeps a configurable number of backups (default: 5)
- Logs are stored per-backup and visible in the admin panel

### Restore Process

1. Drops each collection and re-inserts documents with proper ObjectId conversion
2. Restores the `users` collection (including balances, portfolios, settings)
3. Preserves the performing admin user to prevent lockout
4. Validates document counts after restore
5. Frontend clears auth state and redirects to login

### Admin Endpoints

| Action | Method | Endpoint |
| ------ | ------ | -------- |
| Create backup | POST | `/api/admin/backups` |
| List backups | GET | `/api/admin/backups` |
| Get settings | GET | `/api/admin/backups/settings` |
| Download backup | GET | `/api/admin/backups/:id/download` |
| Upload & restore | POST | `/api/admin/backups/upload` |
| Restore from backup | POST | `/api/admin/backups/:id/restore` |
| Delete backup | DELETE | `/api/admin/backups/:id` |
| View logs | GET | `/api/admin/backups/:id/logs` |
| Run retention | POST | `/api/admin/backups/retention` |

---

## Maintenance Mode

Admins can enable maintenance mode to block non-admin access during deployments or emergencies.

### How It Works

- Toggled from the Admin Panel (Maintenance tab) or via API
- Stored in the `GameState` document (persists across restarts)
- Backend middleware returns HTTP 503 for all non-auth routes
- Admin users can still access the app and login
- Frontend shows a full-page maintenance block for guests and a yellow banner for logged-in non-admin users

### Admin Endpoints

| Action | Method | Endpoint |
| ------ | ------ | -------- |
| Get status | GET | `/api/admin/maintenance` |
| Enable | POST | `/api/admin/maintenance/enable` |
| Disable | POST | `/api/admin/maintenance/disable` |

---

## Email Infrastructure

Emails are sent via **Brevo SMTP** using the `sizops.co.il` domain. The email service is a reusable module that any part of the backend can call.

### Sender Addresses

| Address | Purpose |
|---------|---------|
| `noreply@sizops.co.il` | Default sender for automated emails |
| `support@sizops.co.il` | Support-related replies |
| `admin@sizops.co.il` | Admin alerts and system notifications |
| `notifications@sizops.co.il` | User notifications |

### Email Templates

| Template | Use Case |
|----------|----------|
| `passwordReset` | Password reset link (1-hour expiry) |
| `verification` | Email verification (24-hour expiry) |
| `accountActivated` | Welcome after verification |
| `systemNotification` | System announcements and alerts |
| `friendRequest` | Friend request notification |
| `adminAlert` | Admin system alerts |
| `testEmail` | SMTP connectivity test |

### How It Works

- The `email.js` service uses a connection pool for performance
- Failed sends are retried up to 3 times with exponential backoff
- All sends are logged (success, failure, messageId)
- HTML emails include a plain-text fallback
- If SMTP is not configured, emails are skipped gracefully (no crash)

### DNS Configuration

For email authentication on `sizops.co.il`, configure these DNS records at your registrar:

```
# SPF (allows Brevo to send on your behalf)
Type: TXT
Name: @
Value: "v=spf1 include:sendinblue.com ~all"

# DKIM (provided by Brevo after domain verification)
Type: TXT
Name: s1._domainkey
Value: (obtained from Brevo dashboard)

# DMARC (email policy)
Type: TXT
Name: _dmarc
Value: "v=DMARC1; p=quarantine; rua=mailto:admin@sizops.co.il"
```

### Brevo Setup Steps

1. Create a Brevo account at https://app.brevo.com
2. Go to **Settings > SMTP & API > SMTP**
3. Generate SMTP credentials (login + key)
4. Go to **Settings > Senders & IP > Domains**
5. Add `sizops.co.il` and verify DNS records
6. Copy SMTP credentials to Kubernetes secrets

### Admin Endpoints

| Action | Method | Endpoint |
| ------ | ------ | -------- |
| Send test email | POST | `/api/admin/email/test` |
| Check SMTP status | GET | `/api/admin/email/status` |

### Usage from Code

```javascript
import { sendEmail } from './services/email.js';
import emailTemplates from './services/emailTemplates.js';

const template = emailTemplates.passwordReset({
  username: 'player1',
  resetUrl: 'https://cityflow.sizops.co.il/reset-token123',
});

await sendEmail({ to: 'player1@example.com', ...template });
```

---

## OAuth (Social Login)

OAuth is **optional**. If the `OAUTH_GOOGLE_CLIENT_ID` / `OAUTH_DISCORD_CLIENT_ID` env vars are empty, the login page hides the social buttons. Users can always log in with username/password.

### How It Works

- **Authorization code flow** (no Passport.js — direct API calls to Google/Discord)
- CSRF protection via random `state` tokens (10 min expiry, in-memory)
- Users can link multiple providers to one account (Google + Discord via same email)
- OAuth-only users (no password) must set a password before unlinking all OAuth providers
- The redirect URI is auto-detected: `localhost` = direct, production = `/api/auth/<provider>/callback`

### Provider Setup — Google

1. Go to [Google Cloud Console > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application type)
3. Add **Authorized redirect URIs**:
   - `http://localhost:5000/api/auth/google/callback` (dev)
   - `https://cityflow.sizops.co.il/api/auth/google/callback` (prod)
4. Copy the **Client ID** and **Client Secret**

### Provider Setup — Discord

1. Go to [Discord Developer Portal > Applications](https://discord.com/developers/applications)
2. Create a new application, go to **OAuth2**
3. Set the **Redirect URI** to:
   - `http://localhost:5000/api/auth/discord/callback` (dev)
   - `https://cityflow.sizops.co.il/api/auth/discord/callback` (prod)
4. Copy the **Client ID** and **Client Secret**

### Kubernetes Setup

```bash
# Create the OAuth secret (see Step 2 above)
kubectl create secret generic oauth-secrets \
  --namespace=cityflow \
  --from-literal=OAUTH_GOOGLE_CLIENT_ID="<google-client-id>" \
  --from-literal=OAUTH_GOOGLE_CLIENT_SECRET="<google-client-secret>" \
  --from-literal=OAUTH_GOOGLE_REDIRECT_URI="https://cityflow.sizops.co.il/api/auth/google/callback" \
  --from-literal=OAUTH_DISCORD_CLIENT_ID="<discord-client-id>" \
  --from-literal=OAUTH_DISCORD_CLIENT_SECRET="<discord-client-secret>" \
  --from-literal=OAUTH_DISCORD_REDIRECT_URI="https://cityflow.sizops.co.il/api/auth/discord/callback" \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Updating OAuth Secrets

To rotate or add an OAuth secret, update the Kubernetes secret and restart the backend:

```bash
kubectl create secret generic oauth-secrets \
  --namespace=cityflow \
  --from-literal=OAUTH_GOOGLE_CLIENT_ID="new-value" \
  ... \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment/cityflow-backend -n cityflow
```

### Disabling OAuth

To disable a provider, simply leave its `OAUTH_*` env vars empty. The login page will not show that button.

### Troubleshooting OAuth

| Issue | Fix |
|-------|-----|
| "OAuth not configured" | Ensure `OAUTH_GOOGLE_CLIENT_ID` / `OAUTH_DISCORD_CLIENT_ID` are set in the `oauth-secrets` secret |
| Redirect URI mismatch | The redirect URI in the provider console must **exactly** match the env var value |
| "Invalid state parameter" | CSRF state expired (10 min) — user must try again |
| Account linking fails (email mismatch) | The email on the OAuth provider must match an existing CityFlow account |

---

## Troubleshooting

### Pods stuck in `Pending`

```bash
kubectl describe pod <pod-name> -n cityflow
# Check events for scheduling issues (insufficient resources, node affinity, etc.)
```

### Backend pods in `CrashLoopBackOff`

```bash
kubectl logs <pod-name> -n cityflow --previous
# Common causes:
# - MongoDB auth failed (check mongodb-credentials secret)
# - MONGODB_URI has wrong credentials or authSource
# - JWT_SECRET not set
# - Port already in use
# - Backup PVC not found (ensure k8s/backend/backup-pvc.yml is applied)
```

### OAuth not working / "OAuth not configured"

```bash
# Check oauth-secrets exists and has values
kubectl get secret oauth-secrets -n cityflow -o yaml

# Verify env vars are injected into backend pod
kubectl exec -it <backend-pod> -n cityflow -- env | grep OAUTH

# Check redirect URI matches exactly (no trailing slash, correct domain)
# Google: https://cityflow.sizops.co.il/api/auth/google/callback
# Discord: https://cityflow.sizops.co.il/api/auth/discord/callback

# Restart backend if you just created/updated the secret
kubectl rollout restart deployment/cityflow-backend -n cityflow
```

### Ingress not routing

```bash
kubectl describe ingress cityflow-ingress -n cityflow
# Check:
# - Ingress class is `traefik` (K3s default)
# - Backend service name and port are correct
# - TLS is handled by certresolver: letsencrypt (no manual tls section needed)
# - Traefik is running: kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik
```

### MongoDB persistent volume issues

```bash
kubectl get pvc -n cityflow
# PVCs must be bound before MongoDB pods start
# Check storage class availability:
kubectl get storageclass
# For K3s, use `local-path` StorageClass
```

### Frontend can't reach backend

```bash
# Verify backend service is running
kubectl get svc cityflow-backend -n cityflow

# Test connectivity from within the cluster
kubectl run debug --rm -it --image=curlimages/curl -n cityflow \
  -- curl http://cityflow-backend:5000/health
```

### Backend can't connect to MongoDB

```bash
# Check MongoDB pod is running
kubectl get pods -n cityflow -l app.kubernetes.io/name=mongodb

# Verify credentials secret exists
kubectl get secret mongodb-credentials -n cityflow

# Test MongoDB connectivity from a backend pod
kubectl exec -it <backend-pod> -n cityflow -- \
  mongosh -u cityflow -p "$MONGO_PASS" --authenticationDatabase admin \
  --host cityflow-mongodb-0.cityflow-mongodb --eval "db.adminCommand('ping')"
```

### Backup PVC not found

```bash
# The backend pod requires a PVC for backup storage
kubectl get pvc cityflow-backups -n cityflow

# If missing, apply it:
kubectl apply -f k8s/backend/backup-pvc.yml
```

### NetworkPolicy blocking traffic

```bash
# List all policies
kubectl get networkpolicy -n cityflow

# Check if a pod has the correct labels (policies match by label)
kubectl get pod <pod-name> -n cityflow --show-labels

# Temporarily remove all policies for debugging
kubectl delete networkpolicy --all -n cityflow
```

### CD pipeline push race condition

The CD pipeline uses a retry loop to handle concurrent pushes from the frontend/backend matrix jobs:

```bash
# If you see push failures in CI, this is expected — the retry loop handles it
# The pipeline retries up to 3 times with 2-second delays
```

---

## Future Improvements

- Horizontal Pod Autoscaler (HPA) for frontend and backend
- Prometheus + Grafana monitoring
- Loki log aggregation
- Multi-environment deployments (development / staging / production)
- Service Mesh (Istio)
- External Secrets Operator for vault integration
