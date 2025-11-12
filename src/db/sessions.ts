/**
 * Database operations for sessions
 */
import { pool } from './connection';
import { Session } from '../types';

export async function getActiveSession(conversationId: string): Promise<Session | null> {
  const result = await pool.query<Session>(
    'SELECT * FROM remote_agent_sessions WHERE conversation_id = $1 AND active = true LIMIT 1',
    [conversationId]
  );
  return result.rows[0] || null;
}

export async function createSession(data: {
  conversation_id: string;
  codebase_id?: string;
  assistant_session_id?: string;
  ai_assistant_type: string;
}): Promise<Session> {
  const result = await pool.query<Session>(
    'INSERT INTO remote_agent_sessions (conversation_id, codebase_id, ai_assistant_type, assistant_session_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [data.conversation_id, data.codebase_id || null, data.ai_assistant_type, data.assistant_session_id || null]
  );
  return result.rows[0];
}

export async function updateSession(id: string, sessionId: string): Promise<void> {
  await pool.query('UPDATE remote_agent_sessions SET assistant_session_id = $1 WHERE id = $2', [
    sessionId,
    id,
  ]);
}

export async function deactivateSession(id: string): Promise<void> {
  await pool.query(
    'UPDATE remote_agent_sessions SET active = false, ended_at = NOW() WHERE id = $1',
    [id]
  );
}

export async function updateSessionMetadata(
  id: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await pool.query(
    'UPDATE remote_agent_sessions SET metadata = metadata || $1::jsonb WHERE id = $2',
    [JSON.stringify(metadata), id]
  );
}
