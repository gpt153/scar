/**
 * Docker container management commands
 * Handles /docker-* commands for managing production containers
 */
import {
  getComposeProjectContainers,
  getContainerLogs,
} from '../clients/docker';
import {
  getDockerConfig,
  updateDockerConfig,
  findCodebaseByComposeProject,
} from '../db/codebases';
import { getCodebase } from '../db/codebases';
import { createDefaultDockerConfig, addContainerToConfig } from '../utils/dockerConfig';
import { CommandResult } from '../types';

/**
 * Handle /docker-config command
 * Syntax: /docker-config set <compose-project> <compose-file>
 *         /docker-config show
 *         /docker-config add-container <name> <service> <policy>
 */
export async function handleDockerConfigCommand(
  codebaseId: string | null,
  args: string[]
): Promise<CommandResult> {
  if (!codebaseId) {
    return {
      success: false,
      message: '❌ No codebase linked to this conversation. Use /codebase to link one first.',
    };
  }

  const subcommand = args[0]?.toLowerCase();

  if (!subcommand || subcommand === 'show') {
    return await showDockerConfig(codebaseId);
  }

  if (subcommand === 'set') {
    const [, composeProject, composeFile] = args;
    if (!composeProject) {
      return {
        success: false,
        message:
          '❌ Usage: /docker-config set <compose-project> [compose-file]\n' +
          'Example: /docker-config set po docker-compose.yml',
      };
    }
    return await setDockerConfig(codebaseId, composeProject, composeFile || 'docker-compose.yml');
  }

  if (subcommand === 'add-container') {
    const [, containerName, service, restartPolicy] = args;
    if (!containerName || !service) {
      return {
        success: false,
        message:
          '❌ Usage: /docker-config add-container <name> <service> [policy]\n' +
          'Example: /docker-config add-container backend app auto',
      };
    }
    const policy = (restartPolicy as 'auto' | 'manual' | 'never') || 'manual';
    return await addContainer(codebaseId, containerName, service, policy);
  }

  return {
    success: false,
    message: `❌ Unknown subcommand: ${subcommand}\n\nAvailable:\n- show\n- set <project> [file]\n- add-container <name> <service> [policy]`,
  };
}

/**
 * Handle /docker-status command
 * Shows status of all containers for current project
 */
export async function handleDockerStatusCommand(
  codebaseId: string | null
): Promise<CommandResult> {
  if (!codebaseId) {
    return {
      success: false,
      message: '❌ No codebase linked. Use /codebase to link a project first.',
    };
  }

  const codebase = await getCodebase(codebaseId);
  if (!codebase) {
    return {
      success: false,
      message: '❌ Codebase not found.',
    };
  }

  const dockerConfig = await getDockerConfig(codebaseId);
  if (!dockerConfig || !dockerConfig.enabled) {
    return {
      success: false,
      message:
        '❌ Docker not configured for this codebase.\n\n' +
        'Set up Docker config first:\n' +
        '/docker-config set <compose-project> [compose-file]',
    };
  }

  try {
    const containers = await getComposeProjectContainers(dockerConfig.compose_project);

    if (containers.length === 0) {
      return {
        success: true,
        message:
          `📊 **${codebase.name}** - No Running Containers\n\n` +
          `Compose Project: ${dockerConfig.compose_project}\n` +
          `No containers found for this project.\n\n` +
          `💡 Make sure containers are running:\n` +
          `   cd production && docker compose up -d`,
      };
    }

    let statusMessage = `📊 **${codebase.name}** - Production Status\n\n`;
    statusMessage += `Compose Project: \`${dockerConfig.compose_project}\`\n`;
    statusMessage += `Compose File: \`${dockerConfig.compose_file}\`\n\n`;

    for (const container of containers) {
      const config = dockerConfig.containers[container.name];
      const stateEmoji = container.state === 'running' ? '✅' : '❌';
      const healthEmoji =
        container.health === 'healthy'
          ? '💚'
          : container.health === 'unhealthy'
          ? '💔'
          : container.health === 'starting'
          ? '🔄'
          : '';

      statusMessage += `**${container.name}**\n`;
      statusMessage += `  State: ${stateEmoji} ${container.state}\n`;
      if (container.health && container.health !== 'none') {
        statusMessage += `  Health: ${healthEmoji} ${container.health}\n`;
      }
      statusMessage += `  Uptime: ${container.uptime}\n`;
      statusMessage += `  Image: \`${container.image}\`\n`;

      if (container.ports.length > 0) {
        const portStr = container.ports
          .map((p) => `${p.external}→${p.internal}`)
          .join(', ');
        statusMessage += `  Ports: ${portStr}\n`;
      }

      if (config) {
        statusMessage += `  Restart: ${config.restart_policy}\n`;
        if (config.health_check_url) {
          statusMessage += `  Health URL: ${config.health_check_url}\n`;
        }
      }

      statusMessage += '\n';
    }

    statusMessage += `\n💡 View logs: /docker-logs [container] [lines]`;

    return {
      success: true,
      message: statusMessage,
    };
  } catch (error) {
    return {
      success: false,
      message: `❌ Error checking Docker status: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle /docker-logs command
 * Syntax: /docker-logs [container] [lines]
 */
export async function handleDockerLogsCommand(
  codebaseId: string | null,
  args: string[]
): Promise<CommandResult> {
  if (!codebaseId) {
    return {
      success: false,
      message: '❌ No codebase linked. Use /codebase to link a project first.',
    };
  }

  const dockerConfig = await getDockerConfig(codebaseId);
  if (!dockerConfig || !dockerConfig.enabled) {
    return {
      success: false,
      message: '❌ Docker not configured for this codebase.',
    };
  }

  // Parse arguments
  let containerName = args[0];
  let lines = 50; // default

  if (args[1]) {
    const parsed = parseInt(args[1], 10);
    if (isNaN(parsed) || parsed <= 0) {
      return {
        success: false,
        message: '❌ Invalid line count. Must be a positive number.',
      };
    }
    lines = Math.min(parsed, 1000); // cap at 1000 lines
  }

  try {
    // If no container specified, get all containers and pick the first one
    if (!containerName) {
      const containers = await getComposeProjectContainers(dockerConfig.compose_project);
      if (containers.length === 0) {
        return {
          success: false,
          message: '❌ No containers found for this project.',
        };
      }

      // Prefer configured containers, or just use first one
      const configuredNames = Object.keys(dockerConfig.containers);
      const primaryContainer =
        configuredNames.length > 0
          ? containers.find((c) => configuredNames.includes(c.name))
          : containers[0];

      if (!primaryContainer) {
        containerName = containers[0].name;
      } else {
        containerName = primaryContainer.name;
      }
    }

    const logs = await getContainerLogs(containerName, lines);

    let message = `📜 **${containerName}** - Last ${lines} lines\n\n`;
    message += '```\n';
    message += logs;
    message += '\n```\n';
    message += `\n💡 More lines: /docker-logs ${containerName} <lines>`;

    return {
      success: true,
      message,
    };
  } catch (error) {
    return {
      success: false,
      message: `❌ Error fetching logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Show current Docker configuration
 */
async function showDockerConfig(codebaseId: string): Promise<CommandResult> {
  const codebase = await getCodebase(codebaseId);
  if (!codebase) {
    return {
      success: false,
      message: '❌ Codebase not found.',
    };
  }

  const dockerConfig = await getDockerConfig(codebaseId);

  if (!dockerConfig || !dockerConfig.enabled) {
    return {
      success: true,
      message:
        `⚙️ **Docker Configuration** - ${codebase.name}\n\n` +
        `Status: ❌ Not configured\n\n` +
        `To set up Docker management:\n` +
        `/docker-config set <compose-project> [compose-file]\n\n` +
        `Example:\n` +
        `/docker-config set po docker-compose.yml`,
    };
  }

  let message = `⚙️ **Docker Configuration** - ${codebase.name}\n\n`;
  message += `Status: ✅ Enabled\n`;
  message += `Compose Project: \`${dockerConfig.compose_project}\`\n`;
  message += `Compose File: \`${dockerConfig.compose_file}\`\n\n`;

  const containerNames = Object.keys(dockerConfig.containers);
  if (containerNames.length > 0) {
    message += `**Managed Containers** (${containerNames.length}):\n`;
    for (const [name, config] of Object.entries(dockerConfig.containers)) {
      message += `  • ${name}\n`;
      message += `    Service: ${config.service}\n`;
      message += `    Restart: ${config.restart_policy}\n`;
      if (config.health_check_url) {
        message += `    Health: ${config.health_check_url}\n`;
      }
    }
  } else {
    message += `**Managed Containers**: None configured\n`;
    message += `\nAdd containers:\n`;
    message += `/docker-config add-container <name> <service> [auto|manual|never]`;
  }

  if (dockerConfig.deploy) {
    message += `\n\n**Deploy Settings**:\n`;
    message += `  Auto-deploy: ${dockerConfig.deploy.auto_deploy ? '✅' : '❌'}\n`;
    message += `  Deploy on merge: ${dockerConfig.deploy.deploy_on_merge ? '✅' : '❌'}\n`;
    if (dockerConfig.deploy.build_command) {
      message += `  Build: \`${dockerConfig.deploy.build_command}\`\n`;
    }
  }

  return {
    success: true,
    message,
  };
}

/**
 * Set Docker configuration for a codebase
 */
async function setDockerConfig(
  codebaseId: string,
  composeProject: string,
  composeFile: string
): Promise<CommandResult> {
  const codebase = await getCodebase(codebaseId);
  if (!codebase) {
    return {
      success: false,
      message: '❌ Codebase not found.',
    };
  }

  // Check if another codebase already uses this compose project
  const existing = await findCodebaseByComposeProject(composeProject);
  if (existing && existing.id !== codebaseId) {
    return {
      success: false,
      message:
        `❌ Compose project "${composeProject}" is already used by codebase "${existing.name}".\n\n` +
        `Each compose project can only be managed by one codebase.`,
    };
  }

  // Create configuration
  const config = createDefaultDockerConfig(composeProject, composeFile);

  await updateDockerConfig(codebaseId, config);

  return {
    success: true,
    message:
      `✅ Docker configuration saved\n\n` +
      `Codebase: ${codebase.name}\n` +
      `Compose Project: \`${composeProject}\`\n` +
      `Compose File: \`${composeFile}\`\n\n` +
      `Next steps:\n` +
      `1. Add containers: /docker-config add-container <name> <service>\n` +
      `2. Check status: /docker-status`,
    modified: true,
  };
}

/**
 * Add a container to the Docker configuration
 */
async function addContainer(
  codebaseId: string,
  containerName: string,
  service: string,
  restartPolicy: 'auto' | 'manual' | 'never'
): Promise<CommandResult> {
  const dockerConfig = await getDockerConfig(codebaseId);
  if (!dockerConfig || !dockerConfig.enabled) {
    return {
      success: false,
      message:
        '❌ Docker not configured for this codebase.\n\n' +
        'Run /docker-config set first to initialize Docker management.',
    };
  }

  // Add container to configuration
  const updated = addContainerToConfig(dockerConfig, containerName, service, restartPolicy);

  await updateDockerConfig(codebaseId, updated);

  return {
    success: true,
    message:
      `✅ Container added to configuration\n\n` +
      `Container: ${containerName}\n` +
      `Service: ${service}\n` +
      `Restart Policy: ${restartPolicy}\n\n` +
      `Check status: /docker-status`,
    modified: true,
  };
}
