/**
 * Telegram platform adapter using Telegraf SDK
 * Handles message sending with 4096 character limit splitting
 */
import { Telegraf, Context } from 'telegraf';
import { IPlatformAdapter } from '../types';

const MAX_LENGTH = 4096;

export class TelegramAdapter implements IPlatformAdapter {
  private bot: Telegraf;
  private streamingMode: 'stream' | 'batch';

  constructor(token: string, mode: 'stream' | 'batch' = 'stream') {
    // Disable handler timeout to support long-running AI operations
    // Default is 90 seconds which is too short for complex coding tasks
    this.bot = new Telegraf(token, {
      handlerTimeout: Infinity
    });
    this.streamingMode = mode;
    console.log(`[Telegram] Adapter initialized (mode: ${mode}, timeout: disabled)`);
  }

  /**
   * Send a message to a Telegram chat
   * Automatically splits messages longer than 4096 characters
   */
  async sendMessage(chatId: string, message: string): Promise<void> {
    const id = parseInt(chatId);

    if (message.length <= MAX_LENGTH) {
      await this.bot.telegram.sendMessage(id, message);
    } else {
      // Split long messages by lines to preserve formatting
      const lines = message.split('\n');
      let chunk = '';

      for (const line of lines) {
        // Reserve 100 chars for safety margin
        if (chunk.length + line.length + 1 > MAX_LENGTH - 100) {
          if (chunk) {
            await this.bot.telegram.sendMessage(id, chunk);
          }
          chunk = line;
        } else {
          chunk += (chunk ? '\n' : '') + line;
        }
      }

      // Send remaining chunk
      if (chunk) {
        await this.bot.telegram.sendMessage(id, chunk);
      }
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
   * Extract conversation ID from Telegram context
   */
  getConversationId(ctx: Context): string {
    if (!ctx.chat) {
      throw new Error('No chat in context');
    }
    return ctx.chat.id.toString();
  }

  /**
   * Start the bot (begins polling)
   */
  async start(): Promise<void> {
    await this.bot.launch();
    console.log('[Telegram] Bot started (polling mode)');
  }

  /**
   * Stop the bot gracefully
   */
  stop(): void {
    this.bot.stop();
    console.log('[Telegram] Bot stopped');
  }
}
