# GCP/Cloud Run Integration for SCAR

Complete guide to enabling Google Cloud Platform deployment capabilities in SCAR for managing Cloud Run services like openhorizon.cc directly from Telegram or GitHub.

## Overview

This integration adds `/cloudrun-*` commands to SCAR, enabling:
- Deploy workspace changes to Cloud Run
- Check service status and logs
- Rollback to previous revisions
- Manage multiple Cloud Run services

---

## Prerequisites

1. Google Cloud account with billing enabled
2. `gcloud` CLI installed on host (✅ Already installed)
3. GCP project created (✅ `openhorizon-cc` exists)
4. Docker socket access in SCAR container (✅ Already configured)

---

## Setup Instructions

### Step 1: Create GCP Service Account

Run these commands on your host machine:

```bash
# Set variables
export PROJECT_ID="openhorizon-cc"
export SERVICE_ACCOUNT="scar-deployer"

# Create service account
gcloud iam service-accounts create $SERVICE_ACCOUNT \
  --display-name="SCAR Bot Deployer" \
  --project=$PROJECT_ID

# Grant Cloud Run admin role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Grant service account user role (required to deploy)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Grant storage admin (for Container Registry)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# Grant Cloud Build editor (for building images)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

# Download service account key
gcloud iam service-accounts keys create ~/scar-gcp-key.json \
  --iam-account=$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com
```

### Step 2: Update SCAR Environment Variables

Add to `/home/samuel/scar/.env`:

```env
# GCP Configuration
GCP_ENABLED=true
GCP_PROJECT_ID=openhorizon-cc
GCP_REGION=europe-west1
GCP_SERVICE_ACCOUNT_KEY_PATH=/app/credentials/gcp-key.json

# Cloud Run Defaults
CLOUDRUN_MEMORY=1Gi
CLOUDRUN_CPU=1
CLOUDRUN_TIMEOUT=300
CLOUDRUN_MAX_INSTANCES=10
CLOUDRUN_MIN_INSTANCES=0
```

### Step 3: Update docker-compose.yml

Add GCP key mount to both profiles:

```yaml
volumes:
  # ... existing mounts ...
  - ~/scar-gcp-key.json:/app/credentials/gcp-key.json:ro
```

### Step 4: Install gcloud in Docker Container

Update `Dockerfile` after the GitHub CLI installation section:

```dockerfile
# Install Google Cloud SDK
RUN curl -sSL https://sdk.cloud.google.com | bash -s -- --disable-prompts \
    && /root/google-cloud-sdk/install.sh --quiet \
    && ln -s /root/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud \
    && ln -s /root/google-cloud-sdk/bin/gsutil /usr/local/bin/gsutil \
    && rm -rf /var/lib/apt/lists/*
```

### Step 5: Add GCP Configuration to Codebase

Update openhorizon codebase configuration:

```bash
# Via SCAR (Telegram or GitHub)
@scar /setcwd /workspace/openhorizon.cc

@scar /gcp-config set open-horizon-app europe-west1
```

Or update directly in database:

```sql
UPDATE remote_agent_codebases
SET gcp_config = '{
  "enabled": true,
  "service_name": "open-horizon-app",
  "region": "europe-west1",
  "project_id": "openhorizon-cc",
  "env_vars_file": ".env.production"
}'::jsonb
WHERE name = 'openhorizon';
```

### Step 6: Rebuild SCAR Container

```bash
cd /home/samuel/scar
docker compose --profile with-db up -d --build
```

---

## Database Schema Changes

Add `gcp_config` column to `remote_agent_codebases` table:

```sql
ALTER TABLE remote_agent_codebases
ADD COLUMN gcp_config JSONB DEFAULT NULL;

-- Example configuration
UPDATE remote_agent_codebases
SET gcp_config = '{
  "enabled": true,
  "service_name": "open-horizon-app",
  "region": "europe-west1",
  "project_id": "openhorizon-cc",
  "env_vars_file": ".env.production",
  "memory": "1Gi",
  "cpu": "1",
  "timeout": 300,
  "max_instances": 10,
  "min_instances": 0
}'::jsonb
WHERE name = 'openhorizon';
```

---

## Available Commands

### `/cloudrun-status`
Check Cloud Run service status

**Usage:**
```
@scar /setcwd /workspace/openhorizon.cc
@scar /cloudrun-status
```

**Output:**
```
☁️  Cloud Run Status - open-horizon-app

🌍 Region: europe-west1
🔗 URL: https://open-horizon-app-xxxxx-ew.a.run.app
✅ Status: True (Ready)
🕐 Last Deployed: 2024-12-20T15:30:00Z
📦 Image: gcr.io/openhorizon-cc/open-horizon-app:latest
🚦 Traffic: 100% → latest revision
```

### `/cloudrun-logs [lines]`
View Cloud Run service logs

**Usage:**
```
@scar /cloudrun-logs 50
```

### `/cloudrun-deploy [yes]`
Deploy workspace changes to Cloud Run

**Usage:**
```
# Preview deployment
@scar /cloudrun-deploy

# Confirm and execute
@scar /cloudrun-deploy yes
```

**Workflow:**
1. Build Docker image from workspace
2. Push to Google Container Registry
3. Deploy to Cloud Run
4. Update traffic to new revision

### `/cloudrun-rollback [revision]`
Rollback to previous revision

**Usage:**
```
# Rollback to previous revision
@scar /cloudrun-rollback

# Rollback to specific revision
@scar /cloudrun-rollback open-horizon-app-00042-abc
```

### `/cloudrun-config [action] [args...]`
Configure Cloud Run settings

**Usage:**
```
# Show current configuration
@scar /cloudrun-config show

# Set service name and region
@scar /cloudrun-config set open-horizon-app europe-west1

# Update resource limits
@scar /cloudrun-config set-memory 2Gi
@scar /cloudrun-config set-cpu 2
```

---

## Deployment Workflow Example

### Scenario: Update openhorizon.cc

```
# 1. Make changes in workspace
You: @scar /setcwd /workspace/openhorizon.cc
You: @scar Add a new analytics dashboard page

# 2. Check current production status
You: @scar /cloudrun-status

Bot: ☁️  Cloud Run Status - open-horizon-app
     ✅ Status: Running
     🔗 URL: https://app.openhorizon.cc
     📦 Current: gcr.io/openhorizon-cc/open-horizon-app:v1.2.3

# 3. Preview deployment
You: @scar /cloudrun-deploy

Bot: 🚀 Deploy to Cloud Run - open-horizon-app

     **Source:** /workspace/openhorizon.cc
     **Target:** gcr.io/openhorizon-cc/open-horizon-app:latest
     **Region:** europe-west1

     **Steps:**
     1. Build Docker image
     2. Push to Container Registry
     3. Deploy to Cloud Run
     4. Route 100% traffic to new revision

     ⚠️ This will update production!

     Reply `/cloudrun-deploy yes` to confirm.

# 4. Confirm deployment
You: @scar /cloudrun-deploy yes

Bot: 🔄 Building Docker image...
     ✅ Image built: gcr.io/openhorizon-cc/open-horizon-app:latest

     📤 Pushing to Container Registry...
     ✅ Image pushed successfully

     🚀 Deploying to Cloud Run...
     ✅ Deployment complete!

     🔗 Service URL: https://open-horizon-app-xxxxx-ew.a.run.app
     🎉 Production updated successfully!

# 5. Verify deployment
You: @scar /cloudrun-logs 20

# 6. Rollback if needed
You: @scar /cloudrun-rollback
```

---

## Architecture

### Deployment Flow

```
User sends: @scar /cloudrun-deploy yes
     ↓
SCAR authenticates with GCP service account
     ↓
Build Docker image from workspace
  docker build -t gcr.io/PROJECT_ID/SERVICE_NAME:latest
     ↓
Push to Google Container Registry
  docker push gcr.io/PROJECT_ID/SERVICE_NAME:latest
     ↓
Deploy to Cloud Run
  gcloud run deploy SERVICE_NAME \
    --image=gcr.io/PROJECT_ID/SERVICE_NAME:latest \
    --region=REGION \
    --memory=1Gi --cpu=1 \
    --env-vars-file=.env.production
     ↓
Return deployment URL and status
```

### File Structure

```
src/
├── clients/
│   └── gcp.ts                    # GCP client (authentication, deploy, status)
├── handlers/
│   └── gcp-commands.ts           # Command handlers (/cloudrun-*)
└── types/
    └── index.ts                  # GCP-related TypeScript types
```

---

## Security Considerations

### Service Account Permissions

**Minimum required IAM roles:**
- `roles/run.admin` - Deploy and manage Cloud Run services
- `roles/iam.serviceAccountUser` - Act as service account
- `roles/storage.admin` - Push/pull from Container Registry
- `roles/cloudbuild.builds.editor` - Build container images

**DO NOT grant:**
- `roles/owner` or `roles/editor` (too broad)
- `roles/compute.admin` (not needed for Cloud Run)

### Key File Security

**Best practices:**
1. ✅ Mount key as read-only (`:ro` flag)
2. ✅ Never commit key to git
3. ✅ Rotate keys every 90 days
4. ✅ Use service account (not user account)
5. ✅ Limit service account to specific project

### Environment Variables

**Production secrets:**
- Store in `.env.production` (gitignored)
- Mount separately in Cloud Run (not in image)
- Use Secret Manager for sensitive data (future enhancement)

---

## Testing

### 1. Test GCP Authentication

```bash
# Inside SCAR container
docker compose exec app-with-db sh

# Authenticate
gcloud auth activate-service-account --key-file=/app/credentials/gcp-key.json

# Test access
gcloud run services list --region=europe-west1
```

### 2. Test Image Build

```bash
# Build manually
cd /workspace/openhorizon.cc
docker build -t gcr.io/openhorizon-cc/test:latest .
```

### 3. Test Deployment via Bot

```
@scar /setcwd /workspace/openhorizon.cc
@scar /cloudrun-status
```

---

## Troubleshooting

### Issue: "Authentication failed"

**Solution:**
1. Verify key file exists: `ls -la ~/scar-gcp-key.json`
2. Check mount in container: `docker compose exec app-with-db ls -la /app/credentials/`
3. Test authentication manually (see Testing section)

### Issue: "Permission denied" during deploy

**Solution:**
1. Verify service account has required roles
2. Check IAM bindings: `gcloud projects get-iam-policy openhorizon-cc`
3. Re-grant roles if needed (see Step 1)

### Issue: "Image push failed"

**Solution:**
1. Configure Docker for GCR: `gcloud auth configure-docker`
2. Verify project ID matches: `echo $GCP_PROJECT_ID`
3. Check network connectivity

### Issue: "Cloud Run deploy timeout"

**Solution:**
1. Increase timeout: `CLOUDRUN_TIMEOUT=600` (10 minutes)
2. Check container startup logs
3. Verify health check configuration

---

## Future Enhancements

1. **Multi-region deployment** - Deploy to multiple regions simultaneously
2. **Traffic splitting** - Canary deployments with gradual rollout
3. **Secret Manager integration** - Manage secrets via GCP Secret Manager
4. **Artifact Registry** - Migrate from GCR to Artifact Registry
5. **Cloud Build integration** - Use Cloud Build instead of local Docker
6. **Automated rollback** - Auto-rollback on error threshold
7. **Custom domains** - Map custom domains via bot commands
8. **Monitoring integration** - Cloud Monitoring alerts and dashboards

---

## Cost Considerations

**Cloud Run Pricing:**
- CPU: ~$0.00002400 per vCPU-second
- Memory: ~$0.00000250 per GiB-second
- Requests: $0.40 per million requests
- Network egress: $0.12 per GB

**Container Registry:**
- Storage: $0.026 per GB/month
- Network egress: $0.12 per GB

**Typical openhorizon.cc costs:**
- ~1000 requests/day
- 1Gi memory, 1 CPU
- **Estimated: $5-15/month**

---

## Summary

With this integration, SCAR can:
- ✅ Deploy workspace changes to Cloud Run
- ✅ Check service status and logs
- ✅ Rollback to previous revisions
- ✅ Manage multiple Cloud Run services
- ✅ All from Telegram or GitHub

**Next steps:**
1. Complete setup (Steps 1-6)
2. Test with openhorizon.cc
3. Add to other projects as needed
