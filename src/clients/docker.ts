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
 * Restart a specific container
 */
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
