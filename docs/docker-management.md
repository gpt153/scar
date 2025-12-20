# Docker Container Management

SCAR can manage production Docker containers for projects it works on.

## Overview

This feature enables SCAR to:
- Check status of production containers
- View container logs
- Restart containers
- Deploy workspace changes to production

All from within Telegram or GitHub conversations.

## Architecture

### Docker Socket Access

SCAR container has access to the host Docker daemon via socket mount:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

This allows SCAR to:
- List containers
- Inspect container status
- View logs
- Restart containers
- Execute Docker Compose commands

### Security

**Docker socket access = root-equivalent privileges**

This is acceptable because:
- SCAR already executes arbitrary user code
- Only authorized users have access (Telegram/GitHub auth)
- Read-only operations (status, logs) are safe
- Destructive operations require confirmation

## Setup

### Prerequisites

1. Docker installed on host
2. Docker Compose v2+
3. SCAR running in Docker

### Installation

1. **Update Dockerfile** (add Docker CLI):
```dockerfile
# Install Docker CLI (for managing other containers)
RUN curl -fsSL https://get.docker.com -o get-docker.sh && \
    sh get-docker.sh && \
    rm get-docker.sh
```

2. **Update docker-compose.yml** (mount socket):
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

3. **Rebuild SCAR container**:
```bash
docker compose --profile with-db down
docker compose --profile with-db build
docker compose --profile with-db up -d
```

4. **Verify Docker access**:
```bash
docker exec scar-app-with-db-1 docker ps
docker exec scar-app-with-db-1 docker version
```

## API Reference

### Docker Client

Location: `src/clients/docker.ts`

#### checkDockerAccess()

Check if Docker daemon is accessible.

```typescript
const isAccessible = await checkDockerAccess();
// Returns: boolean
```

#### getDockerVersion()

Get Docker version.

```typescript
const version = await getDockerVersion();
// Returns: string (e.g., "24.0.7")
```

#### getContainerStatus(containerName)

Get status for a specific container.

```typescript
const status = await getContainerStatus('backend');
// Returns: ContainerStatus | null

interface ContainerStatus {
  name: string;
  id: string;
  state: 'running' | 'stopped' | 'restarting' | 'paused' | 'dead';
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none';
  uptime: string;  // e.g., "2h 15m"
  ports: { internal: number; external: number }[];
  image: string;
}
```

#### getComposeProjectContainers(projectName)

Get all containers for a Docker Compose project.

```typescript
const containers = await getComposeProjectContainers('po');
// Returns: ContainerStatus[]
```

#### getContainerLogs(containerName, lines)

Get logs from a container.

```typescript
const logs = await getContainerLogs('backend', 50);
// Returns: string (log output)
```

#### restartContainer(containerName)

Restart a specific container.

```typescript
const success = await restartContainer('backend');
// Returns: boolean
```

## Testing

### Unit Tests

Run Docker client tests:
```bash
npm test src/clients/docker.test.ts
```

Tests are designed to:
- Work with or without Docker available
- Skip integration tests if Docker not accessible
- Provide meaningful results in both environments

### Integration Tests

Verify Docker access from inside SCAR:

```bash
# Check Docker daemon
docker exec scar-app-with-db-1 docker version

# List containers
docker exec scar-app-with-db-1 docker ps

# Test Docker client
docker exec scar-app-with-db-1 npm test src/clients/docker.test.ts
```

### Manual Testing

1. **Test Docker access**:
```bash
docker exec -it scar-app-with-db-1 bash
docker ps
docker version
exit
```

2. **Test from Node.js**:
```bash
docker exec -it scar-app-with-db-1 node
> const { checkDockerAccess } = require('./dist/clients/docker.js');
> checkDockerAccess().then(console.log);
```

## Troubleshooting

### "Docker socket permission denied"

**Problem**: SCAR container can't access Docker socket

**Solution**: Ensure socket has correct permissions:
```bash
# On host
sudo chmod 666 /var/run/docker.sock

# Or add appuser to docker group (requires container rebuild)
```

### "Docker daemon not accessible"

**Problem**: Docker socket not mounted or Docker not running

**Solution**:
1. Verify Docker is running: `docker ps`
2. Check socket mount in docker-compose.yml
3. Restart SCAR container: `docker compose --profile with-db restart`

### Tests fail with "Docker not available"

**Expected**: Tests are designed to skip when Docker isn't accessible

**Verify**:
```bash
# Check if tests detect Docker
DOCKER_AVAILABLE=true npm test src/clients/docker.test.ts

# Or explicitly skip Docker tests
DOCKER_AVAILABLE=false npm test src/clients/docker.test.ts
```

## Next Steps

After PR #1 (Docker Infrastructure) is complete:

- **PR #2**: Database schema for Docker configuration
- **PR #3**: `/docker-status` and `/docker-logs` commands
- **PR #4**: `/docker-restart` command with confirmations
- **PR #5**: `/docker-deploy` command for production deployment

See `.agents/plans/docker-management-github-staging.md` for full roadmap.

## References

- [Docker Engine API](https://docs.docker.com/engine/api/)
- [dockerode npm package](https://www.npmjs.com/package/dockerode)
- [Docker socket security](https://docs.docker.com/engine/security/)
