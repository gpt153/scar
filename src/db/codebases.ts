/**
 * Database operations for codebases
 */
import { pool } from './connection';
import { Codebase } from '../types';

export async function createCodebase(data: {
  name: string;
  repository_url?: string;
  default_cwd: string;
}): Promise<Codebase> {
  const result = await pool.query<Codebase>(
    'INSERT INTO remote_agent_codebases (name, repository_url, default_cwd) VALUES ($1, $2, $3) RETURNING *',
    [data.name, data.repository_url || null, data.default_cwd]
  );
  return result.rows[0];
}

export async function getCodebase(id: string): Promise<Codebase | null> {
  const result = await pool.query<Codebase>(
    'SELECT * FROM remote_agent_codebases WHERE id = $1',
    [id]
  );
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
  const result = await pool.query<{ commands: Record<string, any> }>(
    'SELECT commands FROM remote_agent_codebases WHERE id = $1',
    [id]
  );
  return result.rows[0]?.commands || {};
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
