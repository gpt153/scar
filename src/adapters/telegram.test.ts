/**
 * Unit tests for Telegram adapter
 */
import { TelegramAdapter } from './telegram';
import * as telegramMarkdown from '../utils/telegram-markdown';

// Mock the telegram-markdown module
jest.mock('../utils/telegram-markdown', () => ({
  convertToTelegramMarkdown: jest.fn((text: string) => text),
  stripMarkdown: jest.fn((text: string) => text),
}));

describe('TelegramAdapter', () => {
  describe('streaming mode configuration', () => {
    test('should return batch mode when configured', () => {
      const adapter = new TelegramAdapter('fake-token-for-testing', 'batch');
      expect(adapter.getStreamingMode()).toBe('batch');
    });

    test('should default to stream mode', () => {
      const adapter = new TelegramAdapter('fake-token-for-testing');
      expect(adapter.getStreamingMode()).toBe('stream');
    });

    test('should return stream mode when explicitly configured', () => {
      const adapter = new TelegramAdapter('fake-token-for-testing', 'stream');
      expect(adapter.getStreamingMode()).toBe('stream');
    });
  });

  describe('bot instance', () => {
    test('should provide access to bot instance', () => {
      const adapter = new TelegramAdapter('fake-token-for-testing');
      const bot = adapter.getBot();
      expect(bot).toBeDefined();
      expect(bot.api).toBeDefined(); // Grammy uses 'api' instead of 'telegram'
    });
  });

  describe('message formatting', () => {
    let adapter: TelegramAdapter;
    let mockSendMessage: jest.Mock;
    const mockConvert = telegramMarkdown.convertToTelegramMarkdown as jest.Mock;

    beforeEach(() => {
      adapter = new TelegramAdapter('fake-token-for-testing');
      mockSendMessage = jest.fn().mockResolvedValue(undefined);
      // Override bot's sendMessage (Grammy uses 'api' instead of 'telegram')
      (adapter.getBot().api as unknown as { sendMessage: jest.Mock }).sendMessage =
        mockSendMessage;
      mockConvert.mockClear();
    });

    test('should convert markdown and send with MarkdownV2 parse_mode', async () => {
      mockConvert.mockReturnValue('*formatted*');
      await adapter.sendMessage('12345', '**test**');

      expect(mockConvert).toHaveBeenCalledWith('**test**');
      expect(mockSendMessage).toHaveBeenCalledWith(12345, '*formatted*', {
        parse_mode: 'MarkdownV2',
      });
    });

    test('should fallback to plain text when MarkdownV2 fails', async () => {
      mockConvert.mockReturnValue('*formatted*');
      mockSendMessage
        .mockRejectedValueOnce(new Error("Bad Request: can't parse entities"))
        .mockResolvedValueOnce(undefined);

      await adapter.sendMessage('12345', '**test**');

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      // First call with MarkdownV2
      expect(mockSendMessage).toHaveBeenNthCalledWith(1, 12345, '*formatted*', {
        parse_mode: 'MarkdownV2',
        message_thread_id: undefined,
      });
      // Second call plain text fallback (still includes message_thread_id in options)
      expect(mockSendMessage).toHaveBeenNthCalledWith(2, 12345, '**test**', {
        message_thread_id: undefined,
      });
    });

    test('should apply markdown formatting to each chunk for long messages', async () => {
      // Create a message that will be split (>4096 chars)
      // Use double newlines for paragraph splitting (code splits on \n\n)
      // Each paragraph must be <= MAX_LENGTH - 200 (3896) to trigger formatting
      const paragraph1 = 'a'.repeat(3000);
      const paragraph2 = 'b'.repeat(3000);
      const message = `${paragraph1}\n\n${paragraph2}`;
      mockConvert.mockImplementation((text: string) => `formatted:${text.length}`);

      await adapter.sendMessage('12345', message);

      // Should have converted each chunk separately
      expect(mockConvert).toHaveBeenCalledTimes(2);
      // Each chunk should be sent with MarkdownV2
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('formatted:'), {
        parse_mode: 'MarkdownV2',
      });
    });
  });
});
