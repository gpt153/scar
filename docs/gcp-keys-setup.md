# GCP Service Account Keys Setup

## Overview

SCAR stores GCP service account keys in `/home/samuel/scar/gcp/` directory. This centralized location allows managing multiple GCP projects with separate service accounts.

## Directory Structure

```
/home/samuel/scar/gcp/
├── scar-gcp-key.json           # Default key (mounted in docker-compose.yml)
├── openhorizon-cc-key.json     # Project-specific key (example)
└── other-project-key.json      # Additional projects as needed
```

## Setup Instructions

### 1. Create Directory

```bash
mkdir -p /home/samuel/scar/gcp
chmod 700 /home/samuel/scar/gcp  # Only owner can access
```

### 2. Create Service Account & Download Key

For each GCP project you want SCAR to manage:

```bash
export PROJECT_ID="your-project-id"
export SERVICE_ACCOUNT="scar-deployer"

# Create service account
gcloud iam service-accounts create $SERVICE_ACCOUNT \
  --display-name="SCAR Bot Deployer" \
  --project=$PROJECT_ID

# Grant required roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

# Download key
gcloud iam service-accounts keys create ~/scar-gcp-key.json \
  --iam-account=$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com
```

### 3. Move Key to SCAR Directory

```bash
# For default key (used by docker-compose.yml)
mv ~/scar-gcp-key.json /home/samuel/scar/gcp/scar-gcp-key.json

# Or for project-specific key
mv ~/scar-gcp-key.json /home/samuel/scar/gcp/${PROJECT_ID}-key.json

# Set permissions
chmod 600 /home/samuel/scar/gcp/*.json
```

### 4. Update docker-compose.yml (if using non-default key)

If using a project-specific key instead of `scar-gcp-key.json`:

```yaml
volumes:
  # Change this line in both app and app-with-db services:
  - /home/samuel/scar/gcp/openhorizon-cc-key.json:/app/credentials/gcp-key.json:ro
```

## Multiple Projects

You can manage multiple GCP projects:

1. Create separate service accounts for each project
2. Download keys with project-specific names
3. Update docker-compose.yml to mount the desired key
4. Restart SCAR to use the new key

**Example:**

```bash
# Project 1: openhorizon-cc
/home/samuel/scar/gcp/openhorizon-cc-key.json

# Project 2: another-project
/home/samuel/scar/gcp/another-project-key.json

# Switch projects by updating docker-compose.yml and restarting
```

## Security Best Practices

✅ **DO:**
- Store keys only in `/home/samuel/scar/gcp/`
- Set permissions to `600` (owner read/write only)
- Use separate service accounts per project
- Rotate keys every 90 days
- Mount keys as read-only (`:ro`) in Docker

❌ **DON'T:**
- Commit keys to git (directory is in .gitignore)
- Share keys between projects
- Use user credentials instead of service accounts
- Grant overly broad IAM roles (owner/editor)

## Key Rotation

To rotate a key:

```bash
# 1. Create new key
gcloud iam service-accounts keys create ~/scar-gcp-key-new.json \
  --iam-account=scar-deployer@PROJECT_ID.iam.gserviceaccount.com

# 2. Test new key
docker compose --profile with-db down
mv /home/samuel/scar/gcp/scar-gcp-key.json /home/samuel/scar/gcp/scar-gcp-key-old.json
mv ~/scar-gcp-key-new.json /home/samuel/scar/gcp/scar-gcp-key.json
chmod 600 /home/samuel/scar/gcp/scar-gcp-key.json
docker compose --profile with-db up -d

# 3. Verify it works
docker compose exec app-with-db sh -c "gcloud auth list"

# 4. Delete old key from GCP (after verification)
gcloud iam service-accounts keys list \
  --iam-account=scar-deployer@PROJECT_ID.iam.gserviceaccount.com

gcloud iam service-accounts keys delete OLD_KEY_ID \
  --iam-account=scar-deployer@PROJECT_ID.iam.gserviceaccount.com

# 5. Delete old key file
rm /home/samuel/scar/gcp/scar-gcp-key-old.json
```

## Troubleshooting

### Issue: Key file not found

```bash
# Check if directory exists
ls -la /home/samuel/scar/gcp/

# Check if key file exists
ls -la /home/samuel/scar/gcp/scar-gcp-key.json

# Check if mounted in container
docker compose exec app-with-db ls -la /app/credentials/
```

### Issue: Permission denied

```bash
# Fix permissions
chmod 700 /home/samuel/scar/gcp
chmod 600 /home/samuel/scar/gcp/*.json
```

### Issue: Authentication failed

```bash
# Test authentication manually
docker compose exec app-with-db sh

# Inside container:
gcloud auth activate-service-account --key-file=/app/credentials/gcp-key.json
gcloud auth list
gcloud projects list
```

## Reference

- [GCP Service Accounts Documentation](https://cloud.google.com/iam/docs/service-accounts)
- [Cloud Run IAM Roles](https://cloud.google.com/run/docs/reference/iam/roles)
- SCAR Setup Guide: `docs/gcp-cloud-run-setup.md`
- CLAUDE.md: See "GCP Cloud Run Deployment" section
