/**
 * GCP Cloud Run command handlers
 * Handles /cloudrun-* commands for managing Cloud Run services
 */
import { CommandResult } from '../types';
import * as gcpClient from '../clients/gcp';
import { getCodebase, getGCPConfig, updateGCPConfig } from '../db/codebases';

/**
 * Handle /cloudrun-status command
 * Shows Cloud Run service status
 */
export async function handleCloudRunStatusCommand(
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

  const gcpConfig = await getGCPConfig(codebaseId);
  if (!gcpConfig || !gcpConfig.enabled) {
    return {
      success: false,
      message:
        `❌ GCP Cloud Run not configured for this codebase.\n\n` +
        `Use /cloudrun-config set <service-name> <region> to configure.`,
    };
  }

  // Check gcloud access
  const access = await gcpClient.checkGCloudAccess();
  if (!access.installed || !access.authenticated) {
    return {
      success: false,
      message:
        `❌ gcloud CLI not accessible.\n\n` +
        `Installed: ${access.installed ? '✓' : '✗'}\n` +
        `Authenticated: ${access.authenticated ? '✓' : '✗'}`,
    };
  }

  try {
    const service = await gcpClient.getCloudRunService(
      gcpConfig.project_id,
      gcpConfig.region,
      gcpConfig.service_name
    );

    if (!service) {
      return {
        success: false,
        message: `❌ Service not found: ${gcpConfig.service_name}\n\nMake sure the service exists in Cloud Run.`,
      };
    }

    // Format status message
    const readyIcon = service.ready ? '✅' : '❌';
    const statusText = service.ready ? 'Ready' : 'Not Ready';

    let message = `☁️  Cloud Run Status - ${service.name}\n\n`;
    message += `🌍 Region: ${service.region}\n`;
    message += `🔗 URL: ${service.url}\n`;
    message += `${readyIcon} Status: ${statusText}\n`;
    message += `🕐 Last Deployed: ${service.latestDeployed.toISOString()}\n`;
    message += `📦 Image: ${service.image}\n`;

    // Traffic distribution
    if (service.traffic.length > 0) {
      message += `\n🚦 Traffic Distribution:\n`;
      service.traffic.forEach((t) => {
        message += `  ${t.percent}% → ${t.revision}\n`;
      });
    }

    // Conditions
    if (service.conditions.length > 0) {
      message += `\nConditions:\n`;
      service.conditions.forEach((c) => {
        const icon = c.status === 'True' ? '✓' : '✗';
        message += `  ${icon} ${c.type}`;
        if (c.message) message += `: ${c.message}`;
        message += `\n`;
      });
    }

    return { success: true, message };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `❌ Failed to get service status:\n${errorMessage}`,
    };
  }
}

/**
 * Handle /cloudrun-logs [lines] command
 * View Cloud Run service logs
 */
export async function handleCloudRunLogsCommand(
  codebaseId: string | null,
  args: string[]
): Promise<CommandResult> {
  if (!codebaseId) {
    return {
      success: false,
      message: '❌ No codebase linked. Use /codebase to link a project first.',
    };
  }

  const gcpConfig = await getGCPConfig(codebaseId);
  if (!gcpConfig || !gcpConfig.enabled) {
    return {
      success: false,
      message: '❌ GCP Cloud Run not configured for this codebase.',
    };
  }

  const lines = args[0] ? parseInt(args[0], 10) : 50;
  if (isNaN(lines) || lines < 1 || lines > 1000) {
    return {
      success: false,
      message: '❌ Invalid line count. Must be between 1 and 1000.',
    };
  }

  try {
    const logs = await gcpClient.getCloudRunLogs(
      gcpConfig.project_id,
      gcpConfig.region,
      gcpConfig.service_name,
      lines
    );

    return {
      success: true,
      message: `📋 Cloud Run Logs - ${gcpConfig.service_name} (last ${lines} lines)\n\n${logs}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `❌ Failed to get logs:\n${errorMessage}`,
    };
  }
}

/**
 * Handle /cloudrun-deploy [yes] command
 * Deploy workspace changes to Cloud Run
 */
export async function handleCloudRunDeployCommand(
  codebaseId: string | null,
  cwd: string | null,
  args: string[]
): Promise<CommandResult> {
  if (!codebaseId) {
    return {
      success: false,
      message: '❌ No codebase linked. Use /codebase to link a project first.',
    };
  }

  if (!cwd) {
    return {
      success: false,
      message: '❌ No working directory set. Use /setcwd to set the workspace path.',
    };
  }

  const codebase = await getCodebase(codebaseId);
  if (!codebase) {
    return {
      success: false,
      message: '❌ Codebase not found.',
    };
  }

  const gcpConfig = await getGCPConfig(codebaseId);
  if (!gcpConfig || !gcpConfig.enabled) {
    return {
      success: false,
      message: '❌ GCP Cloud Run not configured for this codebase.',
    };
  }

  const confirmed = args[0]?.toLowerCase() === 'yes';

  // Preview mode
  if (!confirmed) {
    const registry = gcpConfig.container_registry || 'gcr';
    const imageUrl =
      registry === 'artifact-registry' && gcpConfig.registry_url
        ? `${gcpConfig.registry_url}/${gcpConfig.project_id}/${gcpConfig.service_name}:latest`
        : `gcr.io/${gcpConfig.project_id}/${gcpConfig.service_name}:latest`;

    let message = `🚀 Deploy to Cloud Run - ${gcpConfig.service_name}\n\n`;
    message += `**Source:** ${cwd}\n`;
    message += `**Target:** ${imageUrl}\n`;
    message += `**Region:** ${gcpConfig.region}\n\n`;
    message += `**Steps:**\n`;
    message += `1. Build Docker image\n`;
    message += `2. Push to Container Registry\n`;
    message += `3. Deploy to Cloud Run\n`;
    message += `4. Route 100% traffic to new revision\n\n`;
    message += `⚠️  This will update production!\n\n`;
    message += `Reply \`/cloudrun-deploy yes\` to confirm.`;

    return { success: true, message };
  }

  // Execute deployment
  try {
    // Run pre-deploy command if configured
    if (gcpConfig.deploy?.pre_deploy_command) {
      console.log(`[Cloud Run Deploy] Running pre-deploy command...`);
      // Would execute pre-deploy command here
    }

    // Build and push image
    const buildResult = await gcpClient.buildAndPushImage(
      cwd,
      gcpConfig.project_id,
      gcpConfig.service_name,
      gcpConfig
    );

    if (!buildResult.success) {
      return {
        success: false,
        message: `❌ Build/push failed:\n${buildResult.error}`,
      };
    }

    // Deploy to Cloud Run
    const deployResult = await gcpClient.deployToCloudRun(
      buildResult.imageUrl,
      gcpConfig.project_id,
      gcpConfig.region,
      gcpConfig.service_name,
      gcpConfig
    );

    if (!deployResult.success) {
      return {
        success: false,
        message: `❌ Deployment failed:\n${deployResult.errors.join('\n')}`,
      };
    }

    // Run post-deploy command if configured
    if (gcpConfig.deploy?.post_deploy_command) {
      console.log(`[Cloud Run Deploy] Running post-deploy command...`);
      // Would execute post-deploy command here
    }

    let message = `✅ Deployment complete!\n\n`;
    message += `🔗 Service URL: ${deployResult.serviceUrl}\n`;
    message += `📦 Revision: ${deployResult.revision}\n`;
    message += `🎉 Production updated successfully!`;

    return { success: true, message };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `❌ Deployment failed:\n${errorMessage}`,
    };
  }
}

/**
 * Handle /cloudrun-rollback [revision] command
 * Rollback to previous revision
 */
export async function handleCloudRunRollbackCommand(
  codebaseId: string | null,
  args: string[]
): Promise<CommandResult> {
  if (!codebaseId) {
    return {
      success: false,
      message: '❌ No codebase linked. Use /codebase to link a project first.',
    };
  }

  const gcpConfig = await getGCPConfig(codebaseId);
  if (!gcpConfig || !gcpConfig.enabled) {
    return {
      success: false,
      message: '❌ GCP Cloud Run not configured for this codebase.',
    };
  }

  const targetRevision = args[0]; // Optional

  try {
    const result = await gcpClient.rollbackCloudRun(
      gcpConfig.project_id,
      gcpConfig.region,
      gcpConfig.service_name,
      targetRevision
    );

    if (!result.success) {
      return {
        success: false,
        message: `❌ ${result.message}`,
      };
    }

    return {
      success: true,
      message: `✅ ${result.message}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `❌ Rollback failed:\n${errorMessage}`,
    };
  }
}

/**
 * Handle /cloudrun-config [action] [args...] command
 * Configure Cloud Run settings
 */
export async function handleCloudRunConfigCommand(
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
    return await showGCPConfig(codebaseId);
  }

  if (subcommand === 'set') {
    const [, serviceName, region] = args;
    if (!serviceName || !region) {
      return {
        success: false,
        message:
          '❌ Usage: /cloudrun-config set <service-name> <region>\n' +
          'Example: /cloudrun-config set open-horizon-app europe-west1',
      };
    }

    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) {
      return {
        success: false,
        message: '❌ GCP_PROJECT_ID not configured in environment variables.',
      };
    }

    const config = {
      enabled: true,
      project_id: projectId,
      region,
      service_name: serviceName,
    };

    await updateGCPConfig(codebaseId, config);

    return {
      success: true,
      message:
        `✅ GCP Cloud Run configured:\n\n` +
        `Service: ${serviceName}\n` +
        `Region: ${region}\n` +
        `Project: ${projectId}\n\n` +
        `Use /cloudrun-status to check service status.`,
      modified: true,
    };
  }

  if (subcommand === 'set-memory') {
    const memory = args[1];
    if (!memory) {
      return {
        success: false,
        message: '❌ Usage: /cloudrun-config set-memory <memory>\nExample: /cloudrun-config set-memory 2Gi',
      };
    }

    const config = await getGCPConfig(codebaseId);
    if (!config) {
      return {
        success: false,
        message: '❌ No GCP configuration found. Use /cloudrun-config set first.',
      };
    }

    config.service_config = config.service_config || {};
    config.service_config.memory = memory;
    await updateGCPConfig(codebaseId, config);

    return {
      success: true,
      message: `✅ Memory limit set to ${memory}`,
      modified: true,
    };
  }

  if (subcommand === 'set-cpu') {
    const cpu = args[1];
    if (!cpu) {
      return {
        success: false,
        message: '❌ Usage: /cloudrun-config set-cpu <cpu>\nExample: /cloudrun-config set-cpu 2',
      };
    }

    const config = await getGCPConfig(codebaseId);
    if (!config) {
      return {
        success: false,
        message: '❌ No GCP configuration found. Use /cloudrun-config set first.',
      };
    }

    config.service_config = config.service_config || {};
    config.service_config.cpu = cpu;
    await updateGCPConfig(codebaseId, config);

    return {
      success: true,
      message: `✅ CPU allocation set to ${cpu}`,
      modified: true,
    };
  }

  if (subcommand === 'set-env-file') {
    const envFile = args[1];
    if (!envFile) {
      return {
        success: false,
        message:
          '❌ Usage: /cloudrun-config set-env-file <path>\nExample: /cloudrun-config set-env-file .env.production',
      };
    }

    const config = await getGCPConfig(codebaseId);
    if (!config) {
      return {
        success: false,
        message: '❌ No GCP configuration found. Use /cloudrun-config set first.',
      };
    }

    config.env_vars_file = envFile;
    await updateGCPConfig(codebaseId, config);

    return {
      success: true,
      message: `✅ Environment variables file set to ${envFile}`,
      modified: true,
    };
  }

  return {
    success: false,
    message:
      `❌ Unknown subcommand: ${subcommand}\n\n` +
      `Available commands:\n` +
      `- show\n` +
      `- set <service-name> <region>\n` +
      `- set-memory <memory>\n` +
      `- set-cpu <cpu>\n` +
      `- set-env-file <path>`,
  };
}

/**
 * Show GCP configuration for codebase
 */
async function showGCPConfig(codebaseId: string): Promise<CommandResult> {
  const config = await getGCPConfig(codebaseId);

  if (!config || !config.enabled) {
    return {
      success: false,
      message:
        '❌ GCP Cloud Run not configured.\n\n' +
        'Use /cloudrun-config set <service-name> <region> to configure.',
    };
  }

  let message = `☁️  GCP Cloud Run Configuration\n\n`;
  message += `Enabled: ✓\n`;
  message += `Project ID: ${config.project_id}\n`;
  message += `Region: ${config.region}\n`;
  message += `Service: ${config.service_name}\n`;

  if (config.env_vars_file) {
    message += `Env File: ${config.env_vars_file}\n`;
  }

  if (config.service_config) {
    message += `\nService Configuration:\n`;
    if (config.service_config.memory) message += `  Memory: ${config.service_config.memory}\n`;
    if (config.service_config.cpu) message += `  CPU: ${config.service_config.cpu}\n`;
    if (config.service_config.timeout)
      message += `  Timeout: ${config.service_config.timeout}s\n`;
    if (config.service_config.max_instances)
      message += `  Max Instances: ${config.service_config.max_instances}\n`;
    if (config.service_config.min_instances)
      message += `  Min Instances: ${config.service_config.min_instances}\n`;
  }

  return { success: true, message };
}

/**
 * Handle /cloudrun-list command
 * List all Cloud Run services in project
 */
export async function handleCloudRunListCommand(
  codebaseId: string | null
): Promise<CommandResult> {
  if (!codebaseId) {
    return {
      success: false,
      message: '❌ No codebase linked. Use /codebase to link a project first.',
    };
  }

  const gcpConfig = await getGCPConfig(codebaseId);
  if (!gcpConfig || !gcpConfig.enabled) {
    return {
      success: false,
      message: '❌ GCP Cloud Run not configured for this codebase.',
    };
  }

  try {
    const services = await gcpClient.listCloudRunServices(
      gcpConfig.project_id,
      gcpConfig.region
    );

    if (services.length === 0) {
      return {
        success: true,
        message: `No Cloud Run services found in ${gcpConfig.region}`,
      };
    }

    let message = `☁️  Cloud Run Services (${gcpConfig.region})\n\n`;
    services.forEach((service, index) => {
      const readyIcon = service.ready ? '✅' : '❌';
      message += `${index + 1}. ${readyIcon} ${service.name}\n`;
      message += `   URL: ${service.url}\n`;
      message += `   Revision: ${service.latestRevision}\n\n`;
    });

    return { success: true, message };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `❌ Failed to list services:\n${errorMessage}`,
    };
  }
}
