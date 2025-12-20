/**
 * Docker client for container management
 * Provides programmatic access to Docker API via socket
 */
import Docker from 'dockerode';

// Initialize Docker client with socket path
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Container status information
 */
export interface ContainerStatus {
  name: string;
  id: string;
  state: 'running' | 'stopped' | 'restarting' | 'paused' | 'dead';
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none';
  uptime: string;
  ports: { internal: number; external: number }[];
  image: string;
}

/**
 * Get status for a specific container
 */
export async function getContainerStatus(containerName: string): Promise<ContainerStatus | null> {
  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();

    return {
      name: info.Name.replace(/^\//, ''), // Remove leading slash
      id: info.Id.substring(0, 12),
      state: info.State.Status as ContainerStatus['state'],
      health: info.State.Health?.Status as ContainerStatus['health'],
      uptime: formatUptime(info.State.StartedAt),
      ports: extractPorts(info.NetworkSettings.Ports),
      image: info.Config.Image,
    };
  } catch (error) {
    console.error(`[Docker] Failed to get status for ${containerName}:`, error);
    return null;
  }
}

/**
 * Get all containers for a Docker Compose project
 */
export async function getComposeProjectContainers(
  projectName: string
): Promise<ContainerStatus[]> {
  try {
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
  } catch (error) {
    console.error(`[Docker] Failed to list containers for project ${projectName}:`, error);
    return [];
  }
}

/**
 * Get logs from a container
 */
export async function getContainerLogs(
  containerName: string,
  lines: number = 50
): Promise<string> {
  try {
    const container = docker.getContainer(containerName);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: lines,
      timestamps: true,
    });

    return logs.toString('utf-8');
  } catch (error) {
    console.error(`[Docker] Failed to get logs for ${containerName}:`, error);
    throw error;
  }
}

/**
 * Check if Docker daemon is accessible
 */
export async function checkDockerAccess(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch (error) {
    console.error('[Docker] Docker daemon not accessible:', error);
    return false;
  }
}

/**
 * Get Docker version information
 */
export async function getDockerVersion(): Promise<string> {
  try {
    const version = await docker.version();
    return version.Version;
  } catch (error) {
    console.error('[Docker] Failed to get Docker version:', error);
    return 'unknown';
  }
}

/**
 * Format container uptime in human-readable format
 */
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

/**
 * Extract port mappings from Docker inspect output
 */
function extractPorts(portBindings: Docker.PortMap | undefined): { internal: number; external: number }[] {
  const ports: { internal: number; external: number }[] = [];

  if (!portBindings) return ports;

  for (const [portSpec, bindings] of Object.entries(portBindings)) {
    if (!bindings || !Array.isArray(bindings)) continue;

    const internal = parseInt(portSpec.split('/')[0]);

    for (const binding of bindings) {
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

/**
 * Restart a container by name
 * @param containerName - Name or ID of container to restart
 * @returns true if successful, false otherwise
 */
export async function restartContainer(containerName: string): Promise<boolean> {
  try {
    const container = docker.getContainer(containerName);
    await container.restart({ t: 10 }); // 10 second graceful shutdown
    return true;
  } catch (error) {
    console.error(`[Docker Client] Failed to restart container ${containerName}:`, error);
    return false;
  }
}

/**
 * Restart all containers in a Docker Compose project
 * @param projectName - Docker Compose project name
 * @returns Object with success status and list of restarted containers
 */
export async function restartComposeProject(projectName: string): Promise<{
  success: boolean;
  restarted: string[];
  failed: string[];
}> {
  const result = {
    success: true,
    restarted: [] as string[],
    failed: [] as string[],
  };

  try {
    // Get all containers in the project
    const containers = await getComposeProjectContainers(projectName);

    // Restart each container
    for (const container of containers) {
      const success = await restartContainer(container.name);
      if (success) {
        result.restarted.push(container.name);
      } else {
        result.failed.push(container.name);
        result.success = false;
      }
    }
  } catch (error) {
    console.error(`[Docker Client] Failed to restart project ${projectName}:`, error);
    result.success = false;
  }

  return result;
}

/**
 * Check if a container is healthy
 * @param containerName - Name or ID of container
 * @returns true if container is running and healthy (or has no health check)
 */
export async function isContainerHealthy(containerName: string): Promise<boolean> {
  try {
    const status = await getContainerStatus(containerName);
    if (!status) return false;

    // Container must be running
    if (status.state !== 'running') return false;

    // If health check exists, must be healthy
    if (status.health && status.health !== 'none') {
      return status.health === 'healthy';
    }

    // No health check = assume healthy if running
    return true;
  } catch (error) {
    console.error(`[Docker Client] Failed to check health for ${containerName}:`, error);
    return false;
  }
}

/**
 * Wait for a container to become healthy
 * @param containerName - Name or ID of container
 * @param timeoutMs - Maximum time to wait (default 30s)
 * @param intervalMs - Check interval (default 1s)
 * @returns true if container became healthy, false if timeout
 */
export async function waitForHealthy(
  containerName: string,
  timeoutMs: number = 30000,
  intervalMs: number = 1000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await isContainerHealthy(containerName)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}
