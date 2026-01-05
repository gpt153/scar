# Implementation Plan: Docker Container Management for SCAR

## Overview
This plan implements Docker container management capabilities for SCAR, enabling users to control production containers from within Telegram/GitHub conversations. SCAR will manage other containers via Docker socket access.

## Executive Summary

**Goal**: Enable SCAR to manage production Docker containers for projects it works on, bridging the gap between workspace development and production deployment.

**Current Situation**:
- SCAR edits files in `/workspace/<project>` (mounted workspace)
- Production runs from separate directories (e.g., `/home/samuel/po`)
- No visibility or control over production containers
- Manual deployment required

**Proposed Solution**:
- Give SCAR access to host Docker daemon via socket mount
- Install Docker CLI in SCAR container
- Create project configuration mapping workspace ↔ production
- Add slash commands: `/docker-status`, `/docker-logs`, `/docker-restart`, `/docker-deploy`
- Smart project detection based on current codebase

**Key Benefits**:
- ✅ Unified workflow: develop, deploy, monitor from one interface
- ✅ Project-aware: automatic mapping to production containers
- ✅ Safe deployments: confirmation required, health checks
- ✅ Extensible: works for any Docker-based project
- ✅ Observability: real-time logs, status, health monitoring

## Architecture Analysis

### Current SCAR Architecture

**Container Structure**:
```
scar/
├── Dockerfile                    # Node.js 20-slim base
│   ├── System: curl, git, bash, postgresql-client
│   ├── GitHub CLI (gh)
│   └── User: appuser (non-root, UID 1001)
├── docker-compose.yml
│   ├── app-with-db profile (with local PostgreSQL)
│   └── app profile (external database)
└── Volumes
    ├── /workspace → /home/samuel/.archon/workspaces
    ├── /worktrees → /home/samuel/.archon/worktrees
    └── playwright-browsers (persistent cache)
```

**Command System**:
- Location: `src/handlers/command-handler.ts`
- Pattern: Switch case for slash commands
- Each command returns `CommandResult { success, message, modified? }`
- Commands can update conversation state via `db.updateConversation()`

**Project/Codebase Model**:
```typescript
interface Codebase {
  id: string
  name: string
  repository_url: string | null
  default_cwd: string              // e.g., /workspace/project-manager
  ai_assistant_type: string
  commands: Record<string, { path: string; description: string }>
  port_config?: {                  // NEW: For Docker integration
    primary_port?: number
    service_ports?: Record<string, number>
  }
}

interface Conversation {
  id: string
  platform_type: string
  platform_conversation_id: string
  codebase_id: string | null       // Links to current project
  cwd: string | null               // Current working directory
  worktree_path: string | null     // If using isolated worktree
  ai_assistant_type: string
}
```

### Production Deployment Structure

**Current Production Containers**:
```
project-manager (po):
  Location: /home/samuel/po/
  Containers:
    - backend (port 8001 → 8000)
    - po-postgres-1
    - po-redis-1
  Compose project: po

health-agent (odin-health):
  Location: /home/samuel/odin-health/
  Containers:
    - odin-health-agent (ghcr.io image)
    - odin-health-postgres
  Compose project: odin-health
```

**Workspace Locations**:
```
Development (SCAR workspace):
  - /workspace/project-manager/
  - /workspace/health-agent/

Production (separate):
  - /home/samuel/po/
  - /home/samuel/odin-health/
```

### Security Considerations

**Docker Socket Access**:
- Mounting `/var/run/docker.sock` gives root-equivalent access
- Acceptable because:
  - SCAR already runs arbitrary user code
  - Only authorized users have access (Telegram auth, GitHub auth)
  - Read-only operations are safe (status, logs)
  - Write operations require confirmation

**User Permissions**:
- SCAR runs as `appuser` (UID 1001) inside container
- Docker socket operations will execute as host Docker daemon
- Need to ensure `appuser` can access socket (add to docker group)

## Detailed Implementation Plan

### Phase 1: Docker Infrastructure (2-3 hours)

#### 1.1 Update Dockerfile

**File**: `Dockerfile`

**Changes**:
```dockerfile
# After line 15 (postgresql-client installation)
# Install Docker CLI (for managing other containers)
RUN curl -fsSL https://get.docker.com -o get-docker.sh && \
    sh get-docker.sh && \
    rm get-docker.sh
```

**Rationale**:
- Uses official Docker installation script
- Installs Docker CLI only (no daemon - we use host daemon)
- Lightweight addition (~100MB)

#### 1.2 Update docker-compose.yml

**File**: `docker-compose.yml`

**Changes to `app-with-db` service**:
```yaml
volumes:
  - /home/samuel/.archon/workspaces:/workspace
  - /home/samuel/.archon/worktrees:/worktrees
  - /home/samuel/scar/.env:/app/.env:ro
  - /var/run/docker.sock:/var/run/docker.sock  # ← ADD THIS
  - /home/samuel/dockerMCP/playwright-browsers:/home/appuser/.cache/ms-playwright
```

**Security Note**: Docker socket is powerful but necessary. All SCAR operations are already trusted.

#### 1.3 Install dockerode npm package

**File**: `package.json`

**Command**:
```bash
npm install dockerode @types/dockerode
```

**Rationale**:
- `dockerode` provides programmatic Docker API access
- Cleaner than shell commands for status checks
- Better error handling and type safety

#### 1.4 Rebuild and Test

**Commands**:
```bash
# Rebuild SCAR container
docker compose --profile with-db down
docker compose --profile with-db build
docker compose --profile with-db up -d

# Test Docker access from inside SCAR
docker exec -it scar-app-with-db-1 docker ps
docker exec -it scar-app-with-db-1 docker version
```

**Success Criteria**:
- ✅ SCAR container starts successfully
- ✅ `docker ps` works from inside SCAR container
- ✅ Can see host containers

**Rollback Plan**:
If issues arise, remove socket mount and Docker CLI installation, restart with previous config.

---

### Phase 2: Project Configuration System (1-2 hours)

#### 2.1 Add Docker Configuration to Codebase Schema

**File**: `src/types/index.ts`

**Update `Codebase` interface**:
```typescript
export interface Codebase {
  id: string;
  name: string;
  repository_url: string | null;
  default_cwd: string;
  ai_assistant_type: string;
  commands: Record<string, { path: string; description: string }>;
  port_config?: {
    primary_port?: number;
    service_ports?: Record<string, number>;
  };
  docker_config?: {                    // ← ADD THIS
    production_path?: string;          // e.g., /home/samuel/po
    compose_project?: string;          // e.g., 'po'
    primary_container?: string;        // e.g., 'backend'
    containers?: string[];             // e.g., ['backend', 'po-postgres-1', 'po-redis-1']
    deployment_strategy?: 'copy' | 'symlink' | 'registry';  // How to deploy
  };
  created_at: Date;
  updated_at: Date;
}
```

**Rationale**:
- Store Docker config in database (persistent across restarts)
- Per-codebase configuration (each project has its own setup)
- Flexible deployment strategies (copy files, symlink, or push to registry)

#### 2.2 Create Docker Configuration Helper

**File**: `src/utils/docker-config.ts`

```typescript
import { Codebase } from '../types';

export interface DockerProjectConfig {
  codebaseName: string;
  workspacePath: string;
  productionPath: string | null;
  composeProject: string | null;
  primaryContainer: string | null;
  containers: string[];
  deploymentStrategy: 'copy' | 'symlink' | 'registry';
}

/**
 * Get Docker configuration for a codebase
 * Returns null if no Docker config exists
 */
export function getDockerConfig(codebase: Codebase): DockerProjectConfig | null {
  if (!codebase.docker_config) {
    return null;
  }

  return {
    codebaseName: codebase.name,
    workspacePath: codebase.default_cwd,
    productionPath: codebase.docker_config.production_path ?? null,
    composeProject: codebase.docker_config.compose_project ?? null,
    primaryContainer: codebase.docker_config.primary_container ?? null,
    containers: codebase.docker_config.containers ?? [],
    deploymentStrategy: codebase.docker_config.deployment_strategy ?? 'copy',
  };
}

/**
 * Auto-detect Docker containers for a compose project
 * Uses docker compose ps to find containers
 */
export async function autoDetectContainers(composeProject: string): Promise<string[]> {
  // Implementation uses dockerode to list containers with label filter
  // com.docker.compose.project=${composeProject}
}

/**
 * Validate Docker configuration
 * Checks if production path exists, containers are reachable
 */
export async function validateDockerConfig(
  config: DockerProjectConfig
): Promise<{ valid: boolean; errors: string[] }> {
  // Implementation checks:
  // - Production path exists (if specified)
  // - Docker compose project exists
  // - Containers are reachable
}
```

**Rationale**:
- Centralized configuration management
- Auto-detection reduces manual setup
- Validation prevents errors

#### 2.3 Create Docker Configuration Command

**File**: `src/handlers/command-handler.ts`

**Add new command**: `/docker-config`

```typescript
case 'docker-config': {
  // Usage: /docker-config set <production-path> <compose-project>
  // Usage: /docker-config show
  // Usage: /docker-config auto-detect

  if (!conversation.codebase_id) {
    return { success: false, message: 'No codebase configured.' };
  }

  const subcommand = args[0];

  switch (subcommand) {
    case 'set': {
      // Set Docker configuration for current codebase
      const productionPath = args[1];
      const composeProject = args[2];

      if (!productionPath || !composeProject) {
        return {
          success: false,
          message: 'Usage: /docker-config set <production-path> <compose-project>\n\n' +
                   'Example: /docker-config set /home/samuel/po po'
        };
      }

      // Update codebase with Docker config
      const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
      if (!codebase) {
        return { success: false, message: 'Codebase not found.' };
      }

      // Auto-detect containers
      const containers = await autoDetectContainers(composeProject);

      await codebaseDb.updateCodebase(conversation.codebase_id, {
        docker_config: {
          production_path: productionPath,
          compose_project: composeProject,
          containers: containers,
          primary_container: containers[0], // First container as primary
          deployment_strategy: 'copy'
        }
      });

      return {
        success: true,
        message: `Docker config set for ${codebase.name}\n\n` +
                 `Production: ${productionPath}\n` +
                 `Compose Project: ${composeProject}\n` +
                 `Detected Containers:\n${containers.map(c => `  - ${c}`).join('\n')}\n\n` +
                 `Use /docker-status to check production status`
      };
    }

    case 'show': {
      const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
      if (!codebase?.docker_config) {
        return {
          success: false,
          message: 'No Docker configuration for this codebase.\n\n' +
                   'Use /docker-config set to configure.'
        };
      }

      const config = codebase.docker_config;
      return {
        success: true,
        message: `Docker Configuration:\n\n` +
                 `Production Path: ${config.production_path ?? 'Not set'}\n` +
                 `Compose Project: ${config.compose_project ?? 'Not set'}\n` +
                 `Primary Container: ${config.primary_container ?? 'Not set'}\n` +
                 `Containers: ${config.containers?.join(', ') ?? 'None'}\n` +
                 `Deployment Strategy: ${config.deployment_strategy ?? 'copy'}`
      };
    }

    default:
      return {
        success: false,
        message: 'Usage:\n' +
                 '  /docker-config set <production-path> <compose-project>\n' +
                 '  /docker-config show'
      };
  }
}
```

**Rationale**:
- Manual configuration first (simpler, more reliable)
- Auto-detection as helper (reduces manual work)
- Show command for verification

#### 2.4 Database Migration

**File**: `migrations/XXX_add_docker_config_to_codebases.sql`

```sql
-- Add docker_config column to codebases table
ALTER TABLE codebases
ADD COLUMN docker_config JSONB DEFAULT NULL;

-- Add index for faster lookups
CREATE INDEX idx_codebases_docker_config ON codebases USING GIN (docker_config);

-- Example data structure:
-- {
--   "production_path": "/home/samuel/po",
--   "compose_project": "po",
--   "primary_container": "backend",
--   "containers": ["backend", "po-postgres-1", "po-redis-1"],
--   "deployment_strategy": "copy"
-- }
```

**Apply Migration**:
```bash
# Connect to database and run migration
docker exec -it scar-postgres-1 psql -U postgres -d remote_coding_agent -f /migrations/XXX_add_docker_config_to_codebases.sql
```

**Rollback Plan**:
```sql
ALTER TABLE codebases DROP COLUMN docker_config;
```

---

### Phase 3: Docker Status Command (2-3 hours)

#### 3.1 Create Docker Client Utility

**File**: `src/clients/docker.ts`

```typescript
import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export interface ContainerStatus {
  name: string;
  id: string;
  state: 'running' | 'stopped' | 'restarting' | 'paused' | 'dead';
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none';
  uptime: string;
  ports: { internal: number; external: number }[];
  image: string;
}

export async function getContainerStatus(containerName: string): Promise<ContainerStatus | null> {
  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();

    return {
      name: info.Name.replace(/^\//, ''), // Remove leading slash
      id: info.Id.substring(0, 12),
      state: info.State.Status as any,
      health: info.State.Health?.Status as any,
      uptime: formatUptime(info.State.StartedAt),
      ports: extractPorts(info.NetworkSettings.Ports),
      image: info.Config.Image,
    };
  } catch (error) {
    console.error(`[Docker] Failed to get status for ${containerName}:`, error);
    return null;
  }
}

export async function getComposeProjectContainers(
  projectName: string
): Promise<ContainerStatus[]> {
  const containers = await docker.listContainers({
    all: true,
    filters: {
      label: [`com.docker.compose.project=${projectName}`],
    },
  });

  const statuses: ContainerStatus[] = [];

  for (const containerInfo of containers) {
    const status = await getContainerStatus(containerInfo.Id);
    if (status) {
      statuses.push(status);
    }
  }

  return statuses;
}

export async function getContainerLogs(
  containerName: string,
  lines: number = 50
): Promise<string> {
  const container = docker.getContainer(containerName);
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail: lines,
    timestamps: true,
  });

  return logs.toString('utf-8');
}

function formatUptime(startedAt: string): string {
  const start = new Date(startedAt);
  const now = new Date();
  const diff = now.getTime() - start.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function extractPorts(portBindings: any): { internal: number; external: number }[] {
  const ports: { internal: number; external: number }[] = [];

  for (const [portSpec, bindings] of Object.entries(portBindings || {})) {
    if (!bindings || !Array.isArray(bindings)) continue;

    const internal = parseInt(portSpec.split('/')[0]);

    for (const binding of bindings as any[]) {
      if (binding.HostPort) {
        ports.push({
          internal,
          external: parseInt(binding.HostPort),
        });
      }
    }
  }

  return ports;
}
```

**Rationale**:
- Encapsulates Docker API interactions
- Type-safe container status
- Reusable across multiple commands
- Error handling for missing containers

#### 3.2 Implement /docker-status Command

**File**: `src/handlers/command-handler.ts`

**Add new command**:

```typescript
case 'docker-status': {
  if (!conversation.codebase_id) {
    return { success: false, message: 'No codebase configured.' };
  }

  const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
  if (!codebase?.docker_config) {
    return {
      success: false,
      message: `No Docker configuration for ${codebase.name}.\n\n` +
               `Use /docker-config set to configure production deployment.`
    };
  }

  const config = codebase.docker_config;

  try {
    // Get status for all containers in compose project
    let statuses: ContainerStatus[];

    if (config.compose_project) {
      statuses = await getComposeProjectContainers(config.compose_project);
    } else if (config.containers) {
      statuses = [];
      for (const containerName of config.containers) {
        const status = await getContainerStatus(containerName);
        if (status) statuses.push(status);
      }
    } else {
      return {
        success: false,
        message: 'Docker config incomplete. Run /docker-config set again.'
      };
    }

    if (statuses.length === 0) {
      return {
        success: true,
        message: `📊 ${codebase.name} - Production Status\n\n` +
                 `⚠️ No containers found for project: ${config.compose_project}\n\n` +
                 `Production path: ${config.production_path}\n` +
                 `Workspace path: ${codebase.default_cwd}`
      };
    }

    // Format status message
    let msg = `📊 ${codebase.name} - Production Status\n\n`;

    for (const status of statuses) {
      const stateIcon = {
        running: '✅',
        stopped: '🛑',
        restarting: '🔄',
        paused: '⏸️',
        dead: '💀'
      }[status.state] || '❓';

      const healthIcon = status.health
        ? {
            healthy: '💚',
            unhealthy: '❤️',
            starting: '💛',
            none: ''
          }[status.health]
        : '';

      msg += `${stateIcon} ${status.name}\n`;
      msg += `  State: ${status.state} ${healthIcon}\n`;
      msg += `  Uptime: ${status.uptime}\n`;

      if (status.ports.length > 0) {
        const portStr = status.ports
          .map(p => `${p.external}→${p.internal}`)
          .join(', ');
        msg += `  Ports: ${portStr}\n`;
      }

      msg += `  Image: ${status.image}\n\n`;
    }

    msg += `💡 Production: ${config.production_path}\n`;
    msg += `📁 Workspace: ${codebase.default_cwd}\n\n`;
    msg += `Commands:\n`;
    msg += `  /docker-logs [lines] - View logs\n`;
    msg += `  /docker-restart - Restart containers\n`;
    msg += `  /docker-deploy - Deploy workspace changes`;

    return { success: true, message: msg };

  } catch (error) {
    const err = error as Error;
    console.error('[Docker] Status check failed:', err);
    return {
      success: false,
      message: `Failed to check Docker status: ${err.message}\n\n` +
               `Ensure Docker is accessible and compose project exists.`
    };
  }
}
```

**Test Cases**:
1. ✅ No Docker config → Show error with setup instructions
2. ✅ Docker config set, containers running → Show full status
3. ✅ Docker config set, containers stopped → Show stopped status
4. ✅ Invalid compose project → Show "no containers found"

---

### Phase 4: Docker Logs Command (1-2 hours)

#### 4.1 Implement /docker-logs Command

**File**: `src/handlers/command-handler.ts`

```typescript
case 'docker-logs': {
  if (!conversation.codebase_id) {
    return { success: false, message: 'No codebase configured.' };
  }

  const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
  if (!codebase?.docker_config) {
    return {
      success: false,
      message: 'No Docker configuration. Use /docker-config set first.'
    };
  }

  // Parse arguments: /docker-logs [container-name] [lines]
  let containerName = codebase.docker_config.primary_container;
  let lines = 50;

  if (args.length > 0) {
    // First arg could be container name or number of lines
    const firstArg = args[0];
    const parsed = parseInt(firstArg);

    if (isNaN(parsed)) {
      // It's a container name
      containerName = firstArg;
      if (args.length > 1) {
        lines = parseInt(args[1]) || 50;
      }
    } else {
      // It's number of lines
      lines = parsed;
    }
  }

  if (!containerName) {
    return {
      success: false,
      message: 'No primary container configured.\n\n' +
               `Available containers: ${codebase.docker_config.containers?.join(', ') ?? 'none'}\n\n` +
               `Usage: /docker-logs [container-name] [lines]`
    };
  }

  // Validate lines
  if (lines < 1 || lines > 1000) {
    return {
      success: false,
      message: 'Line count must be between 1 and 1000'
    };
  }

  try {
    const logs = await getContainerLogs(containerName, lines);

    if (!logs || logs.trim().length === 0) {
      return {
        success: true,
        message: `📜 ${containerName} - No logs available`
      };
    }

    // Format logs for display
    // Telegram has 4096 character limit, truncate if needed
    let formattedLogs = logs;
    const maxLength = 4000; // Leave room for header

    if (formattedLogs.length > maxLength) {
      formattedLogs = '...[truncated]...\n' +
                      formattedLogs.substring(formattedLogs.length - maxLength);
    }

    const message = `📜 ${containerName} - Last ${lines} lines\n\n` +
                    `\`\`\`\n${formattedLogs}\n\`\`\``;

    return { success: true, message };

  } catch (error) {
    const err = error as Error;
    console.error('[Docker] Logs retrieval failed:', err);
    return {
      success: false,
      message: `Failed to get logs for ${containerName}: ${err.message}`
    };
  }
}
```

**Markdown Formatting**:
- Use triple backticks for code block formatting
- SCAR already has `telegramify-markdown` for proper Telegram rendering

**Test Cases**:
1. ✅ Default usage → Shows logs from primary container
2. ✅ Specify container → Shows logs from specific container
3. ✅ Specify lines → Shows custom number of lines
4. ✅ Container not found → Shows helpful error
5. ✅ Logs too long → Truncates with indicator

---

### Phase 5: Docker Restart Command (2-3 hours)

#### 5.1 Add Confirmation System

**File**: `src/utils/confirmation.ts`

```typescript
import * as db from '../db/conversations';

interface PendingConfirmation {
  conversationId: string;
  command: string;
  args: any;
  expiresAt: Date;
}

// In-memory store (could be moved to database for persistence)
const pendingConfirmations = new Map<string, PendingConfirmation>();

export function createConfirmation(
  conversationId: string,
  command: string,
  args: any
): string {
  const confirmationId = `${conversationId}-${Date.now()}`;

  pendingConfirmations.set(confirmationId, {
    conversationId,
    command,
    args,
    expiresAt: new Date(Date.now() + 60000), // 1 minute expiry
  });

  return confirmationId;
}

export function getConfirmation(confirmationId: string): PendingConfirmation | null {
  const confirmation = pendingConfirmations.get(confirmationId);

  if (!confirmation) return null;

  // Check expiry
  if (new Date() > confirmation.expiresAt) {
    pendingConfirmations.delete(confirmationId);
    return null;
  }

  return confirmation;
}

export function clearConfirmation(confirmationId: string): void {
  pendingConfirmations.delete(confirmationId);
}

// Cleanup expired confirmations periodically
setInterval(() => {
  const now = new Date();
  for (const [id, conf] of pendingConfirmations.entries()) {
    if (now > conf.expiresAt) {
      pendingConfirmations.delete(id);
    }
  }
}, 60000); // Run every minute
```

**Rationale**:
- Prevents accidental restarts
- Simple in-memory storage (fast, no DB overhead)
- Automatic cleanup of stale confirmations

#### 5.2 Add Docker Restart Utility

**File**: `src/clients/docker.ts`

**Add function**:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function restartComposeProject(
  productionPath: string,
  composeProject?: string
): Promise<{ success: boolean; output: string }> {
  try {
    // Use docker compose restart for graceful restart
    const cmd = composeProject
      ? `docker compose -p ${composeProject} restart`
      : `cd ${productionPath} && docker compose restart`;

    const { stdout, stderr } = await execAsync(cmd);

    return {
      success: true,
      output: stdout + stderr,
    };
  } catch (error: any) {
    return {
      success: false,
      output: error.message,
    };
  }
}

export async function restartContainer(containerName: string): Promise<boolean> {
  try {
    const container = docker.getContainer(containerName);
    await container.restart();
    return true;
  } catch (error) {
    console.error(`[Docker] Failed to restart ${containerName}:`, error);
    return false;
  }
}
```

#### 5.3 Implement /docker-restart Command

**File**: `src/handlers/command-handler.ts`

```typescript
case 'docker-restart': {
  if (!conversation.codebase_id) {
    return { success: false, message: 'No codebase configured.' };
  }

  const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
  if (!codebase?.docker_config) {
    return {
      success: false,
      message: 'No Docker configuration. Use /docker-config set first.'
    };
  }

  const config = codebase.docker_config;

  // Check for confirmation
  const confirmArg = args[0];

  if (confirmArg !== 'yes' && confirmArg !== 'confirm') {
    // Show confirmation prompt
    const containers = config.containers ?? ['all containers'];

    return {
      success: true,
      message: `⚠️ This will restart production containers for ${codebase.name}\n\n` +
               `Containers to restart:\n${containers.map(c => `  - ${c}`).join('\n')}\n\n` +
               `Estimated downtime: 10-30 seconds\n\n` +
               `⚠️ WARNING: This affects production!\n\n` +
               `Type \`/docker-restart yes\` to confirm`
    };
  }

  // User confirmed, proceed with restart
  try {
    await platform.sendMessage(
      conversationId,
      `🔄 Restarting ${codebase.name} containers...`
    );

    let success = true;
    let restartedContainers: string[] = [];

    if (config.compose_project && config.production_path) {
      // Restart entire compose project
      const result = await restartComposeProject(
        config.production_path,
        config.compose_project
      );

      success = result.success;

      if (success) {
        restartedContainers = config.containers ?? [];
      }
    } else if (config.containers) {
      // Restart individual containers
      for (const containerName of config.containers) {
        const restarted = await restartContainer(containerName);
        if (restarted) {
          restartedContainers.push(containerName);
        } else {
          success = false;
        }
      }
    }

    if (!success) {
      return {
        success: false,
        message: `❌ Failed to restart some containers\n\n` +
                 `Check logs with /docker-logs`
      };
    }

    // Wait a few seconds for containers to come up
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check health
    const statuses = config.compose_project
      ? await getComposeProjectContainers(config.compose_project)
      : [];

    const allHealthy = statuses.every(
      s => s.state === 'running' && (!s.health || s.health === 'healthy')
    );

    const healthMsg = allHealthy
      ? '✅ All containers healthy'
      : '⚠️ Some containers may still be starting';

    return {
      success: true,
      message: `✅ Restart complete!\n\n` +
               `Restarted:\n${restartedContainers.map(c => `  ✓ ${c}`).join('\n')}\n\n` +
               `${healthMsg}\n\n` +
               `Check status: /docker-status`
    };

  } catch (error) {
    const err = error as Error;
    console.error('[Docker] Restart failed:', err);
    return {
      success: false,
      message: `Failed to restart containers: ${err.message}`
    };
  }
}
```

**Safety Features**:
- ✅ Confirmation required
- ✅ Clear warning about production impact
- ✅ Health check after restart
- ✅ Graceful error handling

---

### Phase 6: Docker Deploy Command (3-4 hours)

#### 6.1 Add File Synchronization Utility

**File**: `src/utils/deploy.ts`

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

export interface DeploymentChanges {
  modified: string[];
  added: string[];
  deleted: string[];
}

/**
 * Detect changes between workspace and production
 */
export async function detectChanges(
  workspacePath: string,
  productionPath: string
): Promise<DeploymentChanges> {
  try {
    // Use rsync --dry-run to detect changes
    const { stdout } = await execAsync(
      `rsync -avn --exclude .git --exclude node_modules ${workspacePath}/ ${productionPath}/`
    );

    const lines = stdout.split('\n').filter(line => line.trim());

    const changes: DeploymentChanges = {
      modified: [],
      added: [],
      deleted: [],
    };

    for (const line of lines) {
      // Parse rsync output
      // Format: "<f.st...... path/to/file"
      const match = /^([<>cf]).*?\s+(.+)$/.exec(line);
      if (!match) continue;

      const [, type, path] = match;

      if (type === '>') {
        changes.modified.push(path);
      } else if (type === 'c' || type === '<') {
        changes.added.push(path);
      }
    }

    return changes;
  } catch (error: any) {
    console.error('[Deploy] Change detection failed:', error);
    return { modified: [], added: [], deleted: [] };
  }
}

/**
 * Sync workspace to production
 */
export async function syncWorkspaceToProduction(
  workspacePath: string,
  productionPath: string
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(
      `rsync -av --exclude .git --exclude node_modules --exclude .env ${workspacePath}/ ${productionPath}/`
    );

    return {
      success: true,
      output: stdout + stderr,
    };
  } catch (error: any) {
    return {
      success: false,
      output: error.message,
    };
  }
}

/**
 * Rebuild Docker images for a compose project
 */
export async function rebuildImages(
  productionPath: string,
  composeProject?: string
): Promise<{ success: boolean; output: string }> {
  try {
    const cmd = composeProject
      ? `docker compose -p ${composeProject} build`
      : `cd ${productionPath} && docker compose build`;

    const { stdout, stderr } = await execAsync(cmd, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for build output
    });

    return {
      success: true,
      output: stdout + stderr,
    };
  } catch (error: any) {
    return {
      success: false,
      output: error.message,
    };
  }
}

/**
 * Restart compose project after deployment
 */
export async function restartAfterDeploy(
  productionPath: string,
  composeProject?: string
): Promise<{ success: boolean; output: string }> {
  try {
    const cmd = composeProject
      ? `docker compose -p ${composeProject} up -d`
      : `cd ${productionPath} && docker compose up -d`;

    const { stdout, stderr } = await execAsync(cmd);

    return {
      success: true,
      output: stdout + stderr,
    };
  } catch (error: any) {
    return {
      success: false,
      output: error.message,
    };
  }
}
```

#### 6.2 Implement /docker-deploy Command

**File**: `src/handlers/command-handler.ts`

```typescript
case 'docker-deploy': {
  if (!conversation.codebase_id) {
    return { success: false, message: 'No codebase configured.' };
  }

  const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
  if (!codebase?.docker_config) {
    return {
      success: false,
      message: 'No Docker configuration. Use /docker-config set first.'
    };
  }

  const config = codebase.docker_config;

  if (!config.production_path) {
    return {
      success: false,
      message: 'Production path not configured in Docker config'
    };
  }

  const workspacePath = conversation.worktree_path ?? codebase.default_cwd;
  const productionPath = config.production_path;

  // Check for confirmation
  const confirmArg = args[0];

  if (confirmArg !== 'yes' && confirmArg !== 'confirm') {
    // Detect changes to show in confirmation
    const changes = await detectChanges(workspacePath, productionPath);
    const totalChanges = changes.modified.length + changes.added.length;

    if (totalChanges === 0) {
      return {
        success: true,
        message: `✅ No changes detected\n\n` +
                 `Workspace and production are in sync.\n\n` +
                 `Workspace: ${workspacePath}\n` +
                 `Production: ${productionPath}`
      };
    }

    let changesList = '';

    if (changes.modified.length > 0) {
      changesList += `Modified (${changes.modified.length}):\n`;
      changesList += changes.modified.slice(0, 10).map(f => `  • ${f}`).join('\n');
      if (changes.modified.length > 10) {
        changesList += `\n  ... and ${changes.modified.length - 10} more`;
      }
      changesList += '\n\n';
    }

    if (changes.added.length > 0) {
      changesList += `Added (${changes.added.length}):\n`;
      changesList += changes.added.slice(0, 10).map(f => `  • ${f}`).join('\n');
      if (changes.added.length > 10) {
        changesList += `\n  ... and ${changes.added.length - 10} more`;
      }
    }

    return {
      success: true,
      message: `🚀 Deploy workspace → production\n\n` +
               `Source: ${workspacePath}\n` +
               `Target: ${productionPath}\n\n` +
               `Changes detected:\n${changesList}\n\n` +
               `Steps:\n` +
               `1. Copy changes to production\n` +
               `2. Rebuild Docker images\n` +
               `3. Restart containers\n\n` +
               `⚠️ WARNING: This affects production!\n\n` +
               `Type \`/docker-deploy yes\` to proceed`
    };
  }

  // User confirmed, proceed with deployment
  try {
    // Step 1: Sync files
    await platform.sendMessage(conversationId, '📦 Copying files to production...');

    const syncResult = await syncWorkspaceToProduction(workspacePath, productionPath);
    if (!syncResult.success) {
      return {
        success: false,
        message: `❌ File sync failed:\n${syncResult.output}`
      };
    }

    // Step 2: Rebuild images
    await platform.sendMessage(conversationId, '🔨 Rebuilding Docker images...');

    const buildResult = await rebuildImages(productionPath, config.compose_project);
    if (!buildResult.success) {
      return {
        success: false,
        message: `❌ Image rebuild failed:\n${buildResult.output}`
      };
    }

    // Step 3: Restart containers
    await platform.sendMessage(conversationId, '🔄 Restarting containers...');

    const restartResult = await restartAfterDeploy(productionPath, config.compose_project);
    if (!restartResult.success) {
      return {
        success: false,
        message: `❌ Container restart failed:\n${restartResult.output}`
      };
    }

    // Wait for containers to stabilize
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check final status
    const statuses = config.compose_project
      ? await getComposeProjectContainers(config.compose_project)
      : [];

    const runningContainers = statuses.filter(s => s.state === 'running');

    return {
      success: true,
      message: `✅ Deployment complete!\n\n` +
               `Files: Synced\n` +
               `Images: Rebuilt\n` +
               `Containers: Restarted\n\n` +
               `Running: ${runningContainers.length}/${statuses.length} containers\n\n` +
               `Check status: /docker-status\n` +
               `View logs: /docker-logs`
    };

  } catch (error) {
    const err = error as Error;
    console.error('[Docker] Deployment failed:', err);
    return {
      success: false,
      message: `❌ Deployment failed: ${err.message}\n\n` +
               `Production may be in an inconsistent state.\n` +
               `Check /docker-status and manually verify.`
    };
  }
}
```

**Deployment Flow**:
1. Detect changes (show in confirmation)
2. Sync files (rsync workspace → production)
3. Rebuild images (docker compose build)
4. Restart containers (docker compose up -d)
5. Health check (verify containers running)

**Safety Features**:
- ✅ Shows changes before deploying
- ✅ Confirmation required
- ✅ Progressive status updates
- ✅ Rollback guidance on failure

---

### Phase 7: Integration & Testing (2-3 hours)

#### 7.1 Add Commands to Help Text

**File**: `src/handlers/command-handler.ts`

**Update `/help` command**:

```typescript
case 'help':
  return {
    success: true,
    message: `Available Commands:

Command Templates (global):
  /<name> [args] - Invoke a template directly
  /templates - List all templates
  /template-add <name> <path> - Add template from file
  /template-delete <name> - Remove a template

Codebase Commands (per-project):
  /command-set <name> <path> [text] - Register command
  /load-commands <folder> - Bulk load (recursive)
  /command-invoke <name> [args] - Execute
  /commands - List registered
  Note: Commands use relative paths (e.g., .claude/commands)

Codebase:
  /clone <repo-url> - Clone repository
  /repos - List repositories (numbered)
  /repo <#|name> [pull] - Switch repo (auto-loads commands)
  /repo-remove <#|name> - Remove repo and codebase record
  /getcwd - Show working directory
  /setcwd <path> - Set directory
  Note: Use /repo for quick switching, /setcwd for manual paths

Docker Management:
  /docker-config set <prod-path> <compose-project> - Configure deployment
  /docker-config show - Show current configuration
  /docker-status - Check production container status
  /docker-logs [container] [lines] - View container logs
  /docker-restart [yes] - Restart production containers
  /docker-deploy [yes] - Deploy workspace to production
  Note: Requires Docker configuration per codebase

Worktrees:
  /worktree create <branch> - Create isolated worktree
  /worktree list - Show worktrees for this repo
  /worktree remove [--force] - Remove current worktree

Port Management:
  /port-allocate <name> [env] [port] - Allocate port
  /port-list [--worktree|--codebase|--all] - List ports
  /port-release <port> - Release port
  /port-check <port> - Check port status
  /port-stats [env] - Show port utilization
  /port-cleanup [--dry-run] - Clean stale allocations

Session:
  /status - Show state
  /reset - Clear session
  /reset-context - Reset AI context, keep worktree
  /help - Show help

Knowledge Base (Archon):
  /crawl <url> - Crawl and index documentation website
  /crawl-status <progressId> - Check crawl progress`,
  };
```

#### 7.2 Create Integration Tests

**File**: `src/handlers/docker-commands.test.ts`

```typescript
import { handleCommand } from './command-handler';
import * as codebaseDb from '../db/codebases';
import * as dockerClient from '../clients/docker';

describe('Docker Commands', () => {
  describe('/docker-config', () => {
    it('should set Docker configuration', async () => {
      const conversation = {
        id: 'conv-1',
        codebase_id: 'codebase-1',
        // ... other fields
      };

      const result = await handleCommand(
        conversation,
        '/docker-config set /home/samuel/po po'
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Docker config set');
    });

    it('should show Docker configuration', async () => {
      // Test implementation
    });
  });

  describe('/docker-status', () => {
    it('should show container status', async () => {
      // Mock dockerClient.getComposeProjectContainers
      jest.spyOn(dockerClient, 'getComposeProjectContainers').mockResolvedValue([
        {
          name: 'backend',
          id: '123abc',
          state: 'running',
          health: 'healthy',
          uptime: '2h 15m',
          ports: [{ internal: 8000, external: 8001 }],
          image: 'po-app',
        },
      ]);

      const result = await handleCommand(conversation, '/docker-status');

      expect(result.success).toBe(true);
      expect(result.message).toContain('✅ backend');
    });
  });

  // More tests for /docker-logs, /docker-restart, /docker-deploy
});
```

#### 7.3 End-to-End Test Workflow

**Manual Test Plan**:

1. **Setup Test Project**
   ```bash
   # In SCAR workspace, clone project-manager
   /clone https://github.com/user/project-manager
   ```

2. **Configure Docker**
   ```bash
   /docker-config set /home/samuel/po po
   ```

3. **Check Status**
   ```bash
   /docker-status
   ```
   Expected: Shows running containers with health status

4. **View Logs**
   ```bash
   /docker-logs 50
   /docker-logs backend 100
   ```
   Expected: Shows container logs

5. **Make Code Change**
   ```
   "Update the health check endpoint in project-manager"
   ```
   SCAR edits code in `/workspace/project-manager`

6. **Deploy**
   ```bash
   /docker-deploy
   # Review changes shown
   /docker-deploy yes
   ```
   Expected: Files synced, images rebuilt, containers restarted

7. **Verify Deployment**
   ```bash
   /docker-status
   /docker-logs 20
   ```
   Expected: Containers healthy, new code running

#### 7.4 Documentation Updates

**File**: `docs/docker-management.md`

Create comprehensive documentation:

```markdown
# Docker Container Management

SCAR can manage production Docker containers for projects it works on.

## Setup

### 1. Prerequisites

- Docker installed and running on host
- Docker Compose v2+
- Production containers running

### 2. Configure SCAR

SCAR must have access to the Docker socket. This is configured in `docker-compose.yml`:

\`\`\`yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
\`\`\`

### 3. Configure Project

For each project, configure Docker settings:

\`\`\`
/docker-config set /path/to/production compose-project-name
\`\`\`

Example for project-manager:
\`\`\`
/docker-config set /home/samuel/po po
\`\`\`

This maps:
- Workspace: `/workspace/project-manager`
- Production: `/home/samuel/po`
- Compose Project: `po`

## Commands

### Check Status

\`\`\`
/docker-status
\`\`\`

Shows:
- Container state (running/stopped)
- Health status
- Uptime
- Port mappings
- Image names

### View Logs

\`\`\`
/docker-logs [container-name] [lines]
\`\`\`

Examples:
- `/docker-logs` - Last 50 lines from primary container
- `/docker-logs 100` - Last 100 lines from primary
- `/docker-logs backend 200` - Last 200 lines from backend

### Restart Containers

\`\`\`
/docker-restart
\`\`\`

Prompts for confirmation, then:
1. Restarts all containers in the compose project
2. Waits for containers to stabilize
3. Checks health status

**Warning**: This causes downtime (10-30 seconds)

### Deploy Changes

\`\`\`
/docker-deploy
\`\`\`

Shows changes, prompts for confirmation, then:
1. Syncs workspace files to production
2. Rebuilds Docker images
3. Restarts containers
4. Verifies health

**Warning**: This affects production!

## Workflow Example

### Scenario: Fix a bug in project-manager

1. **Work on code**
   ```
   User: "Fix the task queue bug in project-manager"
   SCAR: [analyzes code, makes fix in /workspace/project-manager]
   ```

2. **Check production status**
   ```
   /docker-status
   ```
   Output: Shows current production state

3. **Deploy fix**
   ```
   /docker-deploy
   ```
   Output: Shows files changed, asks for confirmation

   ```
   /docker-deploy yes
   ```
   Output: Deploys and restarts

4. **Verify fix**
   ```
   /docker-logs 50
   ```
   Output: Shows logs with fix in effect

## Configuration Options

### Deployment Strategies

Set in Docker config (future enhancement):
- `copy` - Copy files from workspace to production (default)
- `symlink` - Symlink production to workspace
- `registry` - Build and push to container registry

### Auto-Detection

SCAR auto-detects containers using Docker labels:
\`\`\`
com.docker.compose.project=<project-name>
\`\`\`

## Troubleshooting

### "Docker socket permission denied"

Ensure SCAR container user has access to Docker socket:
\`\`\`bash
# On host
sudo chmod 666 /var/run/docker.sock
# OR add appuser to docker group
\`\`\`

### "No containers found"

Verify compose project name:
\`\`\`bash
docker compose ls
\`\`\`

Then update config:
\`\`\`
/docker-config set /path/to/prod <correct-project-name>
\`\`\`

### "Deployment failed"

Check Docker logs:
\`\`\`bash
docker logs scar-app-with-db-1
\`\`\`

Manually verify production:
\`\`\`bash
cd /home/samuel/po
docker compose ps
\`\`\`

## Security Considerations

- Docker socket access = root-equivalent privileges
- Only authorized users should have access to SCAR
- Confirmation required for destructive operations
- Production changes are auditable (logged in SCAR)

## Best Practices

1. **Test in development first**
   - Use worktrees for isolated testing
   - Deploy to dev environment before production

2. **Review changes carefully**
   - `/docker-deploy` shows what will change
   - Review file list before confirming

3. **Monitor deployments**
   - Always check `/docker-status` after deploy
   - Review logs for errors

4. **Backup before major changes**
   - Backup database before schema changes
   - Tag Docker images before rebuilds

## Future Enhancements

- [ ] Rollback capability (revert to previous deployment)
- [ ] Blue-green deployments (zero downtime)
- [ ] Health check validation (wait for healthy before completing)
- [ ] Auto-deployment on commit (CI/CD integration)
- [ ] Multi-environment support (dev, staging, prod)
```

---

### Phase 8: Polish & Refinements (1-2 hours)

#### 8.1 Smart Suggestions

**Enhancement**: After code changes, suggest deployment

**File**: `src/orchestrator/orchestrator.ts`

**Add to message handling** (after AI response completes):

```typescript
// At end of handleMessage function, after AI response
if (commandName && conversation.codebase_id) {
  const codebase = await codebaseDb.getCodebase(conversation.codebase_id);

  // If codebase has Docker config and we just made changes
  if (codebase?.docker_config &&
      (commandName === 'execute' || commandName === 'fix' || message.includes('change'))) {

    // Suggest deployment
    const suggestionMsg = `\n\n💡 Production Deployment:\n` +
                         `  /docker-status - Check production\n` +
                         `  /docker-deploy - Deploy these changes`;

    await platform.sendMessage(conversationId, suggestionMsg);
  }
}
```

**Rationale**: Proactive workflow guidance reduces manual steps

#### 8.2 Error Handling Improvements

**File**: `src/clients/docker.ts`

**Add retry logic for transient failures**:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry failed');
}

export async function getContainerStatus(
  containerName: string
): Promise<ContainerStatus | null> {
  return withRetry(async () => {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();
    // ... rest of implementation
  });
}
```

#### 8.3 Performance Optimization

**Cache container listings**:

```typescript
// Simple in-memory cache for container listings
const containerCache = new Map<string, { data: any; expiresAt: number }>();

export async function getComposeProjectContainers(
  projectName: string,
  useCache = true
): Promise<ContainerStatus[]> {
  const cacheKey = `compose:${projectName}`;

  if (useCache) {
    const cached = containerCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
  }

  const statuses = await fetchComposeProjectContainers(projectName);

  // Cache for 30 seconds
  containerCache.set(cacheKey, {
    data: statuses,
    expiresAt: Date.now() + 30000,
  });

  return statuses;
}
```

**Rationale**: Reduces Docker API calls for repeated status checks

#### 8.4 Logging and Observability

**Add structured logging**:

```typescript
import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'docker-operations.log' })
  ],
});

// Log all Docker operations
export async function restartComposeProject(
  productionPath: string,
  composeProject?: string
): Promise<{ success: boolean; output: string }> {
  logger.info('Docker restart initiated', {
    productionPath,
    composeProject,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await execAsync(/* ... */);

    logger.info('Docker restart completed', {
      success: true,
      productionPath,
      composeProject,
    });

    return result;
  } catch (error) {
    logger.error('Docker restart failed', {
      error: error.message,
      productionPath,
      composeProject,
    });
    throw error;
  }
}
```

---

## Implementation Checklist

### Phase 1: Docker Infrastructure ✓
- [ ] Update Dockerfile with Docker CLI installation
- [ ] Update docker-compose.yml with socket mount
- [ ] Install dockerode npm package
- [ ] Rebuild SCAR container
- [ ] Test Docker access from inside container

### Phase 2: Configuration System ✓
- [ ] Update Codebase interface with docker_config
- [ ] Create docker-config.ts utility
- [ ] Implement /docker-config command
- [ ] Create database migration
- [ ] Apply migration to database

### Phase 3: Status Command ✓
- [ ] Create docker.ts client with containerStatus
- [ ] Implement getComposeProjectContainers
- [ ] Implement /docker-status command
- [ ] Test with running containers
- [ ] Test with stopped containers

### Phase 4: Logs Command ✓
- [ ] Implement getContainerLogs in docker.ts
- [ ] Implement /docker-logs command
- [ ] Test log retrieval
- [ ] Test log formatting and truncation

### Phase 5: Restart Command ✓
- [ ] Create confirmation.ts utility
- [ ] Implement restartComposeProject in docker.ts
- [ ] Implement /docker-restart command
- [ ] Test restart flow with confirmation
- [ ] Verify health check after restart

### Phase 6: Deploy Command ✓
- [ ] Create deploy.ts utility
- [ ] Implement detectChanges function
- [ ] Implement syncWorkspaceToProduction
- [ ] Implement rebuildImages
- [ ] Implement /docker-deploy command
- [ ] Test full deployment workflow

### Phase 7: Integration & Testing ✓
- [ ] Update /help command text
- [ ] Create integration tests
- [ ] Run end-to-end manual test
- [ ] Create documentation (docker-management.md)

### Phase 8: Polish ✓
- [ ] Add smart deployment suggestions
- [ ] Implement retry logic
- [ ] Add container listing cache
- [ ] Add structured logging

---

## Deployment Strategy

### Recommended Approach

**Option A: Copy workspace → production** (RECOMMENDED)
- ✅ Clean separation of concerns
- ✅ Production not affected by dev experiments
- ✅ Easy rollback (keep backups)
- ❌ Requires explicit deployment step

**Option B: Symlink production → workspace**
- ✅ Instant deployment (no copy needed)
- ❌ Production affected by workspace changes immediately
- ❌ Risky for multi-developer environments

**Option C: Push to container registry**
- ✅ Professional CI/CD workflow
- ✅ Image versioning and tagging
- ❌ Requires registry setup (GHCR, Docker Hub)
- ❌ More complex for simple projects

**Decision**: Use Option A (copy) as default, with Option C as future enhancement

---

## Questions & Decisions

### 1. Production Deployment Strategy

**Question**: Copy files or use symlinks?

**Answer**: Copy files (Option A)
- Cleaner separation
- Safer for production
- Explicit deployment step (prevents accidents)

### 2. Health-agent Image Source

**Question**: Rebuild from workspace or push to registry?

**Answer**: Phase 1 uses rebuild from workspace, Phase 2 adds registry support

Future command: `/docker-build-and-push` for registry workflows

### 3. Restart Policy

**Question**: Restart just app container or all services?

**Answer**: Smart restart
- Default: Restart entire compose project (safest)
- Option: `/docker-restart <container-name>` for individual restart

### 4. Auto-deployment

**Question**: Deploy automatically on every commit?

**Answer**: Manual deployment for safety
- Future enhancement: `/docker-auto-deploy on` for trusted workflows
- Requires test suite passing before deploy

---

## Risk Assessment

### High Risk
- ⚠️ Docker socket access (mitigated by user auth)
- ⚠️ Production downtime during restart (mitigated by confirmation)
- ⚠️ Failed deployment leaving production in bad state (mitigated by health checks)

### Medium Risk
- ⚠️ File sync errors (mitigated by rsync error handling)
- ⚠️ Image rebuild failures (mitigated by graceful error messages)

### Low Risk
- ⚠️ Container listing failures (cached data available)
- ⚠️ Log retrieval timeouts (retry logic)

### Mitigation Strategy
1. Always require confirmation for destructive operations
2. Run health checks after deployments
3. Provide clear rollback instructions
4. Log all operations for audit trail

---

## Timeline Estimate

| Phase | Estimated Time | Critical Path |
|-------|---------------|---------------|
| Phase 1: Docker Infrastructure | 2-3 hours | ✓ |
| Phase 2: Configuration System | 1-2 hours | ✓ |
| Phase 3: Status Command | 2-3 hours | ✓ |
| Phase 4: Logs Command | 1-2 hours |  |
| Phase 5: Restart Command | 2-3 hours | ✓ |
| Phase 6: Deploy Command | 3-4 hours | ✓ |
| Phase 7: Integration & Testing | 2-3 hours | ✓ |
| Phase 8: Polish | 1-2 hours |  |
| **Total** | **14-22 hours** | **1-3 days** |

**Critical Path**: Phases 1, 2, 3, 5, 6, 7 (minimum viable feature set)

**Optional**: Phases 4, 8 (enhance user experience but not required for basic functionality)

---

## Success Criteria

### Functional Requirements
- ✅ SCAR can access Docker socket from inside container
- ✅ Users can configure Docker settings per codebase
- ✅ `/docker-status` shows accurate container state
- ✅ `/docker-logs` retrieves container logs
- ✅ `/docker-restart` safely restarts production
- ✅ `/docker-deploy` deploys workspace to production

### Non-Functional Requirements
- ✅ All destructive operations require confirmation
- ✅ Health checks validate deployment success
- ✅ Clear error messages guide troubleshooting
- ✅ Documentation covers all commands
- ✅ Security: Only authorized users can deploy

### User Experience
- ✅ Commands are intuitive and discoverable
- ✅ Progress updates during long operations
- ✅ Smart suggestions guide workflow
- ✅ Errors provide actionable next steps

---

## Future Enhancements

### Near-term (Next 1-2 months)
- [ ] Rollback command (`/docker-rollback`)
- [ ] Health check validation (wait for healthy status)
- [ ] Container registry support (push/pull images)
- [ ] Multi-container builds (parallel image building)

### Medium-term (3-6 months)
- [ ] Blue-green deployments (zero downtime)
- [ ] Auto-deployment on commit (with test gates)
- [ ] Multi-environment support (dev, staging, prod)
- [ ] Deployment history and audit log

### Long-term (6+ months)
- [ ] Kubernetes support (manage K8s deployments)
- [ ] Resource monitoring (CPU, memory, disk usage)
- [ ] Alerting integration (Slack, email on failures)
- [ ] GitOps integration (deploy from Git commits)

---

## Conclusion

This implementation plan provides a comprehensive, production-ready Docker management system for SCAR. It enables seamless development-to-deployment workflows while maintaining safety, security, and ease of use.

**Key Benefits**:
- ✅ Unified interface for development and deployment
- ✅ Project-aware container management
- ✅ Safe, confirmed operations
- ✅ Extensible architecture for future enhancements

**Next Steps**:
1. Review and approve this plan
2. Begin Phase 1 implementation
3. Iterate based on testing feedback
4. Document learnings for future projects
