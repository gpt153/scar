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
  console.log('[GCP Setup] Activating service account...');
  execSync(`gcloud auth activate-service-account --key-file=${keyPath}`, {
    stdio: 'inherit',
  });

  // Set default project
  const projectId = process.env.GCP_PROJECT_ID;
  if (projectId) {
    console.log(`[GCP Setup] Setting default project: ${projectId}`);
    execSync(`gcloud config set project ${projectId}`, { stdio: 'inherit' });
  }

  // Configure Docker to use gcloud as credential helper
  console.log('[GCP Setup] Configuring Docker authentication...');
  execSync('gcloud auth configure-docker --quiet', { stdio: 'inherit' });

  console.log('[GCP Setup] ✓ GCP authentication successful');
} catch (error) {
  console.error('[GCP Setup] Failed to authenticate with GCP:', error);
  process.exit(1);
}
