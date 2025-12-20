# SCAR Deployment Guide

## Overview

SCAR uses **GitHub Actions** for automated Docker image builds and **GitHub Container Registry** (ghcr.io) for image storage. Deployment to production VM is **manual** for safety.

---

## CI/CD Pipeline

### Automated (GitHub Actions)

**Workflow**: `.github/workflows/docker-build.yml`

**Triggers**:
- Push to `main` or `develop` → Builds and pushes to registry
- Pull requests → Builds only (no push)
- Git tags (`v*`) → Builds version-tagged images

**Images pushed to**:
```
ghcr.io/gpt153/scar:main        (latest main branch)
ghcr.io/gpt153/scar:develop     (latest develop branch)
ghcr.io/gpt153/scar:latest      (alias for main)
ghcr.io/gpt153/scar:v1.0.0      (version tags)
ghcr.io/gpt153/scar:main-abc123 (commit SHA)
```

**View images**: https://github.com/gpt153/scar/pkgs/container/scar

---

## Manual Deployment (Production VM)

### Option 1: Using Deploy Script (Recommended)

```bash
# Deploy latest main branch
cd /home/samuel/scar
./deploy.sh

# Deploy specific version
./deploy.sh v1.0.0

# Deploy from develop branch
./deploy.sh develop
```

**What it does**:
1. Pulls latest image from registry
2. Stops containers
3. Starts containers with new image
4. Runs health checks
5. Shows container status

---

### Option 2: Manual Commands

```bash
cd /home/samuel/scar

# Pull latest image
docker pull ghcr.io/gpt153/scar:main

# Restart containers
docker compose --profile with-db down
docker compose --profile with-db up -d

# Verify health
curl http://localhost:3001/health
docker compose --profile with-db ps
```

---

## Using Registry Images

### Update docker-compose.yml (One-time setup)

**Current** (builds locally):
```yaml
app-with-db:
  build: .
  # ...
```

**Change to** (uses registry):
```yaml
app-with-db:
  image: ghcr.io/gpt153/scar:main
  # Remove or comment out 'build: .'
  # ...
```

**After this change**:
- ✅ No local builds needed
- ✅ Faster deployments (just pull)
- ✅ Consistent images (same as CI builds)

---

## Rollback to Previous Version

### View available versions
```bash
# List all tags in registry
gh api /user/packages/container/scar/versions | jq -r '.[].metadata.container.tags[]' | sort -u
```

### Deploy specific version
```bash
./deploy.sh v1.0.0
```

Or manually:
```bash
docker pull ghcr.io/gpt153/scar:v1.0.0
# Update docker-compose.yml image tag to v1.0.0
docker compose --profile with-db up -d
```

---

## Monitoring

### GitHub Actions Status

**View workflows**: https://github.com/gpt153/scar/actions

**Check latest build**:
```bash
gh run list -R gpt153/scar --workflow="Build Docker Image" --limit 5
```

### Production Health

```bash
# Quick health check
curl http://localhost:3001/health

# Detailed health
curl http://localhost:3001/health/db
curl http://localhost:3001/health/concurrency

# Container status
docker compose --profile with-db ps

# View logs
docker compose --profile with-db logs -f app-with-db
```

### External Access (Cloudflare)

```bash
curl https://code.153.se/health
```

---

## Troubleshooting

### Build Failed in GitHub Actions

1. Check workflow run: https://github.com/gpt153/scar/actions
2. Review error logs
3. Fix issue and push again (auto-triggers rebuild)

### Cannot Pull Image

**Error**: `Error response from daemon: unauthorized`

**Fix**: Authenticate with GitHub Container Registry
```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u gpt153 --password-stdin
```

**Or** make package public:
1. Go to https://github.com/gpt153/scar/pkgs/container/scar
2. Package settings → Change visibility → Public

### Deployment Failed

**Check logs**:
```bash
docker compose --profile with-db logs app-with-db
```

**Restart**:
```bash
docker compose --profile with-db restart
```

**Full reset**:
```bash
docker compose --profile with-db down
docker compose --profile with-db up -d --force-recreate
```

---

## Development Workflow

### Making Changes

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes, commit
git add .
git commit -m "feat: my feature"

# 3. Push (triggers PR build)
git push origin feature/my-feature

# 4. Create PR on GitHub
# - GitHub Actions builds Docker image (doesn't push)
# - Review and merge

# 5. After merge to main
# - GitHub Actions builds and pushes to ghcr.io/gpt153/scar:main
# - Ready for manual deployment
```

### Testing Locally Before Push

```bash
# Build locally
docker compose --profile with-db build

# Test
docker compose --profile with-db up -d
curl http://localhost:3001/health

# If good, push to GitHub
git push
```

---

## Emergency Procedures

### Rollback to Last Known Good Version

```bash
# 1. Find last good version
docker images | grep scar

# 2. Deploy it
./deploy.sh <commit-sha>

# Or pull specific commit
docker pull ghcr.io/gpt153/scar:main-abc123
# Update docker-compose.yml
docker compose --profile with-db up -d
```

### Bypass Registry (Emergency Local Build)

```bash
cd /home/samuel/scar

# Pull latest code
git pull

# Build locally
docker compose --profile with-db build

# Deploy
docker compose --profile with-db up -d
```

---

## Summary

**✅ Automated**:
- Docker builds on every push to main/develop
- Images pushed to ghcr.io
- Version tagging for releases

**❌ Manual** (as requested):
- Deployment to production VM
- Use `./deploy.sh` when ready

**Safety**:
- No auto-deployment = no surprises
- Full control over production updates
- Easy rollbacks with version tags
