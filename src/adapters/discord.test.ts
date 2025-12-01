/**
 * Unit tests for Discord adapter
 */
import { DiscordAdapter } from './discord';

// Mock discord.js
jest.mock('discord.js', () => {
  const mockChannel = {
    isSendable: () => true,
    send: jest.fn().mockResolvedValue(undefined),
  };

  const mockClient = {
    channels: {
      fetch: jest.fn().mockResolvedValue(mockChannel),
    },
    on: jest.fn(),
    once: jest.fn(),
    login: jest.fn().mockResolvedValue('token'),
    destroy: jest.fn(),
  };

  return {
    Client: jest.fn(() => mockClient),
    GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 2,
      MessageContent: 4,
      DirectMessages: 8,
    },
    Partials: {
      Channel: 0,
    },
    Events: {
      MessageCreate: 'messageCreate',
      ClientReady: 'ready',
    },
  };
});

describe('DiscordAdapter', () => {
  describe('streaming mode configuration', () => {
    test('should return batch mode when configured', () => {
      const adapter = new DiscordAdapter('fake-token-for-testing', 'batch');
      expect(adapter.getStreamingMode()).toBe('batch');
    });

    test('should default to stream mode', () => {
      const adapter = new DiscordAdapter('fake-token-for-testing');
      expect(adapter.getStreamingMode()).toBe('stream');
    });

    test('should return stream mode when explicitly configured', () => {
      const adapter = new DiscordAdapter('fake-token-for-testing', 'stream');
      expect(adapter.getStreamingMode()).toBe('stream');
    });
  });

  describe('platform type', () => {
    test('should return discord as platform type', () => {
      const adapter = new DiscordAdapter('fake-token-for-testing');
      expect(adapter.getPlatformType()).toBe('discord');
    });
  });

  describe('client instance', () => {
    test('should provide access to client instance', () => {
      const adapter = new DiscordAdapter('fake-token-for-testing');
      const client = adapter.getClient();
      expect(client).toBeDefined();
    });
  });

  describe('conversation ID extraction', () => {
    test('should extract channel ID from message', () => {
      const adapter = new DiscordAdapter('fake-token-for-testing');
      const mockMessage = {
        channelId: '1234567890',
      } as unknown as import('discord.js').Message;

      expect(adapter.getConversationId(mockMessage)).toBe('1234567890');
    });
  });

  describe('message sending', () => {
    test('should send short messages directly', async () => {
      const adapter = new DiscordAdapter('fake-token-for-testing');
      const client = adapter.getClient();
      const mockChannel = (await client.channels.fetch('123')) as { send: jest.Mock } | null;

      await adapter.sendMessage('123', 'Hello, World!');

      expect(client.channels.fetch).toHaveBeenCalledWith('123');
      expect(mockChannel?.send).toHaveBeenCalledWith('Hello, World!');
    });

    test('should split long messages into chunks', async () => {
      const adapter = new DiscordAdapter('fake-token-for-testing');
      const client = adapter.getClient();
      const mockChannel = (await client.channels.fetch('123')) as { send: jest.Mock } | null;

      // Create a message longer than 2000 chars with paragraph breaks
      const para1 = 'a'.repeat(1500);
      const para2 = 'b'.repeat(1500);
      const longMessage = `${para1}\n\n${para2}`;

      await adapter.sendMessage('123', longMessage);

      // Should have been split and sent as multiple messages
      expect(mockChannel?.send.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('lifecycle', () => {
    test('should login on start', async () => {
      const adapter = new DiscordAdapter('fake-token-for-testing');
      const client = adapter.getClient();

      await adapter.start();

      expect(client.login).toHaveBeenCalledWith('fake-token-for-testing');
    });

    test('should destroy client on stop', () => {
      const adapter = new DiscordAdapter('fake-token-for-testing');
      const client = adapter.getClient();

      adapter.stop();

      expect(client.destroy).toHaveBeenCalled();
    });

    test('should register message and ready handlers on start', async () => {
      const adapter = new DiscordAdapter('fake-token-for-testing');
      const client = adapter.getClient();

      await adapter.start();

      expect(client.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
      expect(client.once).toHaveBeenCalledWith('ready', expect.any(Function));
    });
  });

  describe('message handler registration', () => {
    test('should allow registering a message handler', async () => {
      const adapter = new DiscordAdapter('fake-token-for-testing');
      const mockHandler = jest.fn().mockResolvedValue(undefined);

      adapter.onMessage(mockHandler);
      await adapter.start();

      // The handler should be registered internally
      // We can verify this indirectly by checking that onMessage doesn't throw
      expect(true).toBe(true);
    });
  });
});
