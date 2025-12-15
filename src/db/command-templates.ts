/**
 * Database operations for command templates
 */
import { pool } from './connection';
import { CommandTemplate } from '../types';

export async function createTemplate(data: {
  name: string;
  description?: string;
  content: string;
}): Promise<CommandTemplate> {
  const result = await pool.query<CommandTemplate>(
    'INSERT INTO remote_agent_command_templates (name, description, content) VALUES ($1, $2, $3) RETURNING *',
    [data.name, data.description ?? null, data.content]
  );
  return result.rows[0];
}

export async function getTemplate(name: string): Promise<CommandTemplate | null> {
  const result = await pool.query<CommandTemplate>(
    'SELECT * FROM remote_agent_command_templates WHERE name = $1',
    [name]
  );
  return result.rows[0] || null;
}

export async function getAllTemplates(): Promise<CommandTemplate[]> {
  const result = await pool.query<CommandTemplate>(
    'SELECT * FROM remote_agent_command_templates ORDER BY name'
  );
  return result.rows;
}

export async function deleteTemplate(name: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM remote_agent_command_templates WHERE name = $1', [
    name,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function upsertTemplate(data: {
  name: string;
  description?: string;
  content: string;
}): Promise<CommandTemplate> {
  const result = await pool.query<CommandTemplate>(
    `INSERT INTO remote_agent_command_templates (name, description, content)
     VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET
       description = EXCLUDED.description,
       content = EXCLUDED.content,
       updated_at = NOW()
     RETURNING *`,
    [data.name, data.description ?? null, data.content]
  );
  return result.rows[0];
}
