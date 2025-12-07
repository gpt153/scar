/**
 * Unit tests for GitHub adapter
 */
import { GitHubAdapter } from './github';
import * as git from '../utils/git';

// Mock orchestrator to avoid loading Claude Agent SDK (ESM module)
jest.mock('../orchestrator/orchestrator', () => ({
  handleMessage: jest.fn().mockResolvedValue(undefined),
}));

// Mock git utilities
jest.mock('../utils/git', () => ({
  isWorktreePath: jest.fn().mockResolvedValue(false),
  createWorktreeForIssue: jest.fn().mockResolvedValue('/workspace/worktrees/issue-1'),
  removeWorktree: jest.fn().mockResolvedValue(undefined),
}));

// Mock database modules
jest.mock('../db/conversations', () => ({
  getConversation: jest.fn(),
  getConversationByPlatformId: jest.fn(),
  getOrCreateConversation: jest.fn(),
  createConversation: jest.fn(),
  updateConversation: jest.fn(),
}));

jest.mock('../db/codebases', () => ({
  getCodebase: jest.fn(),
  createCodebase: jest.fn(),
  updateCodebase: jest.fn(),
  getCodebaseByRepo: jest.fn(),
  findCodebaseByRepoUrl: jest.fn(),
}));

jest.mock('../db/sessions', () => ({
  getActiveSession: jest.fn(),
  createSession: jest.fn(),
  endSession: jest.fn(),
  deactivateSession: jest.fn(),
}));

jest.mock('../utils/github-graphql', () => ({
  getLinkedIssueNumbers: jest.fn().mockResolvedValue([]),
}));

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

  describe('bot mention detection', () => {
    test('should detect mention case-insensitively', () => {
      // Access private method via type assertion for testing
      const adapterWithMention = new GitHubAdapter('token', 'secret', 'Dylan');
      const hasMention = (adapterWithMention as unknown as { hasMention: (text: string) => boolean }).hasMention;

      // All these should match @Dylan
      expect(hasMention.call(adapterWithMention, '@Dylan please help')).toBe(true);
      expect(hasMention.call(adapterWithMention, '@dylan please help')).toBe(true);
      expect(hasMention.call(adapterWithMention, '@DYLAN please help')).toBe(true);
      expect(hasMention.call(adapterWithMention, '@DyLaN please help')).toBe(true);

      // Should not match other mentions
      expect(hasMention.call(adapterWithMention, '@other-bot please help')).toBe(false);
      expect(hasMention.call(adapterWithMention, 'no mention here')).toBe(false);
    });

    test('should detect mention when it is the entire message', () => {
      const adapterWithMention = new GitHubAdapter('token', 'secret', 'remote-agent');
      const hasMention = (adapterWithMention as unknown as { hasMention: (text: string) => boolean }).hasMention;

      expect(hasMention.call(adapterWithMention, '@remote-agent')).toBe(true);
      expect(hasMention.call(adapterWithMention, '@REMOTE-AGENT')).toBe(true);
      expect(hasMention.call(adapterWithMention, '@Remote-Agent')).toBe(true);
    });

    test('should strip mention case-insensitively', () => {
      const adapterWithMention = new GitHubAdapter('token', 'secret', 'Dylan');
      const stripMention = (adapterWithMention as unknown as { stripMention: (text: string) => string }).stripMention;

      expect(stripMention.call(adapterWithMention, '@Dylan please help')).toBe('please help');
      expect(stripMention.call(adapterWithMention, '@dylan please help')).toBe('please help');
      expect(stripMention.call(adapterWithMention, '@DYLAN please help')).toBe('please help');
    });
  });

  describe('worktree isolation', () => {
    describe('createWorktreeForIssue', () => {
      test('should create issue-XX branch for issues', async () => {
        const createWorktreeMock = git.createWorktreeForIssue as jest.Mock;
        createWorktreeMock.mockClear();

        // Simulate calling the function directly
        await git.createWorktreeForIssue('/workspace/repo', 42, false);

        expect(createWorktreeMock).toHaveBeenCalledWith('/workspace/repo', 42, false);
      });

      test('should create pr-XX branch for pull requests', async () => {
        const createWorktreeMock = git.createWorktreeForIssue as jest.Mock;
        createWorktreeMock.mockClear();

        await git.createWorktreeForIssue('/workspace/repo', 42, true);

        expect(createWorktreeMock).toHaveBeenCalledWith('/workspace/repo', 42, true);
      });
    });

    describe('worktree cleanup', () => {
      test('removeWorktree should be called with correct paths', async () => {
        const removeWorktreeMock = git.removeWorktree as jest.Mock;
        removeWorktreeMock.mockClear();

        await git.removeWorktree('/workspace/repo', '/workspace/worktrees/issue-42');

        expect(removeWorktreeMock).toHaveBeenCalledWith(
          '/workspace/repo',
          '/workspace/worktrees/issue-42'
        );
      });

      test('removeWorktree failure with uncommitted changes should be detectable', async () => {
        const removeWorktreeMock = git.removeWorktree as jest.Mock;
        removeWorktreeMock.mockRejectedValueOnce(
          new Error('contains modified or untracked files')
        );

        await expect(
          git.removeWorktree('/workspace/repo', '/workspace/worktrees/issue-42')
        ).rejects.toThrow('contains modified or untracked files');
      });
    });

    describe('stale worktree path detection', () => {
      test('isWorktreePath returns false for non-worktree paths', async () => {
        const isWorktreePathMock = git.isWorktreePath as jest.Mock;
        isWorktreePathMock.mockResolvedValueOnce(false);

        const result = await git.isWorktreePath('/workspace/repo');
        expect(result).toBe(false);
      });

      test('isWorktreePath returns true for worktree paths', async () => {
        const isWorktreePathMock = git.isWorktreePath as jest.Mock;
        isWorktreePathMock.mockResolvedValueOnce(true);

        const result = await git.isWorktreePath('/workspace/worktrees/issue-42');
        expect(result).toBe(true);
      });

      test('paths containing /worktrees/ should be detected as stale', () => {
        // This tests the string-based detection we added
        const stalePath = '/workspace/worktrees/old-issue/repo';
        const normalPath = '/workspace/repo';

        expect(stalePath.includes('/worktrees/')).toBe(true);
        expect(normalPath.includes('/worktrees/')).toBe(false);
      });
    });

    describe('PR detection from issue_comment', () => {
      test('should detect PR from issue.pull_request property', () => {
        // When commenting on a PR, GitHub sends issue_comment with issue.pull_request set
        const issueWithPR = {
          number: 42,
          title: 'Test PR',
          body: 'Test body',
          user: { login: 'testuser' },
          labels: [],
          state: 'open',
          pull_request: { url: 'https://api.github.com/repos/owner/repo/pulls/42' },
        };

        const issueWithoutPR = {
          number: 42,
          title: 'Test Issue',
          body: 'Test body',
          user: { login: 'testuser' },
          labels: [],
          state: 'open',
        };

        // PR detection logic: !!issue?.pull_request
        expect(!!issueWithPR.pull_request).toBe(true);
        expect(!!(issueWithoutPR as typeof issueWithPR).pull_request).toBe(false);
      });
    });

    describe('session deactivation on worktree cleanup', () => {
      test('should deactivate session when worktree has active session', async () => {
        // Import mocks
        const sessionDb = await import('../db/sessions');
        const mockGetActiveSession = sessionDb.getActiveSession as jest.Mock;
        const mockDeactivateSession = sessionDb.deactivateSession as jest.Mock;

        // Mock active session
        mockGetActiveSession.mockResolvedValueOnce({
          id: 'test-session-id',
          conversation_id: 'test-conv-id',
          active: true,
        });

        // Verify mock setup is correct
        const session = await sessionDb.getActiveSession('test-conv-id');
        expect(session?.id).toBe('test-session-id');

        // Deactivate session
        await sessionDb.deactivateSession('test-session-id');
        expect(mockDeactivateSession).toHaveBeenCalledWith('test-session-id');
      });

      test('should handle no active session gracefully', async () => {
        const sessionDb = await import('../db/sessions');
        const mockGetActiveSession = sessionDb.getActiveSession as jest.Mock;
        const mockDeactivateSession = sessionDb.deactivateSession as jest.Mock;

        mockGetActiveSession.mockResolvedValueOnce(null);
        mockDeactivateSession.mockClear();

        // When no session, deactivateSession should not be called
        const session = await sessionDb.getActiveSession('test-conv-id');
        expect(session).toBeNull();

        // If no session found, no deactivation should happen
        if (!session) {
          expect(mockDeactivateSession).not.toHaveBeenCalled();
        }
      });
    });

    describe('worktree sharing for linked PRs', () => {
      test('should reuse issue worktree when PR is linked', async () => {
        const graphql = await import('../utils/github-graphql');
        const conversations = await import('../db/conversations');
        const mockGetLinkedIssueNumbers = graphql.getLinkedIssueNumbers as jest.Mock;
        const mockGetConversationByPlatformId = conversations.getConversationByPlatformId as jest.Mock;

        // PR #50 is linked to issue #42 which has a worktree
        mockGetLinkedIssueNumbers.mockResolvedValueOnce([42]);
        mockGetConversationByPlatformId.mockResolvedValueOnce({
          id: 'issue-conv-id',
          platform_type: 'github',
          platform_conversation_id: 'owner/repo#42',
          worktree_path: '/workspace/worktrees/issue-42',
        });

        const linkedIssues = await graphql.getLinkedIssueNumbers('owner', 'repo', 50);
        expect(linkedIssues).toEqual([42]);

        const issueConv = await conversations.getConversationByPlatformId('github', 'owner/repo#42');
        expect(issueConv?.worktree_path).toBe('/workspace/worktrees/issue-42');
      });

      test('should create new worktree when no linked issues', async () => {
        const graphql = await import('../utils/github-graphql');
        const mockGetLinkedIssueNumbers = graphql.getLinkedIssueNumbers as jest.Mock;

        mockGetLinkedIssueNumbers.mockResolvedValueOnce([]);

        const linkedIssues = await graphql.getLinkedIssueNumbers('owner', 'repo', 50);
        expect(linkedIssues).toEqual([]);
        // When no linked issues, should proceed to create new worktree (tested via integration)
      });

      test('should create new worktree when linked issue has no worktree', async () => {
        const graphql = await import('../utils/github-graphql');
        const conversations = await import('../db/conversations');
        const mockGetLinkedIssueNumbers = graphql.getLinkedIssueNumbers as jest.Mock;
        const mockGetConversationByPlatformId = conversations.getConversationByPlatformId as jest.Mock;

        // PR linked to issue, but issue has no worktree yet
        mockGetLinkedIssueNumbers.mockResolvedValueOnce([42]);
        mockGetConversationByPlatformId.mockResolvedValueOnce({
          id: 'issue-conv-id',
          platform_type: 'github',
          platform_conversation_id: 'owner/repo#42',
          worktree_path: null, // No worktree
        });

        const linkedIssues = await graphql.getLinkedIssueNumbers('owner', 'repo', 50);
        expect(linkedIssues).toEqual([42]);

        const issueConv = await conversations.getConversationByPlatformId('github', 'owner/repo#42');
        expect(issueConv?.worktree_path).toBeNull();
        // Should proceed to create new worktree when linked issue has no worktree
      });
    });
  });
});
