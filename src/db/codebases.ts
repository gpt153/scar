/**
 * Database operations for codebases
 */
import { pool } from './connection';
import { Codebase, DockerConfig } from '../types';
import { deserializeDockerConfig, serializeDockerConfig } from '../utils/dockerConfig';

export async function createCodebase(data: {
  name: string;
  repository_url?: string;
  default_cwd: string;
  ai_assistant_type?: string;
}): Promise<Codebase> {
  const assistantType = data.ai_assistant_type ?? 'claude';
  const result = await pool.query<Codebase>(
    'INSERT INTO remote_agent_codebases (name, repository_url, default_cwd, ai_assistant_type) VALUES ($1, $2, $3, $4) RETURNING *',
    [data.name, data.repository_url ?? null, data.default_cwd, assistantType]
  );
  return result.rows[0];
}

export async function getCodebase(id: string): Promise<Codebase | null> {
  const result = await pool.query<Codebase>('SELECT * FROM remote_agent_codebases WHERE id = $1', [
    id,
  ]);
  return result.rows[0] || null;
}

export async function updateCodebaseCommands(
  id: string,
  commands: Record<string, { path: string; description: string }>
): Promise<void> {
  await pool.query(
    'UPDATE remote_agent_codebases SET commands = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(commands), id]
  );
}

export async function getCodebaseCommands(
  id: string
): Promise<Record<string, { path: string; description: string }>> {
  const result = await pool.query<{
    commands: Record<string, { path: string; description: string }>;
  }>('SELECT commands FROM remote_agent_codebases WHERE id = $1', [id]);
  return result.rows[0]?.commands ?? {};
}

export async function registerCommand(
  id: string,
  name: string,
  command: { path: string; description: string }
): Promise<void> {
  const commands = await getCodebaseCommands(id);
  commands[name] = command;
  await updateCodebaseCommands(id, commands);
}

export async function findCodebaseByRepoUrl(repoUrl: string): Promise<Codebase | null> {
  const result = await pool.query<Codebase>(
    'SELECT * FROM remote_agent_codebases WHERE repository_url = $1',
    [repoUrl]
  );
  return result.rows[0] || null;
}

export async function findCodebaseByDefaultCwd(defaultCwd: string): Promise<Codebase | null> {
  const result = await pool.query<Codebase>(
    'SELECT * FROM remote_agent_codebases WHERE default_cwd = $1 ORDER BY created_at DESC LIMIT 1',
    [defaultCwd]
  );
  return result.rows[0] || null;
}

export async function updateCodebase(id: string, data: { default_cwd?: string }): Promise<void> {
  const updates: string[] = [];
  const values: (string | null)[] = [];
  let paramIndex = 1;

  if (data.default_cwd !== undefined) {
    updates.push(`default_cwd = $${paramIndex++}`);
    values.push(data.default_cwd);
  }

  if (updates.length === 0) return;

  updates.push('updated_at = NOW()');
  values.push(id);

  await pool.query(
    `UPDATE remote_agent_codebases SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

export async function deleteCodebase(id: string): Promise<void> {
  // First, unlink any sessions referencing this codebase (FK has no cascade)
  await pool.query('UPDATE remote_agent_sessions SET codebase_id = NULL WHERE codebase_id = $1', [
    id,
  ]);
  // Second, unlink any conversations referencing this codebase (FK has no cascade)
  await pool.query(
    'UPDATE remote_agent_conversations SET codebase_id = NULL WHERE codebase_id = $1',
    [id]
  );
  // Then delete the codebase
  await pool.query('DELETE FROM remote_agent_codebases WHERE id = $1', [id]);
}

/**
 * Get Docker configuration for a codebase
 */
export async function getDockerConfig(id: string): Promise<DockerConfig | null> {
  const result = await pool.query<{ docker_config: unknown }>(
    'SELECT docker_config FROM remote_agent_codebases WHERE id = $1',
    [id]
  );

  if (!result.rows[0]) {
    return null;
  }

  return deserializeDockerConfig(result.rows[0].docker_config);
}

/**
 * Update Docker configuration for a codebase
 */
export async function updateDockerConfig(id: string, config: DockerConfig | null): Promise<void> {
  await pool.query(
    'UPDATE remote_agent_codebases SET docker_config = $1, updated_at = NOW() WHERE id = $2',
    [config ? JSON.stringify(serializeDockerConfig(config)) : null, id]
  );
}

/**
 * Get all codebases with Docker enabled
 */
export async function getDockerEnabledCodebases(): Promise<Codebase[]> {
  const result = await pool.query<Codebase>(
    `SELECT * FROM remote_agent_codebases
     WHERE docker_config IS NOT NULL
     AND docker_config->>'enabled' = 'true'
     ORDER BY updated_at DESC`
  );
  return result.rows;
}

/**
 * Find codebase by Docker Compose project name
 */
export async function findCodebaseByComposeProject(projectName: string): Promise<Codebase | null> {
  const result = await pool.query<Codebase>(
    `SELECT * FROM remote_agent_codebases
     WHERE docker_config->>'compose_project' = $1
     AND docker_config->>'enabled' = 'true'
     LIMIT 1`,
    [projectName]
  );
  return result.rows[0] || null;
}
