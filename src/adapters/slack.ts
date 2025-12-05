/**
 * Slack platform adapter using @slack/bolt with Socket Mode
 * Handles message sending with markdown block formatting for AI responses
 */
import { App, LogLevel } from '@slack/bolt';
import { IPlatformAdapter } from '../types';
import { parseAllowedUserIds, isSlackUserAuthorized } from '../utils/slack-auth';

const MAX_MARKDOWN_BLOCK_LENGTH = 12000; // Slack markdown block limit

/**
 * Slack message event context for the message handler
 */
export interface SlackMessageEvent {
  text: string;
  user: string;
  channel: string;
  ts: string;
  thread_ts?: string;
}

export class SlackAdapter implements IPlatformAdapter {
  private app: App;
  private streamingMode: 'stream' | 'batch';
  private messageHandler: ((event: SlackMessageEvent) => Promise<void>) | null = null;
  private allowedUserIds: string[];

  constructor(botToken: string, appToken: string, mode: 'stream' | 'batch' = 'batch') {
    this.app = new App({
      token: botToken,
      socketMode: true,
      appToken: appToken,
      logLevel: LogLevel.INFO,
    });
    this.streamingMode = mode;

    // Parse Slack user whitelist (optional - empty = open access)
    this.allowedUserIds = parseAllowedUserIds(process.env.SLACK_ALLOWED_USER_IDS);
    if (this.allowedUserIds.length > 0) {
      console.log(`[Slack] User whitelist enabled (${String(this.allowedUserIds.length)} users)`);
    } else {
      console.log('[Slack] User whitelist disabled (open access)');
    }

    console.log(`[Slack] Adapter initialized (mode: ${mode})`);
  }

  /**
   * Send a message to a Slack channel/thread
   * Uses markdown block for proper formatting of AI responses
   * Automatically splits messages longer than 12000 characters
   */
  async sendMessage(channelId: string, message: string): Promise<void> {
    console.log(`[Slack] sendMessage called, length=${String(message.length)}`);

    // Parse channelId - may include thread_ts as "channel:thread_ts"
    const [channel, threadTs] = channelId.includes(':')
      ? channelId.split(':')
      : [channelId, undefined];

    if (message.length <= MAX_MARKDOWN_BLOCK_LENGTH) {
      // Use markdown block for proper formatting
      await this.sendWithMarkdownBlock(channel, message, threadTs);
    } else {
      // Long message: split by paragraphs
      console.log(`[Slack] Message too long (${String(message.length)}), splitting by paragraphs`);
      const chunks = this.splitIntoParagraphChunks(message, MAX_MARKDOWN_BLOCK_LENGTH - 500);

      for (const chunk of chunks) {
        await this.sendWithMarkdownBlock(channel, chunk, threadTs);
      }
    }
  }

  /**
   * Send a message using Slack's markdown block for proper formatting
   * Falls back to plain text if block fails
   */
  private async sendWithMarkdownBlock(
    channel: string,
    message: string,
    threadTs?: string
  ): Promise<void> {
    try {
      await this.app.client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        blocks: [
          {
            type: 'markdown',
            text: message,
          },
        ],
        // Fallback text for notifications/accessibility
        text: message.substring(0, 150) + (message.length > 150 ? '...' : ''),
      });
      console.log(`[Slack] Markdown block sent (${String(message.length)} chars)`);
    } catch (error) {
      // Fallback to plain text
      const err = error as Error;
      console.warn('[Slack] Markdown block failed, using plain text:', err.message);
      await this.app.client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: message,
      });
    }
  }

  /**
   * Split message into chunks by paragraph boundaries
   * Paragraphs are separated by double newlines
   */
  private splitIntoParagraphChunks(message: string, maxLength: number): string[] {
    const paragraphs = message.split(/\n\n+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      const newLength = currentChunk.length + para.length + 2; // +2 for \n\n

      if (newLength > maxLength && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = para;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    // Fallback: split by lines if any chunk is still too long
    const finalChunks: string[] = [];
    for (const chunk of chunks) {
      if (chunk.length <= maxLength) {
        finalChunks.push(chunk);
      } else {
        const lines = chunk.split('\n');
        let subChunk = '';
        for (const line of lines) {
          if (subChunk.length + line.length + 1 > maxLength) {
            if (subChunk) finalChunks.push(subChunk);
            subChunk = line;
          } else {
            subChunk += (subChunk ? '\n' : '') + line;
          }
        }
        if (subChunk) finalChunks.push(subChunk);
      }
    }

    console.log(`[Slack] Split into ${String(finalChunks.length)} chunks`);
    return finalChunks;
  }

  /**
   * Get the Bolt App instance
   */
  getApp(): App {
    return this.app;
  }

  /**
   * Get the configured streaming mode
   */
  getStreamingMode(): 'stream' | 'batch' {
    return this.streamingMode;
  }

  /**
   * Get platform type
   */
  getPlatformType(): string {
    return 'slack';
  }

  /**
   * Check if a message is in a thread
   */
  isThread(event: SlackMessageEvent): boolean {
    return event.thread_ts !== undefined && event.thread_ts !== event.ts;
  }

  /**
   * Get parent conversation ID for a thread message
   * Returns null if not in a thread
   */
  getParentConversationId(event: SlackMessageEvent): string | null {
    if (this.isThread(event)) {
      // Parent conversation is the channel with the original message ts
      return `${event.channel}:${event.thread_ts}`;
    }
    return null;
  }

  /**
   * Fetch thread history (messages in the thread)
   * Returns messages in chronological order (oldest first)
   */
  async fetchThreadHistory(event: SlackMessageEvent): Promise<string[]> {
    if (!this.isThread(event) || !event.thread_ts) {
      return [];
    }

    try {
      const result = await this.app.client.conversations.replies({
        channel: event.channel,
        ts: event.thread_ts,
        limit: 100,
      });

      if (!result.messages) {
        return [];
      }

      // Messages are already in chronological order
      return result.messages.map(msg => {
        const author = msg.bot_id ? '[Bot]' : `<@${msg.user}>`;
        return `${author}: ${msg.text ?? ''}`;
      });
    } catch (error) {
      console.error('[Slack] Failed to fetch thread history:', error);
      return [];
    }
  }

  /**
   * Get conversation ID from Slack event
   * For threads: returns "channel:thread_ts" to maintain thread context
   * For non-threads: returns channel ID only
   */
  getConversationId(event: SlackMessageEvent): string {
    // If in a thread, use "channel:thread_ts" format
    // This ensures thread replies stay in the same conversation
    if (event.thread_ts) {
      return `${event.channel}:${event.thread_ts}`;
    }
    // If starting a new conversation in channel, use "channel:ts"
    // so future replies create a thread
    return `${event.channel}:${event.ts}`;
  }

  /**
   * Strip bot mention from message text and normalize Slack formatting
   */
  stripBotMention(text: string): string {
    // Slack mentions are <@USERID> format
    // Remove all user mentions at the start of the message
    let result = text.replace(/^<@[UW][A-Z0-9]+>\s*/g, '').trim();

    // Normalize Slack URL formatting: <https://example.com> -> https://example.com
    // Also handles URLs with labels: <https://example.com|example.com> -> https://example.com
    result = result.replace(/<(https?:\/\/[^|>]+)(?:\|[^>]+)?>/g, '$1');

    return result;
  }

  /**
   * Register a message handler for incoming messages
   * Must be called before start()
   */
  onMessage(handler: (event: SlackMessageEvent) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Start the bot (connects via Socket Mode)
   */
  async start(): Promise<void> {
    // Register app_mention event handler (when bot is @mentioned)
    this.app.event('app_mention', async ({ event }) => {
      // Authorization check
      const userId = event.user;
      if (!isSlackUserAuthorized(userId, this.allowedUserIds)) {
        const maskedId = userId ? `${userId.slice(0, 4)}***` : 'unknown';
        console.log(`[Slack] Unauthorized message from user ${maskedId}`);
        return;
      }

      if (this.messageHandler && event.user) {
        const messageEvent: SlackMessageEvent = {
          text: event.text,
          user: event.user,
          channel: event.channel,
          ts: event.ts,
          thread_ts: event.thread_ts,
        };
        // Fire-and-forget - errors handled by caller
        void this.messageHandler(messageEvent);
      }
    });

    // Also handle direct messages (DMs don't require @mention)
    this.app.event('message', async ({ event }) => {
      // Only handle DM messages (channel type 'im')
      // Skip if this is a message in a channel (requires @mention via app_mention)
      // The 'channel_type' is on certain event subtypes
      const channelType = (event as { channel_type?: string }).channel_type;
      if (channelType !== 'im') {
        return;
      }

      // Skip bot messages to prevent loops
      if ('bot_id' in event && event.bot_id) {
        return;
      }

      // Authorization check
      const userId = 'user' in event ? event.user : undefined;
      if (!isSlackUserAuthorized(userId, this.allowedUserIds)) {
        const maskedId = userId ? `${userId.slice(0, 4)}***` : 'unknown';
        console.log(`[Slack] Unauthorized DM from user ${maskedId}`);
        return;
      }

      if (this.messageHandler && 'text' in event && event.text) {
        const messageEvent: SlackMessageEvent = {
          text: event.text,
          user: userId ?? '',
          channel: event.channel,
          ts: event.ts,
          thread_ts: 'thread_ts' in event ? event.thread_ts : undefined,
        };
        void this.messageHandler(messageEvent);
      }
    });

    await this.app.start();
    console.log('[Slack] Bot started (Socket Mode)');
  }

  /**
   * Stop the bot gracefully
   */
  stop(): void {
    void this.app.stop();
    console.log('[Slack] Bot stopped');
  }
}
