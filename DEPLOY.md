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

## Required Secrets

The CD pipeline uses the auto-generated `GITHUB_TOKEN` which has `packages: write`
permission. No additional repository secrets are required for publishing.

For deployments, the following environment variables must be configured:

| Variable               | Description                          | Default                          |
|------------------------|--------------------------------------|----------------------------------|
| `MONGODB_URI`          | MongoDB connection string            | `mongodb://localhost:27017/cityflow` |
| `JWT_SECRET`           | Secret key for JWT signing           | **Required — no default**        |
| `TICK_INTERVAL_MINUTES`| Game tick interval in minutes        | `60`                             |
| `ADMIN_EMAIL`          | Admin account email                  | `admin@cityflow.com`             |
| `ADMIN_PASSWORD`       | Admin account password               | `admin123`                       |
