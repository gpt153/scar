/**
 * Google Cloud Platform client for Cloud Run management
 * Handles deployment, service management, and logging
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Cloud Run service configuration
 */
export interface CloudRunConfig {
  serviceName: string;
  region: string;
  image?: string;
  memory?: string;
  cpu?: string;
  timeout?: number;
  maxInstances?: number;
  minInstances?: number;
  envVarsFile?: string;
}

/**
 * Deployment result
 */
export interface DeploymentResult {
  success: boolean;
  message: string;
  url?: string;
  steps: {
    authenticate: boolean;
    build: boolean;
    push: boolean;
    deploy: boolean;
  };
  errors: string[];
}

/**
 * Service status information
 */
export interface ServiceStatus {
  name: string;
  url: string;
  status: string;
  region: string;
  lastDeployed: string;
  traffic: string;
  image: string;
}

/**
 * Initialize GCP authentication
 */
export function authenticateGCP(): boolean {
  try {
    const keyPath = process.env.GCP_SERVICE_ACCOUNT_KEY_PATH;
    if (!keyPath || !existsSync(keyPath)) {
      console.error('[GCP] Service account key not found:', keyPath);
      return false;
    }

    execSync(`gcloud auth activate-service-account --key-file="${keyPath}"`, {
      stdio: 'pipe',
    });

    const projectId = process.env.GCP_PROJECT_ID;
    if (projectId) {
      execSync(`gcloud config set project ${projectId}`, { stdio: 'pipe' });
    }

    console.log('[GCP] Authentication successful');
    return true;
  } catch (error) {
    console.error('[GCP] Authentication failed:', error);
    return false;
  }
}

/**
 * Build and push Docker image to Google Container Registry
 */
export async function buildAndPushImage(
  projectPath: string,
  projectId: string,
  imageName: string,
  tag: string = 'latest'
): Promise<{ success: boolean; image?: string; error?: string }> {
  try {
    const fullImageName = `gcr.io/${projectId}/${imageName}:${tag}`;

    // Check if Dockerfile exists
    const dockerfilePath = join(projectPath, 'Dockerfile');
    if (!existsSync(dockerfilePath)) {
      return {
        success: false,
        error: `Dockerfile not found at ${dockerfilePath}`,
      };
    }

    // Build image
    console.log(`[GCP] Building image: ${fullImageName}`);
    execSync(`docker build -t ${fullImageName} "${projectPath}"`, {
      stdio: 'pipe',
    });

    // Configure Docker for GCR
    execSync(`gcloud auth configure-docker --quiet`, { stdio: 'pipe' });

    // Push to registry
    console.log(`[GCP] Pushing image to GCR...`);
    execSync(`docker push ${fullImageName}`, { stdio: 'pipe' });

    return { success: true, image: fullImageName };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Deploy service to Cloud Run
 */
export async function deployToCloudRun(
  config: CloudRunConfig,
  _projectId: string,
  imageName?: string
): Promise<DeploymentResult> {
  const result: DeploymentResult = {
    success: false,
    message: '',
    steps: { authenticate: false, build: false, push: false, deploy: false },
    errors: [],
  };

  // Authenticate
  result.steps.authenticate = authenticateGCP();
  if (!result.steps.authenticate) {
    result.errors.push('GCP authentication failed');
    result.message = '❌ Failed to authenticate with GCP';
    return result;
  }

  try {
    // Build deploy command
    let deployCmd = `gcloud run deploy ${config.serviceName}`;

    // Add image if provided
    if (imageName) {
      deployCmd += ` --image=${imageName}`;
    }

    // Add region
    deployCmd += ` --region=${config.region}`;

    // Add resource limits
    if (config.memory) deployCmd += ` --memory=${config.memory}`;
    if (config.cpu) deployCmd += ` --cpu=${config.cpu}`;
    if (config.timeout) deployCmd += ` --timeout=${config.timeout}`;
    if (config.maxInstances !== undefined)
      deployCmd += ` --max-instances=${config.maxInstances}`;
    if (config.minInstances !== undefined)
      deployCmd += ` --min-instances=${config.minInstances}`;

    // Add environment variables file
    if (config.envVarsFile && existsSync(config.envVarsFile)) {
      deployCmd += ` --env-vars-file="${config.envVarsFile}"`;
    }

    // Add common flags
    deployCmd += ` --platform=managed --allow-unauthenticated --quiet`;

    console.log(`[GCP] Deploying to Cloud Run: ${config.serviceName}`);
    const output = execSync(deployCmd, { encoding: 'utf-8' });

    // Extract service URL from output
    const urlMatch = output.match(/Service URL: (https:\/\/[^\s]+)/);
    if (urlMatch) {
      result.url = urlMatch[1];
    }

    result.steps.deploy = true;
    result.success = true;
    result.message = `✅ Deployed successfully to ${config.region}`;

    return result;
  } catch (error) {
    result.errors.push(
      error instanceof Error ? error.message : 'Deployment failed'
    );
    result.message = '❌ Cloud Run deployment failed';
    return result;
  }
}

/**
 * Get Cloud Run service status
 */
export async function getServiceStatus(
  serviceName: string,
  region: string
): Promise<ServiceStatus | null> {
  try {
    if (!authenticateGCP()) {
      throw new Error('Authentication failed');
    }

    const output = execSync(
      `gcloud run services describe ${serviceName} --region=${region} --format=json`,
      { encoding: 'utf-8' }
    );

    const data = JSON.parse(output);

    return {
      name: serviceName,
      url: data.status?.url || 'N/A',
      status: data.status?.conditions?.[0]?.status || 'Unknown',
      region: region,
      lastDeployed:
        data.metadata?.annotations?.['serving.knative.dev/lastModifier'] ||
        'Unknown',
      traffic: '100%', // Simplified
      image: data.spec?.template?.spec?.containers?.[0]?.image || 'Unknown',
    };
  } catch (error) {
    console.error(`[GCP] Failed to get service status:`, error);
    return null;
  }
}

/**
 * Get Cloud Run service logs
 */
export async function getServiceLogs(
  serviceName: string,
  region: string,
  lines: number = 50
): Promise<string> {
  try {
    if (!authenticateGCP()) {
      throw new Error('Authentication failed');
    }

    const output = execSync(
      `gcloud run services logs read ${serviceName} --region=${region} --limit=${lines}`,
      { encoding: 'utf-8' }
    );

    return output;
  } catch (error) {
    return `Failed to fetch logs: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

/**
 * List all Cloud Run services in a region
 */
export async function listServices(region: string): Promise<string[]> {
  try {
    if (!authenticateGCP()) {
      throw new Error('Authentication failed');
    }

    const output = execSync(
      `gcloud run services list --region=${region} --format="value(name)"`,
      { encoding: 'utf-8' }
    );

    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    console.error(`[GCP] Failed to list services:`, error);
    return [];
  }
}

/**
 * Rollback to previous revision
 */
export async function rollbackService(
  serviceName: string,
  region: string,
  revisionName?: string
): Promise<{ success: boolean; message: string }> {
  try {
    if (!authenticateGCP()) {
      return { success: false, message: 'Authentication failed' };
    }

    let cmd = `gcloud run services update-traffic ${serviceName} --region=${region}`;

    if (revisionName) {
      cmd += ` --to-revisions=${revisionName}=100`;
    } else {
      // Get previous revision
      const revisions = execSync(
        `gcloud run revisions list --service=${serviceName} --region=${region} --format="value(name)" --limit=2`,
        { encoding: 'utf-8' }
      )
        .trim()
        .split('\n');

      if (revisions.length < 2) {
        return { success: false, message: 'No previous revision available' };
      }

      cmd += ` --to-revisions=${revisions[1]}=100`;
    }

    execSync(cmd, { stdio: 'pipe' });

    return { success: true, message: '✅ Rolled back successfully' };
  } catch (error) {
    return {
      success: false,
      message: `Failed to rollback: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
