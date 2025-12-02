/**
 * Discord platform adapter using discord.js v14
 * Handles message sending with 2000 character limit splitting
 */
import { Client, GatewayIntentBits, Partials, Message, Events } from 'discord.js';
import { IPlatformAdapter } from '../types';
import { parseAllowedUserIds, isDiscordUserAuthorized } from '../utils/discord-auth';

const MAX_LENGTH = 2000;

export class DiscordAdapter implements IPlatformAdapter {
  private client: Client;
  private streamingMode: 'stream' | 'batch';
  private token: string;
  private messageHandler: ((message: Message) => Promise<void>) | null = null;
  private allowedUserIds: string[];

  constructor(token: string, mode: 'stream' | 'batch' = 'stream') {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel], // Required for DM support (also covers threads as they're channel subtypes)
    });
    this.streamingMode = mode;
    this.token = token;

    // Parse Discord user whitelist (optional - empty = open access)
    this.allowedUserIds = parseAllowedUserIds(process.env.DISCORD_ALLOWED_USER_IDS);
    if (this.allowedUserIds.length > 0) {
      console.log(`[Discord] User whitelist enabled (${String(this.allowedUserIds.length)} users)`);
    } else {
      console.log('[Discord] User whitelist disabled (open access)');
    }

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
   * Check if the bot was mentioned in a message
   */
  isBotMentioned(message: Message): boolean {
    const botUser = this.client.user;
    if (!botUser) return false;
    return message.mentions.has(botUser);
  }

  /**
   * Check if a message is in a thread
   */
  isThread(message: Message): boolean {
    return message.channel.isThread();
  }

  /**
   * Get parent channel ID for a thread message
   * Returns null if not in a thread
   */
  getParentChannelId(message: Message): string | null {
    if (message.channel.isThread()) {
      return message.channel.parentId;
    }
    return null;
  }

  /**
   * Fetch message history from a thread (up to 100 messages)
   * Returns messages in chronological order (oldest first)
   */
  async fetchThreadHistory(message: Message): Promise<string[]> {
    if (!message.channel.isThread()) {
      return [];
    }

    try {
      // Fetch up to 100 messages (Discord API limit)
      const messages = await message.channel.messages.fetch({ limit: 100 });

      // Sort chronologically (oldest first) and format
      const sorted = [...messages.values()].reverse();

      return sorted.map(msg => {
        const author = msg.author.bot ? '[Bot]' : (msg.author.displayName || msg.author.username);
        return `${author}: ${msg.content}`;
      });
    } catch (error) {
      console.error('[Discord] Failed to fetch thread history:', error);
      return [];
    }
  }

  /**
   * Remove bot mention from message content
   */
  stripBotMention(message: Message): string {
    const botUser = this.client.user;
    if (!botUser) return message.content;

    // Remove <@BOT_ID> or <@!BOT_ID> (with nickname)
    const mentionRegex = new RegExp(`<@!?${botUser.id}>\\s*`, 'g');
    return message.content.replace(mentionRegex, '').trim();
  }

  /**
   * Extract conversation ID from Discord message
   * Uses channel ID as the conversation identifier
   * Note: For thread messages, channelId is the thread ID (not parent channel)
   * This means each thread automatically gets its own conversation
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

      // Authorization check - verify sender is in whitelist
      const userId = message.author.id;
      if (!isDiscordUserAuthorized(userId, this.allowedUserIds)) {
        // Log unauthorized attempt (mask user ID for privacy)
        const maskedId = userId ? `${userId.slice(0, 4)}***` : 'unknown';
        console.log(`[Discord] Unauthorized message from user ${maskedId}`);
        return; // Silent rejection
      }

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
    void this.client.destroy();
    console.log('[Discord] Bot stopped');
  }
}
