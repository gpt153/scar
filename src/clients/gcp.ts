/**
 * GCP client for Cloud Run deployment and management
 * Provides programmatic access to Google Cloud Platform via gcloud CLI
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { CloudRunService, CloudRunDeploymentResult, GCPConfig } from '../types';

/**
 * Check if gcloud CLI is installed and authenticated
 */
export async function checkGCloudAccess(): Promise<{
  installed: boolean;
  authenticated: boolean;
  version?: string;
}> {
  try {
    // Check if gcloud is installed
    const versionOutput = execSync('gcloud version', { encoding: 'utf-8' });
    const versionRegex = /Google Cloud SDK ([\d.]+)/;
    const versionMatch = versionRegex.exec(versionOutput);
    const version = versionMatch ? versionMatch[1] : undefined;

    // Check if authenticated
    try {
      execSync('gcloud auth list --filter=status:ACTIVE --format="value(account)"', {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return { installed: true, authenticated: true, version };
    } catch {
      return { installed: true, authenticated: false, version };
    }
  } catch (error) {
    console.error('[GCP Client] gcloud CLI not found:', error);
    return { installed: false, authenticated: false };
  }
}

/**
 * Authenticate with GCP using service account
 */
export async function authenticateGCP(): Promise<boolean> {
  const keyPath = process.env.GCP_SERVICE_ACCOUNT_KEY_PATH || '/app/credentials/gcp-key.json';

  if (!existsSync(keyPath)) {
    console.error(`[GCP Client] Service account key not found at ${keyPath}`);
    return false;
  }

  try {
    execSync(`gcloud auth activate-service-account --key-file=${keyPath}`, {
      stdio: 'pipe',
    });

    // Set default project if configured
    const projectId = process.env.GCP_PROJECT_ID;
    if (projectId) {
      execSync(`gcloud config set project ${projectId}`, { stdio: 'pipe' });
    }

    // Configure Docker credential helper
    execSync('gcloud auth configure-docker --quiet', { stdio: 'pipe' });

    console.log('[GCP Client] Authentication successful');
    return true;
  } catch (error) {
    console.error('[GCP Client] Authentication failed:', error);
    return false;
  }
}

/**
 * Build and push Docker image to Container Registry
 */
export async function buildAndPushImage(
  workspacePath: string,
  projectId: string,
  serviceName: string,
  config: GCPConfig
): Promise<{ success: boolean; imageUrl: string; error?: string }> {
  const registry = config.container_registry || 'gcr';
  const dockerfile = config.build_config?.dockerfile || 'Dockerfile';
  const context = config.build_config?.context || '.';

  // Construct image URL based on registry type
  let imageUrl: string;
  if (registry === 'artifact-registry' && config.registry_url) {
    imageUrl = `${config.registry_url}/${projectId}/${serviceName}:latest`;
  } else {
    // Default to GCR
    imageUrl = `gcr.io/${projectId}/${serviceName}:latest`;
  }

  try {
    // Build image
    console.log(`[GCP Client] Building Docker image: ${imageUrl}`);
    let buildCommand = `docker build -t ${imageUrl} -f ${dockerfile}`;

    // Add build args if specified
    if (config.build_config?.build_args) {
      for (const [key, value] of Object.entries(config.build_config.build_args)) {
        buildCommand += ` --build-arg ${key}=${value}`;
      }
    }

    buildCommand += ` ${context}`;

    execSync(buildCommand, {
      cwd: workspacePath,
      stdio: 'pipe',
      timeout: parseInt(process.env.CLOUDRUN_BUILD_TIMEOUT || '600000'), // 10 min default
    });

    console.log('[GCP Client] Image built successfully');

    // Push image
    console.log('[GCP Client] Pushing image to registry...');
    execSync(`docker push ${imageUrl}`, {
      stdio: 'pipe',
      timeout: 600000, // 10 minutes
    });

    console.log('[GCP Client] Image pushed successfully');
    return { success: true, imageUrl };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GCP Client] Build/push failed:', errorMessage);
    return { success: false, imageUrl, error: errorMessage };
  }
}

/**
 * Deploy image to Cloud Run
 */
export async function deployToCloudRun(
  imageUrl: string,
  projectId: string,
  region: string,
  serviceName: string,
  config: GCPConfig
): Promise<CloudRunDeploymentResult> {
  const result: CloudRunDeploymentResult = {
    success: false,
    message: '',
    steps: { build: true, push: true, deploy: false },
    errors: [],
  };

  try {
    // Build gcloud run deploy command
    let deployCommand = `gcloud run deploy ${serviceName}`;
    deployCommand += ` --image=${imageUrl}`;
    deployCommand += ` --region=${region}`;
    deployCommand += ` --project=${projectId}`;
    deployCommand += ' --platform=managed';
    deployCommand += ' --allow-unauthenticated'; // Default to public access

    // Add service configuration
    const serviceConfig = config.service_config;
    if (serviceConfig) {
      if (serviceConfig.memory) deployCommand += ` --memory=${serviceConfig.memory}`;
      if (serviceConfig.cpu) deployCommand += ` --cpu=${serviceConfig.cpu}`;
      if (serviceConfig.timeout) deployCommand += ` --timeout=${serviceConfig.timeout}`;
      if (serviceConfig.max_instances)
        deployCommand += ` --max-instances=${serviceConfig.max_instances}`;
      if (serviceConfig.min_instances)
        deployCommand += ` --min-instances=${serviceConfig.min_instances}`;
      if (serviceConfig.concurrency)
        deployCommand += ` --concurrency=${serviceConfig.concurrency}`;
      if (serviceConfig.ingress) deployCommand += ` --ingress=${serviceConfig.ingress}`;
    }

    // Add environment variables from file if specified
    if (config.env_vars_file) {
      deployCommand += ` --env-vars-file=${config.env_vars_file}`;
    }

    deployCommand += ' --format=json';

    console.log(`[GCP Client] Deploying to Cloud Run: ${serviceName}`);
    const output = execSync(deployCommand, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 600000, // 10 minutes
    });

    // Parse deployment result
    const deployResult = JSON.parse(output);
    result.steps.deploy = true;
    result.success = true;
    result.serviceUrl = deployResult.status?.url || deployResult.status?.address?.url;
    result.revision = deployResult.status?.latestCreatedRevisionName;
    result.message = 'Deployment completed successfully';

    console.log(`[GCP Client] Deployment successful: ${result.serviceUrl}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Deployment failed: ${errorMessage}`);
    result.message = 'Deployment failed';
    console.error('[GCP Client] Deployment failed:', errorMessage);
  }

  return result;
}

/**
 * Get Cloud Run service status
 */
export async function getCloudRunService(
  projectId: string,
  region: string,
  serviceName: string
): Promise<CloudRunService | null> {
  try {
    const output = execSync(
      `gcloud run services describe ${serviceName} --region=${region} --project=${projectId} --format=json`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
      }
    );

    const service = JSON.parse(output);

    // Extract traffic information
    const traffic =
      service.status?.traffic?.map((t: { revisionName: string; percent: number }) => ({
        revision: t.revisionName,
        percent: t.percent,
      })) || [];

    // Extract conditions
    const conditions =
      service.status?.conditions?.map((c: { type: string; status: string; message?: string }) => ({
        type: c.type,
        status: c.status,
        message: c.message,
      })) || [];

    return {
      name: service.metadata?.name || serviceName,
      region,
      url: service.status?.url || service.status?.address?.url || '',
      ready: conditions.some((c: any) => c.type === 'Ready' && c.status === 'True'),
      latestRevision: service.status?.latestCreatedRevisionName || '',
      latestDeployed: new Date(service.metadata?.creationTimestamp || Date.now()),
      image: service.spec?.template?.spec?.containers?.[0]?.image || '',
      traffic,
      conditions,
    };
  } catch (error) {
    console.error(`[GCP Client] Failed to get service status for ${serviceName}:`, error);
    return null;
  }
}

/**
 * Get Cloud Run service logs
 */
export async function getCloudRunLogs(
  projectId: string,
  serviceName: string,
  lines = 50
): Promise<string> {
  try {
    const output = execSync(
      `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${serviceName}" --limit=${lines} --project=${projectId} --format="value(timestamp,textPayload,jsonPayload.message)" --order=desc`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 30000, // 30 seconds
      }
    );

    return output || 'No logs found';
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[GCP Client] Failed to get logs for ${serviceName}:`, errorMessage);
    throw error;
  }
}

/**
 * List all Cloud Run services in a region
 */
export async function listCloudRunServices(
  projectId: string,
  region: string
): Promise<CloudRunService[]> {
  try {
    const output = execSync(
      `gcloud run services list --region=${region} --project=${projectId} --format=json`,
      {
        encoding: 'utf-8',
        stdio: 'pipe',
      }
    );

    const services = JSON.parse(output);
    return services.map((service: any) => ({
      name: service.metadata?.name || '',
      region,
      url: service.status?.url || service.status?.address?.url || '',
      ready: service.status?.conditions?.some(
        (c: any) => c.type === 'Ready' && c.status === 'True'
      ),
      latestRevision: service.status?.latestCreatedRevisionName || '',
      latestDeployed: new Date(service.metadata?.creationTimestamp || Date.now()),
      image: service.spec?.template?.spec?.containers?.[0]?.image || '',
      traffic:
        service.status?.traffic?.map((t: any) => ({
          revision: t.revisionName,
          percent: t.percent,
        })) || [],
      conditions:
        service.status?.conditions?.map((c: any) => ({
          type: c.type,
          status: c.status,
          message: c.message,
        })) || [],
    }));
  } catch (error) {
    console.error('[GCP Client] Failed to list services:', error);
    return [];
  }
}

/**
 * Rollback to previous revision
 */
export async function rollbackCloudRun(
  projectId: string,
  region: string,
  serviceName: string,
  targetRevision?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Get current service to find previous revision
    const service = await getCloudRunService(projectId, region, serviceName);
    if (!service) {
      return { success: false, message: 'Service not found' };
    }

    // If no target revision specified, find the previous one
    let revisionName = targetRevision;
    if (!revisionName) {
      // Get all revisions
      const output = execSync(
        `gcloud run revisions list --service=${serviceName} --region=${region} --project=${projectId} --format=json --limit=2`,
        {
          encoding: 'utf-8',
          stdio: 'pipe',
        }
      );

      const revisions = JSON.parse(output);
      if (revisions.length < 2) {
        return { success: false, message: 'No previous revision found' };
      }

      revisionName = revisions[1].metadata.name; // Second revision (previous)
    }

    // Update traffic to route 100% to target revision
    execSync(
      `gcloud run services update-traffic ${serviceName} --to-revisions=${revisionName}=100 --region=${region} --project=${projectId}`,
      {
        stdio: 'pipe',
      }
    );

    return {
      success: true,
      message: `Successfully rolled back to revision: ${revisionName}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GCP Client] Rollback failed:', errorMessage);
    return { success: false, message: `Rollback failed: ${errorMessage}` };
  }
}

/**
 * Update traffic routing
 */
export async function updateTraffic(
  projectId: string,
  region: string,
  serviceName: string,
  trafficSplit: Record<string, number>
): Promise<{ success: boolean; message: string }> {
  try {
    // Build traffic split argument
    const trafficArgs = Object.entries(trafficSplit)
      .map(([revision, percent]) => `${revision}=${percent}`)
      .join(',');

    execSync(
      `gcloud run services update-traffic ${serviceName} --to-revisions=${trafficArgs} --region=${region} --project=${projectId}`,
      {
        stdio: 'pipe',
      }
    );

    return { success: true, message: 'Traffic updated successfully' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GCP Client] Traffic update failed:', errorMessage);
    return { success: false, message: `Traffic update failed: ${errorMessage}` };
  }
}
