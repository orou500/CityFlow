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
  backend:
    image: ghcr.io/orou500/cityflow-backend:latest
    ports:
      - "5000:5000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/cityflow
      - JWT_SECRET=<your-secret>
      - TICK_INTERVAL_MINUTES=60
    depends_on:
      - mongo

  frontend:
    image: ghcr.io/orou500/cityflow-frontend:latest
    ports:
      - "80:80"
    depends_on:
      - backend

  mongo:
    image: mongo:7
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

> **Note:** The frontend nginx proxies `/api` requests to `http://backend:5000`.
> When using Docker Compose, the service name `backend` is resolved automatically
> by the internal DNS. Customize `frontend/nginx.conf` if your backend runs at a
> different address.

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
├── namespace.yml            # Namespace definition
├── kustomization.yml        # Kustomize overlay for ArgoCD
├── config/
│   ├── backend-configmap.yml  # Non-sensitive configuration
│   └── backend-secrets.yml    # Secret templates (do NOT commit real values)
├── mongodb/
│   ├── statefulset.yml       # MongoDB StatefulSet + PVC
│   └── service.yml           # Headless service for MongoDB
├── backend/
│   ├── deployment.yml        # Backend Deployment (2 replicas)
│   └── service.yml           # Backend ClusterIP Service
├── frontend/
│   ├── deployment.yml        # Frontend Deployment (2 replicas)
│   └── service.yml           # Frontend ClusterIP Service
└── ingress/
    └── ingress.yml           # Ingress with TLS for cityflow.sizops.co.il
```

### Step 1 — Create the Namespace

```bash
kubectl apply -f k8s/namespace.yml
```

### Step 2 — Create Secrets

**Never commit real secrets to Git.** Create them imperatively or from a local file:

```bash
kubectl create secret generic backend-secrets \
  --namespace=cityflow \
  --from-literal=MONGODB_URI='mongodb://cityflow-mongodb-0.cityflow-mongodb:27017/cityflow?replicaSet=rs0' \
  --from-literal=JWT_SECRET='$(openssl rand -base64 32)' \
  --from-literal=ADMIN_PASSWORD='$(openssl rand -base64 16)'
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

**Rules:**
- Never commit real secret values to Git
- The `k8s/config/backend-secrets.yml` file is a **template** with placeholder values
- Create actual secrets using `kubectl create secret` commands
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
# - MongoDB not reachable (check MONGODB_URI secret)
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

---

## Future Improvements

- Horizontal Pod Autoscaler (HPA) for frontend and backend
- Prometheus + Grafana monitoring
- Loki log aggregation
- cert-manager for automatic certificate renewal
- Multi-environment deployments (development / staging / production)
- Service Mesh (Istio)
- External Secrets Operator for vault integration
