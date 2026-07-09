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
| Push to `main`        | `latest`, `main`, `sha-<commit>`          |
| Release `v1.2.3`      | `1.2.3`, `1.2`, `sha-<commit>`            |
| Manual (`workflow_dispatch`) | `main`, `sha-<commit>`              |

## Pipeline

The CD workflow (`.github/workflows/cd.yml`):

1. **Triggered** by push to `main`, tag `v*`, release publish, or manual dispatch
2. **Runs CI** (reuses the CI workflow) to verify lint, format, tests, and build
3. **Builds & pushes** both `cityflow-frontend` and `cityflow-backend` images to GHCR
4. Images are **cached** via GitHub Actions cache for faster subsequent builds

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
  cityflow-backend:
    image: ghcr.io/orou500/cityflow-backend:latest
    ports:
      - "5000:5000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/cityflow
      - JWT_SECRET=<your-secret>
      - TICK_INTERVAL_MINUTES=60
    depends_on:
      - cityflow-backend

  cityflow-frontend:
    image: ghcr.io/orou500/cityflow-frontend:latest
    ports:
      - "80:80"
    depends_on:
      - cityflow-backend

  mongo:
    image: mongo:7
    volumes:
      - mongo-data:/data/db

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

- Kubernetes cluster (v1.25+)
- `kubectl` configured to connect to your cluster
- NGINX Ingress Controller installed
- (Optional) `cert-manager` for automatic TLS certificate management
- (Optional) ArgoCD for GitOps deployments

### Directory Structure

```
k8s/
├── namespace.yml                  # Namespace definition
├── kustomization.yml              # Kustomize overlay for ArgoCD
├── config/
│   ├── backend-configmap.yml      # Non-sensitive configuration
│   ├── backend-secrets.yml.example # Secret template (do NOT commit real values)
│   └── networkpolicy-deny-all.yml # Default deny all ingress
├── mongodb/
│   ├── statefulset.yml            # MongoDB StatefulSet + PVC
│   ├── service.yml                # Headless service for MongoDB
│   └── networkpolicy.yml          # Allow only backend → MongoDB
├── backend/
│   ├── deployment.yml             # Backend Deployment (2 replicas)
│   ├── service.yml                # Backend ClusterIP Service
│   └── networkpolicy.yml          # Allow frontend + ingress → backend
├── frontend/
│   ├── deployment.yml             # Frontend Deployment (2 replicas)
│   ├── service.yml                # Frontend ClusterIP Service
│   └── networkpolicy.yml          # Allow ingress → frontend
└── ingress/
    └── ingress.yml                # Ingress with TLS for cityflow.sizops.co.il
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
  --dry-run=client -o yaml | kubectl apply -f -
```

### Step 3 — Deploy All Resources

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

### Step 4 — Verify Deployment

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

### Step 5 — Configure DNS

Point your domain to the Ingress Controller's external IP:

```
cityflow.sizops.co.il  →  <INGRESS_EXTERNAL_IP>
```

### Step 6 — TLS Certificates

#### Option A — Manual Certificate

Create a TLS secret from your certificate files:

```bash
kubectl create secret tls cityflow-tls \
  --namespace=cityflow \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key
```

#### Option B — cert-manager (Recommended)

1. Install cert-manager: https://cert-manager.io/docs/installation/
2. Create a ClusterIssuer for Let's Encrypt
3. Uncomment the `cert-manager.io/cluster-issuer` annotation in `k8s/ingress/ingress.yml`
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

---

## Secrets Management

Secrets are stored as Kubernetes Secrets and injected as environment variables into pods.

Two secrets are required:

| Secret | Contents |
|--------|----------|
| `mongodb-credentials` | MongoDB root username and password |
| `backend-secrets` | `MONGODB_URI` (with credentials), `JWT_SECRET`, `ADMIN_PASSWORD` |

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
- On every push to `main`, ArgoCD detects drift and syncs automatically
- The `kustomization.yml` file defines all resources in the correct apply order
- Secrets must be managed separately (ArgoCD does not sync secrets by default)

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
```

### Ingress not routing

```bash
kubectl describe ingress cityflow-ingress -n cityflow
# Check:
# - Ingress class matches your controller (nginx)
# - Backend service name and port are correct
# - TLS secret exists and is valid
```

### MongoDB persistent volume issues

```bash
kubectl get pvc -n cityflow
# PVCs must be bound before MongoDB pods start
# Check storage class availability:
kubectl get storageclass
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

### NetworkPolicy blocking traffic

```bash
# List all policies
kubectl get networkpolicy -n cityflow

# Check if a pod has the correct labels (policies match by label)
kubectl get pod <pod-name> -n cityflow --show-labels

# Temporarily remove all policies for debugging
kubectl delete networkpolicy --all -n cityflow
```

---

## Future Improvements

- Horizontal Pod Autoscaler (HPA) for frontend and backend
- Prometheus + Grafana monitoring
- Loki log aggregation
- cert-manager for automatic certificate renewal
- Multi-environment deployments (development / staging / production)
- Service Mesh (Istio)
- External Secrets Operator for vault integration
