/**
 * Discord platform adapter using discord.js v14
 * Handles message sending with 2000 character limit splitting
 */
import { Client, GatewayIntentBits, Partials, Message, Events } from 'discord.js';
import { IPlatformAdapter } from '../types';

const MAX_LENGTH = 2000;

export class DiscordAdapter implements IPlatformAdapter {
  private client: Client;
  private streamingMode: 'stream' | 'batch';
  private token: string;
  private messageHandler: ((message: Message) => Promise<void>) | null = null;

  constructor(token: string, mode: 'stream' | 'batch' = 'stream') {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel], // Required for DM support
    });
    this.streamingMode = mode;
    this.token = token;
    console.log(`[Discord] Adapter initialized (mode: ${mode})`);
  }

  /**
   * Send a message to a Discord channel
   * Automatically splits messages longer than 2000 characters
   */
  async sendMessage(channelId: string, message: string): Promise<void> {
    console.log(`[Discord] sendMessage called, length=${String(message.length)}`);

    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isSendable()) {
      console.error('[Discord] Invalid or non-sendable channel:', channelId);
      return;
    }

    if (message.length <= MAX_LENGTH) {
      await channel.send(message);
    } else {
      console.log(
        `[Discord] Message too long (${String(message.length)}), splitting by paragraphs`
      );
      const chunks = this.splitIntoParagraphChunks(message, MAX_LENGTH - 100);

      for (const chunk of chunks) {
        await channel.send(chunk);
      }
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

    // If any chunk is still too long, split by lines as fallback
    const finalChunks: string[] = [];
    for (const chunk of chunks) {
      if (chunk.length <= maxLength) {
        finalChunks.push(chunk);
      } else {
        // Fallback: split by lines
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

    console.log(`[Discord] Split into ${String(finalChunks.length)} chunks`);
    return finalChunks;
  }

  /**
   * Get the discord.js Client instance
   */
  getClient(): Client {
    return this.client;
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
    return 'discord';
  }

  /**
   * Extract conversation ID from Discord message
   * Uses channel ID as the conversation identifier
   */
  getConversationId(message: Message): string {
    return message.channelId;
  }

  /**
   * Register a message handler for incoming messages
   * Must be called before start()
   */
  onMessage(handler: (message: Message) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Start the bot (logs in and starts listening)
   */
  async start(): Promise<void> {
    // Register message handler before login
    this.client.on(Events.MessageCreate, (message: Message) => {
      // Ignore bot messages to prevent loops
      if (message.author.bot) return;

      if (this.messageHandler) {
        // Fire-and-forget - errors handled by caller
        void this.messageHandler(message);
      }
    });

    // Log when ready
    this.client.once(Events.ClientReady, readyClient => {
      console.log(`[Discord] Bot logged in as ${readyClient.user.tag}`);
    });

    // Login with stored token
    await this.client.login(this.token);
    console.log('[Discord] Bot started (WebSocket connection established)');
  }

  /**
   * Stop the bot gracefully
   */
  stop(): void {
    this.client.destroy();
    console.log('[Discord] Bot stopped');
  }
}
