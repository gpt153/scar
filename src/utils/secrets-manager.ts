/**
 * Centralized Secrets Management
 *
 * Manages secrets in ~/.archon/.secrets/ with project and global scopes.
 * Provides persistent secret storage across all sessions and context switches.
 *
 * @module secrets-manager
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

const SECRETS_BASE_DIR = path.join(homedir(), '.archon', '.secrets');
const GLOBAL_SECRETS_FILE = path.join(SECRETS_BASE_DIR, 'global.env');
const PROJECTS_DIR = path.join(SECRETS_BASE_DIR, 'projects');

export type SecretScope = 'global' | 'project';

export interface Secret {
  key: string;
  value: string;
  scope: SecretScope;
}

export interface SecretCheckResult {
  missing: string[];
  found: string[];
}

/**
 * Ensure secrets directory structure exists
 */
async function ensureSecretsDir(): Promise<void> {
  await fs.mkdir(SECRETS_BASE_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(PROJECTS_DIR, { recursive: true, mode: 0o700 });

  // Ensure global.env exists
  if (!existsSync(GLOBAL_SECRETS_FILE)) {
    await fs.writeFile(GLOBAL_SECRETS_FILE, '', { mode: 0o600 });
  }
}

/**
 * Get the path to a project's secrets file
 */
function getProjectSecretsPath(projectName: string): string {
  return path.join(PROJECTS_DIR, `${projectName}.env`);
}

/**
 * Parse .env file contents into key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const secrets: Record<string, string> = {};
  const lines = content.split('\n');

  let currentKey: string | null = null;
  let currentValue = '';
  let inMultiline = false;

  for (const line of lines) {
    // Skip empty lines and comments (when not in multiline)
    if (!inMultiline && (line.trim() === '' || line.trim().startsWith('#'))) {
      continue;
    }

    // Check if starting a new key=value pair
    if (!inMultiline && line.includes('=')) {
      // Save previous key if exists
      if (currentKey) {
        secrets[currentKey] = currentValue.trim();
      }

      const equalIndex = line.indexOf('=');
      currentKey = line.substring(0, equalIndex).trim();
      let value = line.substring(equalIndex + 1);

      // Check if value starts with quote (multiline)
      if (value.trim().startsWith('"') && !value.trim().endsWith('"')) {
        inMultiline = true;
        currentValue = value.trim().substring(1); // Remove opening quote
      } else if (value.trim().startsWith('"') && value.trim().endsWith('"')) {
        // Single line quoted value
        currentValue = value.trim().slice(1, -1);
      } else {
        currentValue = value.trim();
      }
    } else if (inMultiline) {
      // Continue multiline value
      if (line.trim().endsWith('"')) {
        // End of multiline
        currentValue += '\n' + line.trim().slice(0, -1);
        inMultiline = false;
      } else {
        currentValue += '\n' + line;
      }
    }
  }

  // Save last key
  if (currentKey) {
    secrets[currentKey] = currentValue.trim();
  }

  return secrets;
}

/**
 * Serialize secrets to .env file format
 */
function serializeEnvFile(secrets: Record<string, string>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(secrets)) {
    // Escape multiline values with quotes
    if (value.includes('\n')) {
      lines.push(`${key}="${value}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Read secrets from a file
 */
async function readSecretsFile(filePath: string): Promise<Record<string, string>> {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = await fs.readFile(filePath, 'utf-8');
  return parseEnvFile(content);
}

/**
 * Write secrets to a file
 */
async function writeSecretsFile(
  filePath: string,
  secrets: Record<string, string>
): Promise<void> {
  const content = serializeEnvFile(secrets);
  await fs.writeFile(filePath, content, { mode: 0o600 });
}

/**
 * Set a secret (global or project-scoped)
 *
 * @param projectName - Name of the project (ignored if scope is 'global')
 * @param key - Secret key name
 * @param value - Secret value
 * @param scope - 'global' or 'project' (default: 'project')
 */
export async function setSecret(
  projectName: string,
  key: string,
  value: string,
  scope: SecretScope = 'project'
): Promise<void> {
  await ensureSecretsDir();

  const filePath = scope === 'global'
    ? GLOBAL_SECRETS_FILE
    : getProjectSecretsPath(projectName);

  const secrets = await readSecretsFile(filePath);
  secrets[key] = value;

  await writeSecretsFile(filePath, secrets);
}

/**
 * Get a secret value (checks project then global)
 *
 * @param projectName - Name of the project
 * @param key - Secret key name
 * @returns Secret value or null if not found
 */
export async function getSecret(
  projectName: string,
  key: string
): Promise<string | null> {
  await ensureSecretsDir();

  // Check project secrets first
  const projectSecrets = await readSecretsFile(getProjectSecretsPath(projectName));
  if (key in projectSecrets) {
    return projectSecrets[key];
  }

  // Fall back to global secrets
  const globalSecrets = await readSecretsFile(GLOBAL_SECRETS_FILE);
  if (key in globalSecrets) {
    return globalSecrets[key];
  }

  return null;
}

/**
 * List all secret keys (not values) for a project
 * Returns both global and project-specific keys
 *
 * @param projectName - Name of the project
 * @returns Object with global and project secret keys
 */
export async function listSecrets(
  projectName: string
): Promise<{ global: string[]; project: string[] }> {
  await ensureSecretsDir();

  const globalSecrets = await readSecretsFile(GLOBAL_SECRETS_FILE);
  const projectSecrets = await readSecretsFile(getProjectSecretsPath(projectName));

  return {
    global: Object.keys(globalSecrets),
    project: Object.keys(projectSecrets),
  };
}

/**
 * Get all secrets merged (project overrides global)
 *
 * @param projectName - Name of the project
 * @returns Merged secrets object
 */
export async function getAllSecrets(
  projectName: string
): Promise<Record<string, string>> {
  await ensureSecretsDir();

  const globalSecrets = await readSecretsFile(GLOBAL_SECRETS_FILE);
  const projectSecrets = await readSecretsFile(getProjectSecretsPath(projectName));

  // Project secrets override global
  return { ...globalSecrets, ...projectSecrets };
}

/**
 * Sync secrets to workspace .env.local file
 *
 * @param projectName - Name of the project
 * @param workspacePath - Path to workspace directory
 */
export async function syncSecrets(
  projectName: string,
  workspacePath: string
): Promise<void> {
  await ensureSecretsDir();

  const allSecrets = await getAllSecrets(projectName);
  const envLocalPath = path.join(workspacePath, '.env.local');

  await writeSecretsFile(envLocalPath, allSecrets);

  // Ensure .env.local is in .gitignore
  await ensureGitignore(workspacePath);
}

/**
 * Ensure .env.local is in .gitignore
 */
async function ensureGitignore(workspacePath: string): Promise<void> {
  const gitignorePath = path.join(workspacePath, '.gitignore');

  let gitignoreContent = '';
  if (existsSync(gitignorePath)) {
    gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
  }

  // Check if .env.local is already ignored
  const lines = gitignoreContent.split('\n');
  const hasEnvLocal = lines.some(line =>
    line.trim() === '.env.local' || line.trim() === '/.env.local'
  );

  if (!hasEnvLocal) {
    // Add .env.local to gitignore
    const newContent = gitignoreContent.trim() + '\n\n# Local environment variables (managed by SCAR secrets)\n.env.local\n';
    await fs.writeFile(gitignorePath, newContent, 'utf-8');
  }
}

/**
 * Check if required secrets exist
 *
 * @param projectName - Name of the project
 * @param requiredKeys - Array of required secret keys
 * @returns Object with missing and found keys
 */
export async function checkRequiredSecrets(
  projectName: string,
  requiredKeys: string[]
): Promise<SecretCheckResult> {
  await ensureSecretsDir();

  const allSecrets = await getAllSecrets(projectName);
  const found: string[] = [];
  const missing: string[] = [];

  for (const key of requiredKeys) {
    if (key in allSecrets && allSecrets[key].trim() !== '') {
      found.push(key);
    } else {
      missing.push(key);
    }
  }

  return { missing, found };
}

/**
 * Delete a secret
 *
 * @param projectName - Name of the project
 * @param key - Secret key to delete
 * @param scope - 'global' or 'project' (default: 'project')
 */
export async function deleteSecret(
  projectName: string,
  key: string,
  scope: SecretScope = 'project'
): Promise<boolean> {
  await ensureSecretsDir();

  const filePath = scope === 'global'
    ? GLOBAL_SECRETS_FILE
    : getProjectSecretsPath(projectName);

  const secrets = await readSecretsFile(filePath);

  if (!(key in secrets)) {
    return false; // Secret doesn't exist
  }

  delete secrets[key];
  await writeSecretsFile(filePath, secrets);

  return true;
}

/**
 * Get the current project name from workspace path
 *
 * @param workspacePath - Path to workspace directory
 * @returns Project name (directory basename)
 */
export function getProjectName(workspacePath: string): string {
  return path.basename(workspacePath);
}
