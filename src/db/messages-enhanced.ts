/**
 * Database operations for message history with explicit platform/project tagging
 * Enhanced version with traceability support
 */

import { pool } from './connection';

export interface Message {
  id: string;
  conversation_id: string;

  // Explicit tagging for traceability
  platform_type: 'github' | 'telegram' | 'cli' | 'slack' | 'discord' | 'web';
  codebase_id: string | null;
  codebase_name: string | null;

  // Message content
  sender: 'user' | 'assistant' | 'system';
  content: string;
  images?: { filename: string; mimeType: string }[];

  created_at: Date;
}

/**
 * Create a new message with explicit platform and codebase tagging
 * @param conversationId - UUID of the conversation
 * @param platformType - Source platform (github, telegram, cli, etc.)
 * @param codebaseId - UUID of the codebase (project)
 * @param codebaseName - Cached codebase name for display
 * @param sender - Message sender type ('user', 'assistant', 'system')
 * @param content - Message text content
 * @param images - Optional array of image metadata
 * @returns The created message with generated ID and timestamp
 */
export async function createMessage(
  conversationId: string,
  platformType: 'github' | 'telegram' | 'cli' | 'slack' | 'discord' | 'web',
  codebaseId: string | null,
  codebaseName: string | null,
  sender: 'user' | 'assistant' | 'system',
  content: string,
  images?: { filename: string; mimeType: string }[]
): Promise<Message> {
  const result = await pool.query<Message>(
    `INSERT INTO remote_agent_messages
     (conversation_id, platform_type, codebase_id, codebase_name, sender, content, images)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      conversationId,
      platformType,
      codebaseId,
      codebaseName,
      sender,
      content,
      images ? JSON.stringify(images) : null,
    ]
  );
  return result.rows[0];
}

/**
 * Get message history for a conversation (for /resume command)
 * @param conversationId - UUID of the conversation
 * @param limit - Maximum number of messages to return (default: 50)
 * @returns Array of messages ordered by creation time (oldest first)
 */
export async function getMessageHistory(
  conversationId: string,
  limit = 50
): Promise<Message[]> {
  const result = await pool.query<Message>(
    `SELECT * FROM remote_agent_messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit]
  );
  // Reverse to get oldest-first (chronological order for AI context)
  return result.rows.reverse();
}

/**
 * Get message history for a specific project across all platforms
 * Useful for understanding work done on a project from multiple interfaces
 * @param codebaseId - UUID of the codebase
 * @param limit - Maximum number of messages to return
 * @returns Array of messages with platform info
 */
export async function getMessageHistoryByProject(
  codebaseId: string,
  limit = 100
): Promise<Message[]> {
  const result = await pool.query<Message>(
    `SELECT * FROM remote_agent_messages
     WHERE codebase_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [codebaseId, limit]
  );
  return result.rows.reverse();
}

/**
 * Get message history for a specific platform
 * @param platformType - Platform type (github, telegram, cli, etc.)
 * @param limit - Maximum number of messages to return
 * @returns Array of messages from that platform
 */
export async function getMessageHistoryByPlatform(
  platformType: string,
  limit = 100
): Promise<Message[]> {
  const result = await pool.query<Message>(
    `SELECT * FROM remote_agent_messages
     WHERE platform_type = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [platformType, limit]
  );
  return result.rows.reverse();
}

/**
 * Get conversation summary statistics
 * Shows message counts by platform and project
 * @param conversationId - UUID of the conversation
 * @returns Summary statistics
 */
export async function getConversationStats(conversationId: string): Promise<{
  total: number;
  by_sender: Record<string, number>;
  by_platform: Record<string, number>;
  projects: string[];
}> {
  const result = await pool.query(
    `SELECT
       COUNT(*) as total,
       sender,
       platform_type,
       codebase_name
     FROM remote_agent_messages
     WHERE conversation_id = $1
     GROUP BY sender, platform_type, codebase_name`,
    [conversationId]
  );

  const stats = {
    total: 0,
    by_sender: {} as Record<string, number>,
    by_platform: {} as Record<string, number>,
    projects: [] as string[],
  };

  result.rows.forEach((row) => {
    stats.total += parseInt(row.count);
    stats.by_sender[row.sender] = (stats.by_sender[row.sender] || 0) + parseInt(row.count);
    stats.by_platform[row.platform_type] =
      (stats.by_platform[row.platform_type] || 0) + parseInt(row.count);
    if (row.codebase_name && !stats.projects.includes(row.codebase_name)) {
      stats.projects.push(row.codebase_name);
    }
  });

  return stats;
}

/**
 * Delete old messages (for retention policy)
 * @param daysOld - Delete messages older than this many days
 * @returns Number of messages deleted
 */
export async function deleteOldMessages(daysOld: number): Promise<number> {
  const result = await pool.query(
    `DELETE FROM remote_agent_messages
     WHERE created_at < NOW() - INTERVAL '${daysOld} days'
     RETURNING id`
  );
  return result.rows.length;
}

/**
 * Format messages as context for AI
 * Creates a readable conversation history string
 * @param messages - Array of messages
 * @returns Formatted context string
 */
export function formatMessagesAsContext(messages: Message[]): string {
  if (messages.length === 0) return '';

  const contextLines = [
    '=== Recent Conversation History ===',
    `(Last ${messages.length} messages from this conversation)`,
    '',
  ];

  messages.forEach((msg) => {
    const timestamp = msg.created_at.toISOString().split('T')[0]; // YYYY-MM-DD
    const platform = msg.platform_type;
    const project = msg.codebase_name || 'no-project';

    contextLines.push(`[${timestamp} | ${platform} | ${project}]`);
    contextLines.push(`${msg.sender.toUpperCase()}: ${msg.content}`);
    contextLines.push('');
  });

  contextLines.push('=== End Conversation History ===');
  contextLines.push('');

  return contextLines.join('\n');
}
