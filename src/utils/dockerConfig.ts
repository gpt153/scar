/**
 * Docker configuration utilities
 * Helpers for validating and working with Docker configuration in codebases
 */
import { DockerConfig, ContainerConfig, DeployConfig } from '../types';

/**
 * Validate Docker configuration structure
 * @param config - Docker configuration object to validate
 * @returns true if valid, false otherwise
 */
export function validateDockerConfig(config: unknown): config is DockerConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const cfg = config as Partial<DockerConfig>;

  // Required fields
  if (typeof cfg.enabled !== 'boolean') {
    return false;
  }

  if (!cfg.enabled) {
    // If disabled, no other fields are required
    return true;
  }

  // When enabled, these fields are required
  if (typeof cfg.compose_project !== 'string' || cfg.compose_project.trim() === '') {
    return false;
  }

  if (typeof cfg.compose_file !== 'string' || cfg.compose_file.trim() === '') {
    return false;
  }

  if (!cfg.containers || typeof cfg.containers !== 'object') {
    return false;
  }

  // Validate each container config
  for (const [containerName, containerConfig] of Object.entries(cfg.containers)) {
    if (!validateContainerConfig(containerConfig)) {
      console.error(`Invalid container config for ${containerName}`);
      return false;
    }
  }

  // Validate deploy config if present
  if (cfg.deploy && !validateDeployConfig(cfg.deploy)) {
    return false;
  }

  return true;
}

/**
 * Validate container configuration
 */
function validateContainerConfig(config: unknown): config is ContainerConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const cfg = config as Partial<ContainerConfig>;

  // Required: service name
  if (typeof cfg.service !== 'string' || cfg.service.trim() === '') {
    return false;
  }

  // Required: restart_policy
  if (!cfg.restart_policy || !['auto', 'manual', 'never'].includes(cfg.restart_policy)) {
    return false;
  }

  // Optional: health_check_url (if present, must be string)
  if (cfg.health_check_url !== undefined && typeof cfg.health_check_url !== 'string') {
    return false;
  }

  return true;
}

/**
 * Validate deploy configuration
 */
function validateDeployConfig(config: unknown): config is DeployConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const cfg = config as Partial<DeployConfig>;

  // Required: auto_deploy and deploy_on_merge
  if (typeof cfg.auto_deploy !== 'boolean') {
    return false;
  }

  if (typeof cfg.deploy_on_merge !== 'boolean') {
    return false;
  }

  // Optional string fields
  const optionalStringFields = ['build_command', 'pre_deploy_command', 'post_deploy_command'];
  for (const field of optionalStringFields) {
    const value = cfg[field as keyof DeployConfig];
    if (value !== undefined && typeof value !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * Create a default Docker configuration
 * @param composeProject - Docker Compose project name
 * @param composeFile - Path to docker-compose.yml (relative to codebase)
 * @returns Valid Docker configuration with sensible defaults
 */
export function createDefaultDockerConfig(
  composeProject: string,
  composeFile: string = 'docker-compose.yml'
): DockerConfig {
  return {
    enabled: true,
    compose_project: composeProject,
    compose_file: composeFile,
    containers: {},
    deploy: {
      auto_deploy: false,
      deploy_on_merge: false,
    },
  };
}

/**
 * Add container to Docker configuration
 * @param config - Existing Docker configuration
 * @param containerName - Name of container
 * @param service - Docker Compose service name
 * @param restartPolicy - Restart policy (default: 'manual')
 * @param healthCheckUrl - Optional health check URL
 * @returns Updated Docker configuration
 */
export function addContainerToConfig(
  config: DockerConfig,
  containerName: string,
  service: string,
  restartPolicy: 'auto' | 'manual' | 'never' = 'manual',
  healthCheckUrl?: string
): DockerConfig {
  return {
    ...config,
    containers: {
      ...config.containers,
      [containerName]: {
        service,
        restart_policy: restartPolicy,
        ...(healthCheckUrl && { health_check_url: healthCheckUrl }),
      },
    },
  };
}

/**
 * Remove container from Docker configuration
 */
export function removeContainerFromConfig(
  config: DockerConfig,
  containerName: string
): DockerConfig {
  const { [containerName]: removed, ...remainingContainers } = config.containers;
  return {
    ...config,
    containers: remainingContainers,
  };
}

/**
 * Check if Docker management is enabled for a codebase
 */
export function isDockerEnabled(config: DockerConfig | null | undefined): boolean {
  return config?.enabled === true;
}

/**
 * Get container configuration by name
 */
export function getContainerConfig(
  config: DockerConfig | null | undefined,
  containerName: string
): ContainerConfig | null {
  if (!config || !config.enabled) {
    return null;
  }

  return config.containers[containerName] || null;
}

/**
 * Get all container names from configuration
 */
export function getContainerNames(config: DockerConfig | null | undefined): string[] {
  if (!config || !config.enabled) {
    return [];
  }

  return Object.keys(config.containers);
}

/**
 * Check if auto-deploy is enabled
 */
export function isAutoDeployEnabled(config: DockerConfig | null | undefined): boolean {
  return config?.deploy?.auto_deploy === true;
}

/**
 * Check if deploy-on-merge is enabled
 */
export function isDeployOnMergeEnabled(config: DockerConfig | null | undefined): boolean {
  return config?.deploy?.deploy_on_merge === true;
}

/**
 * Serialize Docker configuration for database storage
 * Converts DockerConfig to JSONB-compatible object
 */
export function serializeDockerConfig(config: DockerConfig): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config));
}

/**
 * Deserialize Docker configuration from database
 * Validates and converts JSONB data to typed DockerConfig
 */
export function deserializeDockerConfig(data: unknown): DockerConfig | null {
  if (!data) {
    return null;
  }

  if (!validateDockerConfig(data)) {
    console.error('[Docker Config] Invalid Docker configuration from database:', data);
    return null;
  }

  return data;
}
