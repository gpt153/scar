# GCP Cloud Run Integration - Setup Guide

Complete guide to enabling Google Cloud Platform deployment capabilities in SCAR for managing Cloud Run services directly from Telegram or GitHub.

## Overview

This integration adds `/cloudrun-*` commands to SCAR, enabling you to:
- Deploy workspace changes to Cloud Run
- Check service status and logs
- Rollback to previous revisions
- Manage multiple Cloud Run services
- All from Telegram, Slack, or GitHub

## Prerequisites

Before you begin, ensure you have:

1. ✅ Google Cloud account with billing enabled
2. ✅ `gcloud` CLI installed on host machine
3. ✅ GCP project created (e.g., `my-project-123`)
4. ✅ Docker socket access in SCAR container (already configured)

## Setup Instructions

### Step 1: Create GCP Service Account

Run these commands on your **host machine** (not in Docker):

```bash
# Set variables
export PROJECT_ID="your-project-id"
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

# Set permissions
chmod 600 ~/scar-gcp-key.json
```

### Step 2: Update SCAR Environment Variables

Add to `/home/samuel/scar/.env`:

```env
# GCP Configuration
GCP_ENABLED=true
GCP_PROJECT_ID=your-project-id
GCP_REGION=europe-west1
GCP_SERVICE_ACCOUNT_KEY_PATH=/app/credentials/gcp-key.json

# Cloud Run Defaults
CLOUDRUN_MEMORY=1Gi
CLOUDRUN_CPU=1
CLOUDRUN_TIMEOUT=300
CLOUDRUN_MAX_INSTANCES=10
CLOUDRUN_MIN_INSTANCES=0
```

### Step 3: Rebuild SCAR Container

The GCP key is already mounted in `docker-compose.yml`. Just rebuild:

```bash
cd /home/samuel/scar
docker compose --profile with-db down
docker compose --profile with-db build
docker compose --profile with-db up -d
```

### Step 4: Verify GCP Authentication

Check that gcloud is properly authenticated:

```bash
# Enter container
docker compose exec app-with-db sh

# Check gcloud version
gcloud version

# Verify authentication
gcloud auth list

# Test Cloud Run access
gcloud run services list --region=europe-west1
```

If authentication is successful, you should see your service account listed.

### Step 5: Configure Codebase

Link a codebase and configure Cloud Run:

```
Via Telegram:
/setcwd /workspace/my-app
/cloudrun-config set my-service europe-west1
```

Via GitHub:
```
@scar /cloudrun-config set my-service europe-west1
```

Or update directly in database:

```sql
UPDATE remote_agent_codebases
SET gcp_config = '{
  "enabled": true,
  "service_name": "my-service",
  "region": "europe-west1",
  "project_id": "my-project-123",
  "env_vars_file": ".env.production"
}'::jsonb
WHERE name = 'my-app';
```

## Available Commands

### `/cloudrun-status`

Check Cloud Run service status

**Usage:**
```
/cloudrun-status
```

**Output:**
```
☁️  Cloud Run Status - my-service

🌍 Region: europe-west1
🔗 URL: https://my-service-xxxxx-ew.a.run.app
✅ Status: Ready
🕐 Last Deployed: 2024-12-21T15:30:00Z
📦 Image: gcr.io/my-project-123/my-service:latest
🚦 Traffic: 100% → my-service-00123-abc

Conditions:
✓ Ready
✓ RoutesReady
✓ ConfigurationsReady
```

### `/cloudrun-logs [lines]`

View Cloud Run service logs

**Usage:**
```
/cloudrun-logs 50
```

**Options:**
- `lines` - Number of log lines to fetch (default: 50, max: 1000)

### `/cloudrun-deploy [yes]`

Deploy workspace changes to Cloud Run

**Usage:**
```
# Preview deployment (shows what will happen)
/cloudrun-deploy

# Confirm and execute deployment
/cloudrun-deploy yes
```

**What happens:**
1. Builds Docker image from workspace
2. Pushes image to Google Container Registry
3. Deploys to Cloud Run
4. Routes 100% traffic to new revision

**Example flow:**
```
You: /cloudrun-deploy

Bot: 🚀 Deploy to Cloud Run - my-service

     **Source:** /workspace/my-app
     **Target:** gcr.io/my-project-123/my-service:latest
     **Region:** europe-west1

     **Steps:**
     1. Build Docker image
     2. Push to Container Registry
     3. Deploy to Cloud Run
     4. Route 100% traffic to new revision

     ⚠️ This will update production!

     Reply `/cloudrun-deploy yes` to confirm.

You: /cloudrun-deploy yes

Bot: 🔄 Building Docker image...
     ✅ Image built: gcr.io/my-project-123/my-service:latest

     📤 Pushing to Container Registry...
     ✅ Image pushed successfully

     🚀 Deploying to Cloud Run...
     ✅ Deployment complete!

     🔗 Service URL: https://my-service-xxxxx-ew.a.run.app
     📦 Revision: my-service-00124-def
     🎉 Production updated successfully!
```

### `/cloudrun-rollback [revision]`

Rollback to previous revision

**Usage:**
```
# Rollback to previous revision
/cloudrun-rollback

# Rollback to specific revision
/cloudrun-rollback my-service-00123-abc
```

### `/cloudrun-config [action] [args...]`

Configure Cloud Run settings

**Usage:**
```
# Show current configuration
/cloudrun-config show

# Set service name and region
/cloudrun-config set my-service europe-west1

# Update resource limits
/cloudrun-config set-memory 2Gi
/cloudrun-config set-cpu 2

# Set environment variables file
/cloudrun-config set-env-file .env.production
```

### `/cloudrun-list`

List all Cloud Run services in project

**Usage:**
```
/cloudrun-list
```

## Configuration Options

### Per-Codebase Configuration

Each codebase can have its own GCP configuration stored in the database:

```json
{
  "enabled": true,
  "project_id": "my-project-123",
  "region": "europe-west1",
  "service_name": "my-service",
  "env_vars_file": ".env.production",
  "container_registry": "gcr",
  "build_config": {
    "dockerfile": "Dockerfile",
    "context": ".",
    "build_args": {
      "NODE_ENV": "production"
    }
  },
  "service_config": {
    "memory": "1Gi",
    "cpu": "1",
    "timeout": 300,
    "max_instances": 10,
    "min_instances": 0,
    "concurrency": 80,
    "ingress": "all"
  },
  "deploy": {
    "auto_deploy": false,
    "pre_deploy_command": "npm run build",
    "post_deploy_command": "npm run post-deploy"
  }
}
```

## Security Best Practices

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
1. ✅ Mount key as read-only (`:ro` flag in docker-compose.yml)
2. ✅ Never commit key to git (already in `.gitignore`)
3. ✅ Rotate keys every 90 days
4. ✅ Use service account (not user account)
5. ✅ Limit service account to specific project

**Key rotation:**
```bash
# Create new key
gcloud iam service-accounts keys create ~/scar-gcp-key-new.json \
  --iam-account=scar-deployer@PROJECT_ID.iam.gserviceaccount.com

# Test new key
docker compose --profile with-db down
mv ~/scar-gcp-key.json ~/scar-gcp-key-old.json
mv ~/scar-gcp-key-new.json ~/scar-gcp-key.json
docker compose --profile with-db up -d

# Delete old key (after verification)
gcloud iam service-accounts keys list \
  --iam-account=scar-deployer@PROJECT_ID.iam.gserviceaccount.com
gcloud iam service-accounts keys delete OLD_KEY_ID \
  --iam-account=scar-deployer@PROJECT_ID.iam.gserviceaccount.com
```

## Troubleshooting

### Issue: "Authentication failed"

**Symptoms:** Error when running `/cloudrun-status` or `/cloudrun-deploy`

**Solutions:**
1. Verify key file exists on host:
   ```bash
   ls -la ~/scar-gcp-key.json
   ```

2. Check key is mounted in container:
   ```bash
   docker compose exec app-with-db ls -la /app/credentials/
   ```

3. Test authentication manually:
   ```bash
   docker compose exec app-with-db sh
   gcloud auth activate-service-account --key-file=/app/credentials/gcp-key.json
   gcloud auth list
   ```

### Issue: "Permission denied" during deploy

**Symptoms:** Deployment fails with permission errors

**Solutions:**
1. Verify service account has required roles:
   ```bash
   gcloud projects get-iam-policy PROJECT_ID \
     --flatten="bindings[].members" \
     --filter="bindings.members:scar-deployer@*"
   ```

2. Re-grant roles if missing (see Step 1 in Setup)

### Issue: "Image push failed"

**Symptoms:** Docker push to GCR fails

**Solutions:**
1. Configure Docker for GCR (inside container):
   ```bash
   gcloud auth configure-docker --quiet
   ```

2. Verify project ID matches:
   ```bash
   echo $GCP_PROJECT_ID
   ```

3. Check network connectivity

### Issue: "Cloud Run deploy timeout"

**Symptoms:** Deployment times out

**Solutions:**
1. Increase timeout in `.env`:
   ```env
   CLOUDRUN_BUILD_TIMEOUT=1200000  # 20 minutes
   ```

2. Check container startup logs:
   ```bash
   /cloudrun-logs 100
   ```

3. Verify service health check configuration

### Issue: "Service not found"

**Symptoms:** `/cloudrun-status` returns "Service not found"

**Solutions:**
1. Verify service exists in Cloud Run:
   ```bash
   gcloud run services list --region=REGION --project=PROJECT_ID
   ```

2. Check service name matches configuration:
   ```bash
   /cloudrun-config show
   ```

3. Create service first if it doesn't exist (first deployment will create it)

## Cost Considerations

### Cloud Run Pricing (as of 2024)

**Compute:**
- CPU: ~$0.00002400 per vCPU-second
- Memory: ~$0.00000250 per GiB-second
- Requests: $0.40 per million requests

**Container Registry:**
- Storage: $0.026 per GB/month
- Network egress: $0.12 per GB

### Example Cost Estimate

For a typical service:
- ~1000 requests/day
- 1Gi memory, 1 CPU
- Average request duration: 500ms
- 30 days/month

**Monthly cost:** ~$5-15

### Cost Optimization Tips

1. **Use scale-to-zero:** Set `min_instances: 0` for low-traffic services
2. **Set max instances:** Prevent runaway costs with `max_instances: 10`
3. **Optimize request timeout:** Set `timeout` to match your needs
4. **Monitor usage:** Use GCP Console to track spending
5. **Set budget alerts:** Configure alerts at $10, $50, $100 thresholds

## Advanced Usage

### Using Artifact Registry instead of GCR

Update configuration to use Artifact Registry:

```
/cloudrun-config show
```

Then update `gcp_config` in database:

```json
{
  "container_registry": "artifact-registry",
  "registry_url": "europe-west1-docker.pkg.dev"
}
```

### Custom Build Configuration

Specify custom Dockerfile and build args:

```json
{
  "build_config": {
    "dockerfile": "Dockerfile.production",
    "context": ".",
    "build_args": {
      "NODE_ENV": "production",
      "API_VERSION": "v2"
    }
  }
}
```

### Environment Variables

Create `.env.production` in your workspace:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
API_KEY=secret-key
```

Then configure:

```
/cloudrun-config set-env-file .env.production
```

## Next Steps

1. ✅ Test deployment with a simple service
2. ✅ Configure production secrets
3. ✅ Set up custom domain (via GCP Console)
4. ✅ Configure monitoring and alerts
5. ✅ Document deployment process for your team

## Support

For issues or questions:
- Check the [troubleshooting section](#troubleshooting)
- Review GCP Cloud Run documentation
- Check SCAR logs: `docker compose logs app-with-db`
- File an issue on GitHub
