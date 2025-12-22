# GCP/Cloud Run Integration Plan for SCAR

## Executive Summary

This plan details the integration of Google Cloud Platform (GCP) Cloud Run deployment capabilities into SCAR, enabling users to deploy workspace changes to Cloud Run directly from Telegram or GitHub. The solution will add `/cloudrun-*` commands, GCP service account authentication, Docker image building, and Cloud Run service management.

## 1. Solution Overview

### Goals

- **Deploy from Workspace**: Build and deploy workspace changes to Cloud Run
- **Service Management**: Check status, view logs, rollback deployments
- **Configuration Management**: Per-codebase GCP configuration
- **Security**: Service account authentication with minimal permissions
- **Multi-Project**: Support multiple GCP projects and services

### Architecture Approach

Following the existing pattern established by Docker integration:
- `gcp_config` JSONB column in `remote_agent_codebases` table
- `src/clients/gcp.ts` for GCP API interactions
- `src/handlers/gcp-commands.ts` for command handlers
- Integration with existing command handler system

## 2. Architecture & Data Model

### 2.1 Database Schema

**New Column: `gcp_config` in `remote_agent_codebases`**

```sql
-- Migration: 009_add_gcp_config.sql
ALTER TABLE remote_agent_codebases
ADD COLUMN IF NOT EXISTS gcp_config JSONB DEFAULT NULL;

COMMENT ON COLUMN remote_agent_codebases.gcp_config IS
  'GCP Cloud Run configuration for deploying services. Format:
  {
    "enabled": boolean,
    "project_id": string (e.g., "openhorizon-cc"),
    "region": string (e.g., "europe-west1"),
    "service_name": string (Cloud Run service name),
    "env_vars_file": string (path to env file for Cloud Run),
    "container_registry": "gcr" | "artifact-registry" (default: gcr),
    "registry_url": string (optional override, e.g., "europe-west1-docker.pkg.dev"),
    "build_config": {
      "dockerfile": string (path to Dockerfile, default: "Dockerfile"),
      "context": string (build context path, default: "."),
      "build_args": object (build arguments)
    },
    "service_config": {
      "memory": string (e.g., "1Gi"),
      "cpu": string (e.g., "1"),
      "timeout": number (request timeout in seconds),
      "max_instances": number,
      "min_instances": number,
      "concurrency": number (requests per container),
      "ingress": "all" | "internal" | "internal-and-cloud-load-balancing"
    },
    "deploy": {
      "auto_deploy": boolean (deploy on push to main),
      "pre_deploy_command": string (optional),
      "post_deploy_command": string (optional)
    }
  }';

CREATE INDEX IF NOT EXISTS idx_remote_agent_codebases_gcp_enabled
ON remote_agent_codebases((gcp_config->>'enabled'))
WHERE gcp_config IS NOT NULL;
```

### 2.2 TypeScript Interfaces

**File: `src/types/index.ts` additions**

```typescript
/**
 * GCP Cloud Run configuration
 */
export interface GCPConfig {
  enabled: boolean;
  project_id: string;
  region: string;
  service_name: string;
  env_vars_file?: string;
  container_registry?: 'gcr' | 'artifact-registry';
  registry_url?: string;
  build_config?: {
    dockerfile?: string;
    context?: string;
    build_args?: Record<string, string>;
  };
  service_config?: {
    memory?: string;
    cpu?: string;
    timeout?: number;
    max_instances?: number;
    min_instances?: number;
    concurrency?: number;
    ingress?: 'all' | 'internal' | 'internal-and-cloud-load-balancing';
  };
  deploy?: {
    auto_deploy?: boolean;
    pre_deploy_command?: string;
    post_deploy_command?: string;
  };
}

/**
 * Cloud Run service status
 */
export interface CloudRunService {
  name: string;
  region: string;
  url: string;
  ready: boolean;
  latestRevision: string;
  latestDeployed: Date;
  image: string;
  traffic: Array<{
    revision: string;
    percent: number;
  }>;
  conditions: Array<{
    type: string;
    status: string;
    message?: string;
  }>;
}

/**
 * Cloud Run deployment result
 */
export interface CloudRunDeploymentResult {
  success: boolean;
  message: string;
  serviceUrl?: string;
  revision?: string;
  steps: {
    build: boolean;
    push: boolean;
    deploy: boolean;
  };
  errors: string[];
}
```

### 2.3 Environment Configuration

**File: `.env.example` additions**

```env
# ============================================================================
# GCP Cloud Run Configuration
# ============================================================================

# Enable GCP Cloud Run integration
GCP_ENABLED=false

# GCP Service Account Authentication
# Path to service account key JSON file (mount in Docker)
GCP_SERVICE_ACCOUNT_KEY_PATH=/app/credentials/gcp-key.json

# Default GCP Configuration (can be overridden per codebase)
GCP_PROJECT_ID=your-project-id
GCP_REGION=europe-west1

# Container Registry
# Options: gcr (Google Container Registry) | artifact-registry (Artifact Registry)
GCP_CONTAINER_REGISTRY=gcr

# Cloud Run Service Defaults
CLOUDRUN_MEMORY=1Gi
CLOUDRUN_CPU=1
CLOUDRUN_TIMEOUT=300
CLOUDRUN_MAX_INSTANCES=10
CLOUDRUN_MIN_INSTANCES=0
CLOUDRUN_CONCURRENCY=80

# Build Configuration
CLOUDRUN_BUILD_TIMEOUT=600  # seconds
```

## 3. Implementation Components

### 3.1 GCP Client (`src/clients/gcp.ts`)

**Purpose**: Encapsulate all GCP API interactions and authentication

**Key Functions**:

```typescript
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { CloudRunService, CloudRunDeploymentResult, GCPConfig } from '../types';

/**
 * Authenticate with GCP using service account
 */
export async function authenticateGCP(): Promise<boolean>;

/**
 * Build and push Docker image to Container Registry
 */
export async function buildAndPushImage(
  workspacePath: string,
  projectId: string,
  serviceName: string,
  config: GCPConfig
): Promise<{ success: boolean; imageUrl: string; error?: string }>;

/**
 * Deploy image to Cloud Run
 */
export async function deployToCloudRun(
  imageUrl: string,
  projectId: string,
  region: string,
  serviceName: string,
  config: GCPConfig
): Promise<CloudRunDeploymentResult>;

/**
 * Get Cloud Run service status
 */
export async function getCloudRunService(
  projectId: string,
  region: string,
  serviceName: string
): Promise<CloudRunService | null>;

/**
 * Get Cloud Run service logs
 */
export async function getCloudRunLogs(
  projectId: string,
  region: string,
  serviceName: string,
  lines?: number
): Promise<string>;

/**
 * List all Cloud Run services in a region
 */
export async function listCloudRunServices(
  projectId: string,
  region: string
): Promise<CloudRunService[]>;

/**
 * Rollback to previous revision
 */
export async function rollbackCloudRun(
  projectId: string,
  region: string,
  serviceName: string,
  targetRevision?: string
): Promise<{ success: boolean; message: string }>;

/**
 * Update traffic routing
 */
export async function updateTraffic(
  projectId: string,
  region: string,
  serviceName: string,
  trafficSplit: Record<string, number>
): Promise<{ success: boolean; message: string }>;

/**
 * Check if gcloud CLI is installed and authenticated
 */
export async function checkGCloudAccess(): Promise<{
  installed: boolean;
  authenticated: boolean;
  version?: string;
}>;
```

**Implementation Notes**:
- Use `child_process.execSync` for gcloud CLI calls (similar to `src/clients/docker.ts`)
- Handle authentication via service account key file
- Parse JSON output from gcloud commands
- Provide detailed error messages for common failures

### 3.2 GCP Command Handlers (`src/handlers/gcp-commands.ts`)

**Purpose**: Handle all `/cloudrun-*` slash commands

**Key Functions**:

```typescript
import { CommandResult } from '../types';
import * as gcpClient from '../clients/gcp';
import { getCodebase, getGCPConfig, updateGCPConfig } from '../db/codebases';

/**
 * Handle /cloudrun-status command
 * Shows Cloud Run service status
 */
export async function handleCloudRunStatusCommand(
  codebaseId: string | null
): Promise<CommandResult>;

/**
 * Handle /cloudrun-logs [lines] command
 * View Cloud Run service logs
 */
export async function handleCloudRunLogsCommand(
  codebaseId: string | null,
  args: string[]
): Promise<CommandResult>;

/**
 * Handle /cloudrun-deploy [yes] command
 * Deploy workspace changes to Cloud Run
 */
export async function handleCloudRunDeployCommand(
  codebaseId: string | null,
  cwd: string | null,
  args: string[]
): Promise<CommandResult>;

/**
 * Handle /cloudrun-rollback [revision] command
 * Rollback to previous revision
 */
export async function handleCloudRunRollbackCommand(
  codebaseId: string | null,
  args: string[]
): Promise<CommandResult>;

/**
 * Handle /cloudrun-config [action] [args...] command
 * Configure Cloud Run settings
 */
export async function handleCloudRunConfigCommand(
  codebaseId: string | null,
  args: string[]
): Promise<CommandResult>;

/**
 * Handle /cloudrun-list command
 * List all Cloud Run services in project
 */
export async function handleCloudRunListCommand(
  codebaseId: string | null
): Promise<CommandResult>;
```

### 3.3 Database Operations (`src/db/codebases.ts` additions)

**New Functions**:

```typescript
/**
 * Get GCP configuration for a codebase
 */
export async function getGCPConfig(id: string): Promise<GCPConfig | null> {
  const result = await pool.query<{ gcp_config: unknown }>(
    'SELECT gcp_config FROM remote_agent_codebases WHERE id = $1',
    [id]
  );

  if (!result.rows[0] || !result.rows[0].gcp_config) {
    return null;
  }

  return result.rows[0].gcp_config as GCPConfig;
}

/**
 * Update GCP configuration for a codebase
 */
export async function updateGCPConfig(
  id: string,
  config: GCPConfig | null
): Promise<void> {
  await pool.query(
    'UPDATE remote_agent_codebases SET gcp_config = $1, updated_at = NOW() WHERE id = $2',
    [config ? JSON.stringify(config) : null, id]
  );
}

/**
 * Get all codebases with GCP enabled
 */
export async function getGCPEnabledCodebases(): Promise<Codebase[]> {
  const result = await pool.query<Codebase>(
    `SELECT * FROM remote_agent_codebases
     WHERE gcp_config IS NOT NULL
     AND gcp_config->>'enabled' = 'true'
     ORDER BY updated_at DESC`
  );
  return result.rows;
}

/**
 * Find codebase by Cloud Run service name
 */
export async function findCodebaseByCloudRunService(
  serviceName: string
): Promise<Codebase | null> {
  const result = await pool.query<Codebase>(
    `SELECT * FROM remote_agent_codebases
     WHERE gcp_config->>'service_name' = $1
     AND gcp_config->>'enabled' = 'true'
     LIMIT 1`,
    [serviceName]
  );
  return result.rows[0] || null;
}
```

### 3.4 Command Handler Integration (`src/handlers/command-handler.ts`)

**Add to switch statement** (around line 400+):

```typescript
// GCP Cloud Run commands
case 'cloudrun-status': {
  return await handleCloudRunStatusCommand(conversation.codebase_id);
}

case 'cloudrun-logs': {
  return await handleCloudRunLogsCommand(conversation.codebase_id, args);
}

case 'cloudrun-deploy': {
  return await handleCloudRunDeployCommand(
    conversation.codebase_id,
    conversation.cwd,
    args
  );
}

case 'cloudrun-rollback': {
  return await handleCloudRunRollbackCommand(conversation.codebase_id, args);
}

case 'cloudrun-config': {
  return await handleCloudRunConfigCommand(conversation.codebase_id, args);
}

case 'cloudrun-list': {
  return await handleCloudRunListCommand(conversation.codebase_id);
}

case 'gcp-config': {
  // Alias for cloudrun-config
  return await handleCloudRunConfigCommand(conversation.codebase_id, args);
}
```

### 3.5 Dockerfile Updates

**Add Google Cloud SDK installation** (after GitHub CLI section, around line 31):

```dockerfile
# Install Google Cloud SDK
RUN curl -sSL https://sdk.cloud.google.com | bash -s -- --disable-prompts \
    && /root/google-cloud-sdk/install.sh --quiet \
    && ln -s /root/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud \
    && ln -s /root/google-cloud-sdk/bin/gsutil /usr/local/bin/gsutil \
    && ln -s /root/google-cloud-sdk/bin/docker-credential-gcloud /usr/local/bin/docker-credential-gcloud \
    && rm -rf /var/lib/apt/lists/*

# Configure gcloud to use service account authentication
# This will be activated at runtime via setup script
RUN mkdir -p /app/credentials
```

### 3.6 docker-compose.yml Updates

**Add GCP key mount to both profiles** (around line 40 for `app-with-db`):

```yaml
volumes:
  - /home/samuel/.archon/workspaces:/workspace
  - /home/samuel/.archon/worktrees:/worktrees
  # Docker socket for container management
  - /var/run/docker.sock:/var/run/docker.sock
  # Persistent Playwright browser storage
  - /home/samuel/dockerMCP/playwright-browsers:/home/appuser/.cache/ms-playwright
  # GCP service account key (read-only)
  - ~/scar-gcp-key.json:/app/credentials/gcp-key.json:ro
```

**Add for `app` profile** (around line 14):

```yaml
volumes:
  - /home/samuel/.archon/workspaces:/workspace
  # GCP service account key (read-only)
  - ~/scar-gcp-key.json:/app/credentials/gcp-key.json:ro
```

### 3.7 Startup Script for GCP Authentication

**File: `src/scripts/setup-gcp-auth.ts`** (similar to `setup-auth.js`)

```typescript
/**
 * Setup GCP authentication from service account key
 * Runs on container startup if GCP is enabled
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const keyPath = process.env.GCP_SERVICE_ACCOUNT_KEY_PATH || '/app/credentials/gcp-key.json';
const gcpEnabled = process.env.GCP_ENABLED === 'true';

if (!gcpEnabled) {
  console.log('[GCP Setup] GCP integration disabled (GCP_ENABLED=false)');
  process.exit(0);
}

if (!existsSync(keyPath)) {
  console.error(`[GCP Setup] Service account key not found at ${keyPath}`);
  console.error('[GCP Setup] Please mount the key file and set GCP_SERVICE_ACCOUNT_KEY_PATH');
  process.exit(1);
}

try {
  // Activate service account
  execSync(`gcloud auth activate-service-account --key-file=${keyPath}`, {
    stdio: 'inherit',
  });

  // Set default project
  const projectId = process.env.GCP_PROJECT_ID;
  if (projectId) {
    execSync(`gcloud config set project ${projectId}`, { stdio: 'inherit' });
  }

  // Configure Docker to use gcloud as credential helper
  execSync('gcloud auth configure-docker --quiet', { stdio: 'inherit' });

  console.log('[GCP Setup] ✓ GCP authentication successful');
} catch (error) {
  console.error('[GCP Setup] Failed to authenticate with GCP:', error);
  process.exit(1);
}
```

**Update CMD in Dockerfile**:

```dockerfile
CMD ["sh", "-c", "npm run setup-auth && node dist/scripts/setup-gcp-auth.js && npm start"]
```

**Add to package.json scripts**:

```json
"setup-gcp-auth": "node dist/scripts/setup-gcp-auth.js"
```

## 4. Command Reference

### 4.1 `/cloudrun-status`

**Usage**: `/cloudrun-status`

**Purpose**: Check Cloud Run service status

**Response Format**:
```
☁️  Cloud Run Status - open-horizon-app

🌍 Region: europe-west1
🔗 URL: https://open-horizon-app-xxxxx-ew.a.run.app
✅ Status: True (Ready)
🕐 Last Deployed: 2024-12-20T15:30:00Z
📦 Image: gcr.io/openhorizon-cc/open-horizon-app:latest
🚦 Traffic: 100% → latest revision

Conditions:
✓ Ready
✓ RoutesReady
✓ ConfigurationsReady
```

### 4.2 `/cloudrun-logs [lines]`

**Usage**:
- `/cloudrun-logs` (default: 50 lines)
- `/cloudrun-logs 100`

**Purpose**: View Cloud Run service logs

**Response**: Stream of log entries with timestamps

### 4.3 `/cloudrun-deploy [yes]`

**Usage**:
- `/cloudrun-deploy` (preview only)
- `/cloudrun-deploy yes` (execute deployment)

**Purpose**: Deploy workspace changes to Cloud Run

**Workflow**:
1. Validate GCP configuration exists
2. Show deployment preview:
   ```
   🚀 Deploy to Cloud Run - open-horizon-app

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
   ```
3. If confirmed, execute deployment
4. Return deployment result with service URL

### 4.4 `/cloudrun-rollback [revision]`

**Usage**:
- `/cloudrun-rollback` (rollback to previous)
- `/cloudrun-rollback open-horizon-app-00042-abc`

**Purpose**: Rollback to previous revision

### 4.5 `/cloudrun-config [action] [args...]`

**Usage**:
- `/cloudrun-config show`
- `/cloudrun-config set <service-name> <region>`
- `/cloudrun-config set-memory 2Gi`
- `/cloudrun-config set-cpu 2`
- `/cloudrun-config set-env-file .env.production`

**Purpose**: Configure Cloud Run settings for codebase

### 4.6 `/cloudrun-list`

**Usage**: `/cloudrun-list`

**Purpose**: List all Cloud Run services in the current project

## 5. Implementation Steps

### Phase 1: Core Infrastructure (Week 1)

**Step 1.1: Database Schema**
- [ ] Create migration `009_add_gcp_config.sql`
- [ ] Test migration on local PostgreSQL
- [ ] Verify indexes and constraints
- [ ] Update `migrations/000_combined.sql`

**Step 1.2: Type Definitions**
- [ ] Add `GCPConfig` to `src/types/index.ts`
- [ ] Add `CloudRunService` interface
- [ ] Add `CloudRunDeploymentResult` interface
- [ ] Update `Codebase` type documentation

**Step 1.3: Database Operations**
- [ ] Add `getGCPConfig()` to `src/db/codebases.ts`
- [ ] Add `updateGCPConfig()` function
- [ ] Add `getGCPEnabledCodebases()` function
- [ ] Add `findCodebaseByCloudRunService()` function
- [ ] Write unit tests in `src/db/codebases.test.ts`

### Phase 2: GCP Client Implementation (Week 1-2)

**Step 2.1: Authentication & Setup**
- [ ] Create `src/clients/gcp.ts`
- [ ] Implement `authenticateGCP()` function
- [ ] Implement `checkGCloudAccess()` function
- [ ] Create `src/scripts/setup-gcp-auth.ts`
- [ ] Test service account authentication

**Step 2.2: Service Management**
- [ ] Implement `getCloudRunService()` function
- [ ] Implement `listCloudRunServices()` function
- [ ] Implement `getCloudRunLogs()` function
- [ ] Parse gcloud JSON output correctly
- [ ] Handle error cases gracefully

**Step 2.3: Deployment Functions**
- [ ] Implement `buildAndPushImage()` function
- [ ] Implement `deployToCloudRun()` function
- [ ] Implement `rollbackCloudRun()` function
- [ ] Implement `updateTraffic()` function
- [ ] Add progress logging for long operations

**Step 2.4: Testing**
- [ ] Write unit tests in `src/clients/gcp.test.ts`
- [ ] Mock gcloud CLI calls
- [ ] Test error handling
- [ ] Test authentication flows

### Phase 3: Command Handlers (Week 2)

**Step 3.1: Basic Commands**
- [ ] Create `src/handlers/gcp-commands.ts`
- [ ] Implement `/cloudrun-status` handler
- [ ] Implement `/cloudrun-logs` handler
- [ ] Implement `/cloudrun-config` handler
- [ ] Test commands via Telegram

**Step 3.2: Deployment Commands**
- [ ] Implement `/cloudrun-deploy` handler
- [ ] Add confirmation flow (preview → confirm)
- [ ] Implement progress updates
- [ ] Handle deployment errors gracefully
- [ ] Add pre/post deploy command execution

**Step 3.3: Advanced Commands**
- [ ] Implement `/cloudrun-rollback` handler
- [ ] Implement `/cloudrun-list` handler
- [ ] Add revision history tracking
- [ ] Implement traffic splitting support

**Step 3.4: Command Integration**
- [ ] Update `src/handlers/command-handler.ts`
- [ ] Add all cloudrun commands to switch statement
- [ ] Update `/help` command with GCP section
- [ ] Add command aliases (e.g., `gcp-config`)

### Phase 4: Docker & Environment Setup (Week 2)

**Step 4.1: Dockerfile Updates**
- [ ] Add Google Cloud SDK installation
- [ ] Create credentials directory
- [ ] Configure Docker credential helper
- [ ] Test Docker image build

**Step 4.2: docker-compose.yml Updates**
- [ ] Add GCP key mount to `app` profile
- [ ] Add GCP key mount to `app-with-db` profile
- [ ] Update environment variables
- [ ] Test both profiles

**Step 4.3: Environment Configuration**
- [ ] Update `.env.example` with GCP variables
- [ ] Add comprehensive comments
- [ ] Document setup steps
- [ ] Create `.env.gcp.example` template

**Step 4.4: Startup Integration**
- [ ] Update package.json with setup script
- [ ] Modify Dockerfile CMD to run GCP setup
- [ ] Test startup flow with/without GCP enabled
- [ ] Handle missing key file gracefully

### Phase 5: Testing & Documentation (Week 3)

**Step 5.1: Integration Testing**
- [ ] Test full deployment workflow
- [ ] Test status and logs commands
- [ ] Test rollback functionality
- [ ] Test configuration management
- [ ] Test error scenarios

**Step 5.2: End-to-End Testing**
- [ ] Deploy test application to Cloud Run
- [ ] Test with openhorizon.cc codebase
- [ ] Verify environment variable handling
- [ ] Test multi-region deployment
- [ ] Test service account permissions

**Step 5.3: Documentation**
- [ ] Create `docs/gcp-cloud-run-setup.md`
- [ ] Update README.md with GCP section
- [ ] Document setup steps in issue description
- [ ] Create troubleshooting guide
- [ ] Add architecture diagrams

**Step 5.4: Code Review & Cleanup**
- [ ] Review all new code
- [ ] Add comprehensive error handling
- [ ] Optimize performance
- [ ] Add logging for debugging
- [ ] Clean up console output

## 6. Security Considerations

### 6.1 Service Account Permissions

**Minimum Required IAM Roles**:
- `roles/run.admin` - Deploy and manage Cloud Run services
- `roles/iam.serviceAccountUser` - Act as service account
- `roles/storage.admin` - Push/pull from Container Registry
- `roles/cloudbuild.builds.editor` - Build container images

**Security Best Practices**:
- ✅ Use service account (not user account)
- ✅ Limit service account to specific project
- ✅ Mount key file as read-only (`:ro`)
- ✅ Never commit key to git
- ✅ Rotate keys every 90 days
- ❌ DO NOT grant `roles/owner` or `roles/editor`
- ❌ DO NOT grant `roles/compute.admin`

### 6.2 Key File Security

**Setup Steps**:
1. Create service account via gcloud CLI
2. Download key to `~/scar-gcp-key.json`
3. Set file permissions: `chmod 600 ~/scar-gcp-key.json`
4. Add to `.gitignore` (already excluded)
5. Mount in Docker as read-only

**Key Rotation**:
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
gcloud iam service-accounts keys delete OLD_KEY_ID \
  --iam-account=scar-deployer@PROJECT_ID.iam.gserviceaccount.com
```

### 6.3 Environment Variables

**Production Secrets**:
- Store in `.env.production` (gitignored)
- Mount separately in Cloud Run (not in image)
- Use Secret Manager for sensitive data (future enhancement)
- Never log environment variables

## 7. Error Handling & Edge Cases

### 7.1 Common Errors

**Error: "Authentication failed"**
- Verify key file exists at mount path
- Check service account has required permissions
- Ensure gcloud is authenticated correctly

**Error: "Image push failed"**
- Configure Docker for GCR: `gcloud auth configure-docker`
- Verify project ID matches environment variable
- Check network connectivity

**Error: "Cloud Run deploy timeout"**
- Increase timeout: `CLOUDRUN_BUILD_TIMEOUT=600`
- Check container startup logs
- Verify health check configuration

**Error: "Permission denied"**
- Verify service account has all required roles
- Check IAM policy bindings
- Re-grant roles if needed

### 7.2 Edge Cases

**Scenario: Multiple services in one codebase**
- Support multiple `gcp_config` entries (future)
- For now, one service per codebase
- Suggest creating separate codebases

**Scenario: Cross-region deployment**
- Support deploying to multiple regions (future)
- For now, one region per service
- Document manual multi-region setup

**Scenario: Rollback during active traffic**
- Warn user about downtime
- Confirm before rollback
- Monitor deployment status

## 8. Future Enhancements

### Phase 6: Advanced Features (Post-MVP)

1. **Multi-region Deployment**
   - Deploy to multiple regions simultaneously
   - Global load balancing configuration
   - Region failover support

2. **Traffic Splitting & Canary Deployments**
   - Gradual rollout (e.g., 10% → 50% → 100%)
   - A/B testing support
   - Automatic rollback on error threshold

3. **Secret Manager Integration**
   - Store secrets in GCP Secret Manager
   - Auto-inject secrets into Cloud Run
   - Rotate secrets without redeployment

4. **Artifact Registry Migration**
   - Migrate from GCR to Artifact Registry
   - Multi-repository support
   - Vulnerability scanning integration

5. **Cloud Build Integration**
   - Use Cloud Build instead of local Docker
   - Parallel builds for faster deployment
   - Build cache optimization

6. **Custom Domains**
   - Map custom domains via bot commands
   - SSL certificate management
   - DNS configuration

7. **Monitoring & Alerts**
   - Cloud Monitoring integration
   - Alert on error thresholds
   - Performance dashboards
   - Cost tracking

8. **CI/CD Integration**
   - Auto-deploy on GitHub merge
   - Integration with GitHub Actions
   - Deployment pipelines

## 9. Testing Strategy

### Unit Tests

**Files to create**:
- `src/clients/gcp.test.ts` - GCP client functions
- `src/handlers/gcp-commands.test.ts` - Command handlers
- `src/db/codebases.test.ts` (update) - GCP config functions

**Test Coverage**:
- Authentication flows
- Image build and push
- Cloud Run deployment
- Service status retrieval
- Log fetching
- Rollback functionality
- Configuration management
- Error handling

### Integration Tests

**Scenarios**:
- Full deployment workflow (build → push → deploy)
- Configuration updates
- Rollback to previous revision
- Log retrieval
- Status checks
- Multi-service management

### Manual Testing Checklist

- [ ] Install gcloud SDK in Docker container
- [ ] Authenticate with service account
- [ ] Configure gcloud for project
- [ ] Build Docker image from workspace
- [ ] Push image to Container Registry
- [ ] Deploy to Cloud Run
- [ ] Check service status
- [ ] View service logs
- [ ] Rollback to previous revision
- [ ] Update service configuration
- [ ] Test with environment variables
- [ ] Test with custom Dockerfile
- [ ] Verify security (key permissions, IAM)

## 10. Migration & Rollout

### Step 1: Environment Setup

```bash
# On host machine (not in Docker)

# 1. Create GCP service account
export PROJECT_ID="openhorizon-cc"
export SERVICE_ACCOUNT="scar-deployer"

gcloud iam service-accounts create $SERVICE_ACCOUNT \
  --display-name="SCAR Bot Deployer" \
  --project=$PROJECT_ID

# 2. Grant required roles
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

# 3. Download service account key
gcloud iam service-accounts keys create ~/scar-gcp-key.json \
  --iam-account=$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com

# 4. Set permissions
chmod 600 ~/scar-gcp-key.json
```

### Step 2: Configure Environment

```bash
# Update /home/samuel/scar/.env
cat >> .env << 'EOF'

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
EOF
```

### Step 3: Database Migration

```bash
# Apply migration
docker compose exec postgres psql -U postgres -d remote_coding_agent \
  -f /migrations/009_add_gcp_config.sql
```

### Step 4: Rebuild and Restart

```bash
cd /home/samuel/scar
docker compose --profile with-db down
docker compose --profile with-db build
docker compose --profile with-db up -d
```

### Step 5: Configure Codebase

```bash
# Via Telegram or GitHub
/setcwd /workspace/openhorizon.cc
/cloudrun-config set open-horizon-app europe-west1
/cloudrun-config set-env-file .env.production
/cloudrun-status  # Test connectivity
```

### Step 6: Test Deployment

```bash
# Test with a small change
/cloudrun-deploy  # Preview
/cloudrun-deploy yes  # Execute
/cloudrun-logs 50  # Check logs
```

## 11. Cost Considerations

### Cloud Run Pricing (europe-west1)

**Compute**:
- CPU: ~$0.00002400 per vCPU-second
- Memory: ~$0.00000250 per GiB-second
- Requests: $0.40 per million requests

**Container Registry**:
- Storage: $0.026 per GB/month
- Network egress: $0.12 per GB

**Typical openhorizon.cc Costs** (estimated):
- ~1000 requests/day
- 1Gi memory, 1 CPU
- 30 days/month
- **Estimated: $5-15/month**

**Cost Optimization**:
- Use `min_instances: 0` for low-traffic services
- Set appropriate `max_instances` to prevent runaway costs
- Use request timeout to prevent long-running requests
- Monitor usage via GCP Console
- Set budget alerts

## 12. Documentation Requirements

### User Documentation

**README.md updates**:
- Add GCP Cloud Run section
- Link to setup guide
- Show example commands

**New File: `docs/gcp-cloud-run-setup.md`**:
- Complete setup instructions
- Service account creation
- IAM roles explanation
- Environment configuration
- Command reference
- Troubleshooting guide
- Cost estimation

### Developer Documentation

**Architecture documentation**:
- GCP client design
- Command handler flow
- Database schema
- Security model

**API Reference**:
- `src/clients/gcp.ts` functions
- `src/handlers/gcp-commands.ts` handlers
- `src/db/codebases.ts` GCP functions

## 13. Critical Files Summary

### Files to Create

1. **Database**
   - `migrations/009_add_gcp_config.sql` - Database schema

2. **Client**
   - `src/clients/gcp.ts` - GCP API interactions
   - `src/clients/gcp.test.ts` - Client tests

3. **Handlers**
   - `src/handlers/gcp-commands.ts` - Command handlers
   - `src/handlers/gcp-commands.test.ts` - Handler tests

4. **Scripts**
   - `src/scripts/setup-gcp-auth.ts` - Authentication setup

5. **Documentation**
   - `docs/gcp-cloud-run-setup.md` - Setup guide

### Files to Modify

1. **Database**
   - `src/db/codebases.ts` - Add GCP config functions
   - `src/db/codebases.test.ts` - Update tests
   - `migrations/000_combined.sql` - Add migration 009

2. **Types**
   - `src/types/index.ts` - Add GCP types

3. **Handlers**
   - `src/handlers/command-handler.ts` - Add cloudrun commands

4. **Docker**
   - `Dockerfile` - Add gcloud SDK installation
   - `docker-compose.yml` - Add GCP key mount

5. **Configuration**
   - `.env.example` - Add GCP variables
   - `package.json` - Add setup script

6. **Documentation**
   - `README.md` - Add GCP section

## 14. Implementation Timeline

- **Week 1**: Core infrastructure (database, types, GCP client)
- **Week 2**: Command handlers and Docker setup
- **Week 3**: Testing, documentation, and rollout

**Total estimated effort**: 3 weeks for full implementation and testing

## 15. Success Criteria

The implementation is successful when:

- ✅ Service account authentication works reliably
- ✅ Docker images build and push to Container Registry
- ✅ Cloud Run deployments succeed
- ✅ Service status and logs are retrievable
- ✅ Rollback functionality works correctly
- ✅ Configuration management is intuitive
- ✅ Error messages are clear and actionable
- ✅ All tests pass (unit, integration, e2e)
- ✅ Documentation is complete and accurate
- ✅ Security best practices are followed

## 16. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Service account permissions insufficient | High | Medium | Test with minimal permissions first, document all required roles |
| gcloud CLI installation fails in Docker | High | Low | Use official installation script, test on multiple platforms |
| Docker image build timeout | Medium | Medium | Increase timeout, optimize Dockerfile, use build cache |
| Cloud Run deployment fails | High | Low | Comprehensive error handling, detailed logging, rollback support |
| Cost overruns | Medium | Low | Set budget alerts, document cost considerations, use min_instances=0 |
| Key file security breach | High | Low | Mount as read-only, strict file permissions, regular rotation |

---

## Appendix A: Example Deployment Flow

```
User: /setcwd /workspace/openhorizon.cc
Bot: Current working directory set to /workspace/openhorizon.cc

User: /cloudrun-deploy
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

User: /cloudrun-deploy yes
Bot: 🔄 Building Docker image...
     [BUILD OUTPUT]
     ✅ Image built: gcr.io/openhorizon-cc/open-horizon-app:latest

     📤 Pushing to Container Registry...
     ✅ Image pushed successfully

     🚀 Deploying to Cloud Run...
     Deploying container to Cloud Run service [open-horizon-app]...
     ✓ Deploying new service... Done.
     ✅ Deployment complete!

     🔗 Service URL: https://open-horizon-app-xxxxx-ew.a.run.app
     📦 Revision: open-horizon-app-00123-def
     🎉 Production updated successfully!

User: /cloudrun-status
Bot: ☁️  Cloud Run Status - open-horizon-app

     🌍 Region: europe-west1
     🔗 URL: https://open-horizon-app-xxxxx-ew.a.run.app
     ✅ Status: True (Ready)
     🕐 Last Deployed: 2024-12-21T16:45:32Z
     📦 Image: gcr.io/openhorizon-cc/open-horizon-app:latest
     🚦 Traffic: 100% → open-horizon-app-00123-def (latest)

     Conditions:
     ✓ Ready
     ✓ RoutesReady
     ✓ ConfigurationsReady
```

## Appendix B: Configuration Examples

### Example 1: Basic Configuration

```json
{
  "enabled": true,
  "project_id": "openhorizon-cc",
  "region": "europe-west1",
  "service_name": "open-horizon-app",
  "env_vars_file": ".env.production"
}
```

### Example 2: Advanced Configuration

```json
{
  "enabled": true,
  "project_id": "openhorizon-cc",
  "region": "europe-west1",
  "service_name": "open-horizon-app",
  "env_vars_file": ".env.production",
  "container_registry": "gcr",
  "build_config": {
    "dockerfile": "Dockerfile.production",
    "context": ".",
    "build_args": {
      "NODE_ENV": "production"
    }
  },
  "service_config": {
    "memory": "2Gi",
    "cpu": "2",
    "timeout": 300,
    "max_instances": 10,
    "min_instances": 1,
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

### Example 3: Multi-Service (Future)

```json
{
  "enabled": true,
  "project_id": "openhorizon-cc",
  "region": "europe-west1",
  "services": {
    "api": {
      "service_name": "open-horizon-api",
      "env_vars_file": ".env.api.production",
      "service_config": {
        "memory": "1Gi",
        "cpu": "1"
      }
    },
    "web": {
      "service_name": "open-horizon-web",
      "env_vars_file": ".env.web.production",
      "service_config": {
        "memory": "512Mi",
        "cpu": "0.5"
      }
    }
  }
}
```
