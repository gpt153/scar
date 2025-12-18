/**
 * Database operations for message history
 * Handles CRUD operations for remote_agent_messages table
 */

import { pool } from './connection';

export interface Message {
  id: string;
  conversation_id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  images?: { filename: string; mimeType: string }[];
  created_at: Date;
}

/**
 * Create a new message in the database
 * @param conversationId - UUID of the conversation
 * @param sender - Message sender type ('user', 'assistant', 'system')
 * @param content - Message text content
 * @param images - Optional array of image metadata
 * @returns The created message with generated ID and timestamp
 */
export async function createMessage(
  conversationId: string,
  sender: 'user' | 'assistant' | 'system',
  content: string,
  images?: { filename: string; mimeType: string }[]
): Promise<Message> {
  const result = await pool.query<Message>(
    `INSERT INTO remote_agent_messages (conversation_id, sender, content, images)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [conversationId, sender, content, images ? JSON.stringify(images) : null]
  );
  return result.rows[0];
}

/**
 * Get message history for a conversation
 * @param conversationId - UUID of the conversation
 * @param limit - Maximum number of messages to return (default: 100)
 * @param offset - Number of messages to skip (default: 0)
 * @returns Array of messages ordered by creation time (oldest first)
 */
export async function getMessageHistory(
  conversationId: string,
  limit = 100,
  offset = 0
): Promise<Message[]> {
  const result = await pool.query<Message>(
    `SELECT * FROM remote_agent_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  );
  return result.rows;
}

/**
 * Get latest messages since a specific timestamp
 * Useful for polling for new messages or WebSocket sync
 * @param conversationId - UUID of the conversation
 * @param since - Timestamp to fetch messages after
 * @returns Array of messages ordered by creation time (oldest first)
 */
export async function getLatestMessages(conversationId: string, since: Date): Promise<Message[]> {
  const result = await pool.query<Message>(
    `SELECT * FROM remote_agent_messages
     WHERE conversation_id = $1 AND created_at > $2
     ORDER BY created_at ASC`,
    [conversationId, since]
  );
  return result.rows;
}
