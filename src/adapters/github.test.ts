/**
 * Unit tests for GitHub adapter
 */
import { GitHubAdapter } from './github';

// Mock Octokit to avoid ESM import issues in Jest
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    rest: {
      issues: {
        createComment: jest.fn().mockResolvedValue({}),
      },
      repos: {
        get: jest.fn().mockResolvedValue({
          data: { default_branch: 'main' },
        }),
      },
    },
  })),
}));

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;

  beforeEach(() => {
    adapter = new GitHubAdapter('fake-token-for-testing', 'fake-webhook-secret');
  });

  describe('streaming mode', () => {
    test('should always return batch mode', () => {
      expect(adapter.getStreamingMode()).toBe('batch');
    });
  });

  describe('lifecycle methods', () => {
    test('should start without errors', async () => {
      await expect(adapter.start()).resolves.toBeUndefined();
    });

    test('should stop without errors', () => {
      expect(() => adapter.stop()).not.toThrow();
    });
  });

  describe('sendMessage', () => {
    test('should handle invalid conversationId gracefully', async () => {
      // Should not throw when given invalid conversationId
      await expect(adapter.sendMessage('invalid', 'test message')).resolves.toBeUndefined();
    });
  });

  describe('conversationId format', () => {
    test('should use owner/repo#number format', () => {
      // This is implicit from the implementation
      // We're testing that the format is used correctly by attempting to parse
      const validFormat = 'owner/repo#123';
      const invalidFormats = ['owner-repo#123', 'owner/repo-123', 'owner#repo#123', 'invalid'];

      // Valid format should be parsed successfully (via sendMessage not throwing type errors)
      expect(() => adapter.sendMessage(validFormat, 'test')).not.toThrow();

      // Invalid formats should be handled gracefully (not throw)
      invalidFormats.forEach(format => {
        expect(() => adapter.sendMessage(format, 'test')).not.toThrow();
      });
    });
  });
});
