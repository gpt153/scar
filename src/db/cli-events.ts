/**
 * Database operations for CLI events history
 * Handles CRUD operations for remote_agent_cli_events table
 */

import { pool } from './connection';

export interface CLIEvent {
  id: string;
  conversation_id: string;
  type: 'tool_call' | 'tool_result' | 'thinking' | 'error' | 'status' | 'message';
  content: string;
  metadata?: {
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    exitCode?: number;
    duration?: number;
  };
  created_at: Date;
}

/**
 * Create a new CLI event in the database
 * @param conversationId - UUID of the conversation
 * @param type - Event type
 * @param content - Event content
 * @param metadata - Optional metadata (tool name, args, etc.)
 * @returns The created CLI event with generated ID and timestamp
 */
export async function createCLIEvent(
  conversationId: string,
  type: CLIEvent['type'],
  content: string,
  metadata?: CLIEvent['metadata']
): Promise<CLIEvent> {
  const result = await pool.query<CLIEvent>(
    `INSERT INTO remote_agent_cli_events (conversation_id, type, content, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [conversationId, type, content, metadata ? JSON.stringify(metadata) : null]
  );
  return result.rows[0];
}

/**
 * Get CLI event history for a conversation
 * @param conversationId - UUID of the conversation
 * @param limit - Maximum number of events to return (default: 100)
 * @param offset - Number of events to skip (default: 0)
 * @returns Array of CLI events ordered by creation time (oldest first)
 */
export async function getCLIEventHistory(
  conversationId: string,
  limit = 100,
  offset = 0
): Promise<CLIEvent[]> {
  const result = await pool.query<CLIEvent>(
    `SELECT * FROM remote_agent_cli_events
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  );
  return result.rows;
}

/**
 * Get latest CLI events since a specific timestamp
 * Useful for polling for new events or WebSocket sync
 * @param conversationId - UUID of the conversation
 * @param since - Timestamp to fetch events after
 * @returns Array of CLI events ordered by creation time (oldest first)
 */
export async function getLatestCLIEvents(conversationId: string, since: Date): Promise<CLIEvent[]> {
  const result = await pool.query<CLIEvent>(
    `SELECT * FROM remote_agent_cli_events
     WHERE conversation_id = $1 AND created_at > $2
     ORDER BY created_at ASC`,
    [conversationId, since]
  );
  return result.rows;
}
