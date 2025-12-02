/**
 * Telegram platform adapter using Telegraf SDK
 * Handles message sending with 4096 character limit splitting
 */
import { Telegraf, Context } from 'telegraf';
import { IPlatformAdapter } from '../types';
import { parseAllowedUserIds, isUserAuthorized } from '../utils/telegram-auth';
import { convertToTelegramMarkdown, stripMarkdown } from '../utils/telegram-markdown';

const MAX_LENGTH = 4096;

/**
 * Message context passed to onMessage handler
 */
export interface TelegramMessageContext {
  conversationId: string;
  message: string;
  userId: number | undefined;
}

export class TelegramAdapter implements IPlatformAdapter {
  private bot: Telegraf;
  private streamingMode: 'stream' | 'batch';
  private allowedUserIds: number[];
  private messageHandler: ((ctx: TelegramMessageContext) => Promise<void>) | null = null;

  constructor(token: string, mode: 'stream' | 'batch' = 'stream') {
    // Disable handler timeout to support long-running AI operations
    // Default is 90 seconds which is too short for complex coding tasks
    this.bot = new Telegraf(token, {
      handlerTimeout: Infinity,
    });
    this.streamingMode = mode;

    // Parse Telegram user whitelist (optional - empty = open access)
    // Support both TELEGRAM_ALLOWED_USER_IDS and TELEGRAM_ALLOWED_USERS
    this.allowedUserIds = parseAllowedUserIds(
      process.env.TELEGRAM_ALLOWED_USER_IDS ?? process.env.TELEGRAM_ALLOWED_USERS
    );
    if (this.allowedUserIds.length > 0) {
      console.log(
        `[Telegram] User whitelist enabled (${String(this.allowedUserIds.length)} users)`
      );
    } else {
      console.log('[Telegram] User whitelist disabled (open access)');
    }

    console.log(`[Telegram] Adapter initialized (mode: ${mode}, timeout: disabled)`);
  }

  /**
   * Send a message to a Telegram chat
   * Automatically splits messages longer than 4096 characters
   *
   * Formatting strategy:
   * - Short messages (≤4096 chars): Convert to MarkdownV2 for nice formatting
   * - Long messages: Split by paragraphs, format each chunk independently
   *   (paragraphs rarely have formatting that spans across them)
   */
  async sendMessage(chatId: string, message: string): Promise<void> {
    const id = parseInt(chatId);
    console.log(`[Telegram] sendMessage called, length=${String(message.length)}`);

    if (message.length <= MAX_LENGTH) {
      // Short message: try MarkdownV2 formatting
      await this.sendFormattedChunk(id, message);
    } else {
      // Long message: split by paragraphs, format each chunk
      console.log(
        `[Telegram] Message too long (${String(message.length)}), splitting by paragraphs`
      );
      const chunks = this.splitIntoParagraphChunks(message, MAX_LENGTH - 200);

      for (const chunk of chunks) {
        await this.sendFormattedChunk(id, chunk);
      }
    }
  }

  /**
   * Split message into chunks by paragraph boundaries
   * Paragraphs are separated by double newlines and usually contain complete formatting
   */
  private splitIntoParagraphChunks(message: string, maxLength: number): string[] {
    const paragraphs = message.split(/\n\n+/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      const newLength = currentChunk.length + para.length + 2; // +2 for \n\n

      if (newLength > maxLength && currentChunk) {
        // Current chunk is full, start a new one
        chunks.push(currentChunk);
        currentChunk = para;
      } else {
        // Add paragraph to current chunk
        currentChunk += (currentChunk ? '\n\n' : '') + para;
      }
    }

    // Don't forget the last chunk
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    console.log(`[Telegram] Split into ${String(chunks.length)} paragraph chunks`);
    return chunks;
  }

  /**
   * Send a single chunk with MarkdownV2 formatting, with fallback to plain text
   */
  private async sendFormattedChunk(id: number, chunk: string): Promise<void> {
    // If chunk is still too long after paragraph splitting, fall back to plain text
    if (chunk.length > MAX_LENGTH) {
      console.log(`[Telegram] Chunk too long (${String(chunk.length)}), sending as plain text`);
      const plainText = stripMarkdown(chunk);
      // Split by lines if still too long
      const lines = plainText.split('\n');
      let subChunk = '';
      for (const line of lines) {
        if (subChunk.length + line.length + 1 > MAX_LENGTH - 100) {
          if (subChunk) await this.bot.telegram.sendMessage(id, subChunk);
          subChunk = line;
        } else {
          subChunk += (subChunk ? '\n' : '') + line;
        }
      }
      if (subChunk) await this.bot.telegram.sendMessage(id, subChunk);
      return;
    }

    // Try MarkdownV2 formatting
    const formatted = convertToTelegramMarkdown(chunk);
    try {
      await this.bot.telegram.sendMessage(id, formatted, { parse_mode: 'MarkdownV2' });
      console.log(`[Telegram] MarkdownV2 chunk sent (${String(chunk.length)} chars)`);
    } catch (error) {
      // Fallback to stripped plain text for this chunk
      const err = error as Error;
      console.warn('[Telegram] MarkdownV2 failed for chunk, using plain text:', err.message);
      console.warn('[Telegram] Original chunk (first 500 chars):', chunk.substring(0, 500));
      console.warn('[Telegram] Formatted chunk (first 500 chars):', formatted.substring(0, 500));
      console.warn(
        '[Telegram] Formatted chunk (around byte 4059):',
        formatted.substring(4000, 4100)
      );
      await this.bot.telegram.sendMessage(id, stripMarkdown(chunk));
    }
  }

  /**
   * Get the Telegraf bot instance
   */
  getBot(): Telegraf {
    return this.bot;
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
    return 'telegram';
  }

  /**
   * Extract conversation ID from Telegram context
   */
  getConversationId(ctx: Context): string {
    if (!ctx.chat) {
      throw new Error('No chat in context');
    }
    return ctx.chat.id.toString();
  }

  /**
   * Register a message handler for incoming messages
   * Must be called before start()
   */
  onMessage(handler: (ctx: TelegramMessageContext) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Start the bot (begins polling)
   */
  async start(): Promise<void> {
    // Register message handler before launch
    this.bot.on('message', ctx => {
      if (!('text' in ctx.message)) return;

      const message = ctx.message.text;
      if (!message) return;

      // Authorization check - verify sender is in whitelist
      const userId = ctx.from.id;
      if (!isUserAuthorized(userId, this.allowedUserIds)) {
        // Log unauthorized attempt (mask user ID for privacy)
        const maskedId = `${String(userId).slice(0, 4)}***`;
        console.log(`[Telegram] Unauthorized message from user ${maskedId}`);
        return; // Silent rejection
      }

      if (this.messageHandler) {
        const conversationId = this.getConversationId(ctx);
        // Fire-and-forget - errors handled by caller
        void this.messageHandler({ conversationId, message, userId });
      }
    });

    // Drop pending updates on startup to prevent reprocessing messages after container restart
    // This ensures a clean slate - old unprocessed messages won't be handled
    await this.bot.launch({
      dropPendingUpdates: true,
    });
    console.log('[Telegram] Bot started (polling mode, pending updates dropped)');
  }

  /**
   * Stop the bot gracefully
   */
  stop(): void {
    this.bot.stop();
    console.log('[Telegram] Bot stopped');
  }
}
