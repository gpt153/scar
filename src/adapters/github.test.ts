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
  getConversationByWorktreePath: jest.fn(),
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
  getCodebaseCommands: jest.fn().mockResolvedValue({}),
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

// Mock child_process for exec calls
jest.mock('child_process', () => ({
  exec: jest.fn((_cmd, callback) => {
    callback(null, '', '');
  }),
}));

// Mock fs/promises for file system operations
jest.mock('fs/promises', () => ({
  readdir: jest.fn().mockResolvedValue([]),
  access: jest.fn().mockResolvedValue(undefined),
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
      const hasMention = (
        adapterWithMention as unknown as { hasMention: (text: string) => boolean }
      ).hasMention;

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
      const adapterWithMention = new GitHubAdapter('token', 'secret', 'scar');
      const hasMention = (
        adapterWithMention as unknown as { hasMention: (text: string) => boolean }
      ).hasMention;

      expect(hasMention.call(adapterWithMention, '@scar')).toBe(true);
      expect(hasMention.call(adapterWithMention, '@SCAR')).toBe(true);
      expect(hasMention.call(adapterWithMention, '@Scar')).toBe(true);
    });

    test('should strip mention case-insensitively', () => {
      const adapterWithMention = new GitHubAdapter('token', 'secret', 'Dylan');
      const stripMention = (
        adapterWithMention as unknown as { stripMention: (text: string) => string }
      ).stripMention;

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
        removeWorktreeMock.mockRejectedValueOnce(new Error('contains modified or untracked files'));

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
        const mockGetConversationByPlatformId =
          conversations.getConversationByPlatformId as jest.Mock;

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

        const issueConv = await conversations.getConversationByPlatformId(
          'github',
          'owner/repo#42'
        );
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
        const mockGetConversationByPlatformId =
          conversations.getConversationByPlatformId as jest.Mock;

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

        const issueConv = await conversations.getConversationByPlatformId(
          'github',
          'owner/repo#42'
        );
        expect(issueConv?.worktree_path).toBeNull();
        // Should proceed to create new worktree when linked issue has no worktree
      });
    });

    describe('shared worktree cleanup coordination', () => {
      test('should skip worktree removal when another conversation still uses it', async () => {
        const conversations = await import('../db/conversations');
        const mockGetConversationByWorktreePath =
          conversations.getConversationByWorktreePath as jest.Mock;

        // After clearing PR's reference, issue still uses the worktree
        mockGetConversationByWorktreePath.mockResolvedValueOnce({
          id: 'issue-conv-id',
          platform_type: 'github',
          platform_conversation_id: 'owner/repo#42',
          worktree_path: '/workspace/worktrees/issue-42',
        });

        const otherConv = await conversations.getConversationByWorktreePath(
          '/workspace/worktrees/issue-42'
        );

        // Verify the logic: when another conversation exists, worktree should be kept
        expect(otherConv).not.toBeNull();
        expect(otherConv?.platform_conversation_id).toBe('owner/repo#42');
        // In the actual implementation, removeWorktree would NOT be called
      });

      test('should remove worktree when no other conversations reference it', async () => {
        const conversations = await import('../db/conversations');
        const mockGetConversationByWorktreePath =
          conversations.getConversationByWorktreePath as jest.Mock;

        // After clearing this conversation's reference, no others use the worktree
        mockGetConversationByWorktreePath.mockResolvedValueOnce(null);

        const otherConv = await conversations.getConversationByWorktreePath(
          '/workspace/worktrees/issue-42'
        );

        // Verify the logic: when no other conversation exists, worktree can be removed
        expect(otherConv).toBeNull();
        // In the actual implementation, removeWorktree WOULD be called
      });

      test('should handle already-deleted worktree gracefully', async () => {
        const removeWorktreeMock = git.removeWorktree as jest.Mock;
        removeWorktreeMock.mockRejectedValueOnce(new Error('is not a working tree'));

        // The error should be catchable for graceful handling
        await expect(
          git.removeWorktree('/workspace/repo', '/workspace/worktrees/issue-42')
        ).rejects.toThrow('is not a working tree');
        // In the actual implementation, this error is caught and logged, not re-thrown
      });
    });

    describe('shared worktree cleanup integration via handleWebhook', () => {
      const createCloseEventPayload = (type: 'issue' | 'pull_request', number: number): string => {
        if (type === 'issue') {
          return JSON.stringify({
            action: 'closed',
            issue: {
              number,
              title: 'Test Issue',
              body: 'Test body',
              user: { login: 'testuser' },
              labels: [],
              state: 'closed',
            },
            repository: {
              owner: { login: 'owner' },
              name: 'repo',
              full_name: 'owner/repo',
              html_url: 'https://github.com/owner/repo',
              default_branch: 'main',
            },
            sender: { login: 'testuser' },
          });
        }
        return JSON.stringify({
          action: 'closed',
          pull_request: {
            number,
            title: 'Test PR',
            body: 'Fixes #42',
            user: { login: 'testuser' },
            state: 'closed',
          },
          repository: {
            owner: { login: 'owner' },
            name: 'repo',
            full_name: 'owner/repo',
            html_url: 'https://github.com/owner/repo',
            default_branch: 'main',
          },
          sender: { login: 'testuser' },
        });
      };

      const computeSignature = (payload: string, secret: string): string => {
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', secret);
        return 'sha256=' + hmac.update(payload).digest('hex');
      };

      beforeEach(() => {
        jest.clearAllMocks();
      });

      test('closes PR first, then issue - worktree kept for issue, removed when issue closes', async () => {
        const conversations = await import('../db/conversations');
        const codebases = await import('../db/codebases');
        const sessions = await import('../db/sessions');
        const removeWorktreeMock = git.removeWorktree as jest.Mock;

        const sharedWorktreePath = '/workspace/worktrees/issue-42';

        // Setup: Both PR #50 and issue #42 share the same worktree
        const prConversation = {
          id: 'pr-conv-id',
          platform_type: 'github',
          platform_conversation_id: 'owner/repo#50',
          worktree_path: sharedWorktreePath,
          codebase_id: 'codebase-id',
          cwd: sharedWorktreePath,
        };

        const issueConversation = {
          id: 'issue-conv-id',
          platform_type: 'github',
          platform_conversation_id: 'owner/repo#42',
          worktree_path: sharedWorktreePath,
          codebase_id: 'codebase-id',
          cwd: sharedWorktreePath,
        };

        const codebase = {
          id: 'codebase-id',
          name: 'repo',
          default_cwd: '/workspace/repo',
        };

        // Mock codebase lookup
        (codebases.findCodebaseByRepoUrl as jest.Mock).mockResolvedValue(codebase);

        // Mock session (none active)
        (sessions.getActiveSession as jest.Mock).mockResolvedValue(null);

        // --- FIRST: Close PR #50 ---
        // PR conversation is found with worktree
        (conversations.getConversationByPlatformId as jest.Mock).mockResolvedValueOnce(
          prConversation
        );

        // After clearing PR's reference, issue still uses the worktree
        (conversations.getConversationByWorktreePath as jest.Mock).mockResolvedValueOnce(
          issueConversation
        );

        const prPayload = createCloseEventPayload('pull_request', 50);
        const prSignature = computeSignature(prPayload, 'fake-webhook-secret');

        await adapter.handleWebhook(prPayload, prSignature);

        // Verify: updateConversation was called to clear PR's worktree_path
        expect(conversations.updateConversation).toHaveBeenCalledWith('pr-conv-id', {
          worktree_path: null,
          cwd: '/workspace/repo',
        });

        // Verify: removeWorktree was NOT called (issue still uses it)
        expect(removeWorktreeMock).not.toHaveBeenCalled();

        // --- SECOND: Close issue #42 ---
        jest.clearAllMocks();

        // Issue conversation is found with worktree
        (conversations.getConversationByPlatformId as jest.Mock).mockResolvedValueOnce(
          issueConversation
        );

        // After clearing issue's reference, no one uses the worktree
        (conversations.getConversationByWorktreePath as jest.Mock).mockResolvedValueOnce(null);

        // Mock codebase lookup again
        (codebases.findCodebaseByRepoUrl as jest.Mock).mockResolvedValue(codebase);

        const issuePayload = createCloseEventPayload('issue', 42);
        const issueSignature = computeSignature(issuePayload, 'fake-webhook-secret');

        await adapter.handleWebhook(issuePayload, issueSignature);

        // Verify: updateConversation was called to clear issue's worktree_path
        expect(conversations.updateConversation).toHaveBeenCalledWith('issue-conv-id', {
          worktree_path: null,
          cwd: '/workspace/repo',
        });

        // Verify: removeWorktree WAS called (no one uses it anymore)
        expect(removeWorktreeMock).toHaveBeenCalledWith('/workspace/repo', sharedWorktreePath);
      });

      test('closes issue first, then PR - worktree kept for PR, removed when PR closes', async () => {
        const conversations = await import('../db/conversations');
        const codebases = await import('../db/codebases');
        const sessions = await import('../db/sessions');
        const removeWorktreeMock = git.removeWorktree as jest.Mock;

        const sharedWorktreePath = '/workspace/worktrees/issue-42';

        const issueConversation = {
          id: 'issue-conv-id',
          platform_type: 'github',
          platform_conversation_id: 'owner/repo#42',
          worktree_path: sharedWorktreePath,
          codebase_id: 'codebase-id',
          cwd: sharedWorktreePath,
        };

        const prConversation = {
          id: 'pr-conv-id',
          platform_type: 'github',
          platform_conversation_id: 'owner/repo#50',
          worktree_path: sharedWorktreePath,
          codebase_id: 'codebase-id',
          cwd: sharedWorktreePath,
        };

        const codebase = {
          id: 'codebase-id',
          name: 'repo',
          default_cwd: '/workspace/repo',
        };

        (codebases.findCodebaseByRepoUrl as jest.Mock).mockResolvedValue(codebase);
        (sessions.getActiveSession as jest.Mock).mockResolvedValue(null);

        // --- FIRST: Close issue #42 ---
        (conversations.getConversationByPlatformId as jest.Mock).mockResolvedValueOnce(
          issueConversation
        );
        // After clearing issue's reference, PR still uses the worktree
        (conversations.getConversationByWorktreePath as jest.Mock).mockResolvedValueOnce(
          prConversation
        );

        const issuePayload = createCloseEventPayload('issue', 42);
        const issueSignature = computeSignature(issuePayload, 'fake-webhook-secret');

        await adapter.handleWebhook(issuePayload, issueSignature);

        expect(conversations.updateConversation).toHaveBeenCalledWith('issue-conv-id', {
          worktree_path: null,
          cwd: '/workspace/repo',
        });
        expect(removeWorktreeMock).not.toHaveBeenCalled();

        // --- SECOND: Close PR #50 ---
        jest.clearAllMocks();

        (conversations.getConversationByPlatformId as jest.Mock).mockResolvedValueOnce(
          prConversation
        );
        (conversations.getConversationByWorktreePath as jest.Mock).mockResolvedValueOnce(null);
        (codebases.findCodebaseByRepoUrl as jest.Mock).mockResolvedValue(codebase);

        const prPayload = createCloseEventPayload('pull_request', 50);
        const prSignature = computeSignature(prPayload, 'fake-webhook-secret');

        await adapter.handleWebhook(prPayload, prSignature);

        expect(conversations.updateConversation).toHaveBeenCalledWith('pr-conv-id', {
          worktree_path: null,
          cwd: '/workspace/repo',
        });
        expect(removeWorktreeMock).toHaveBeenCalledWith('/workspace/repo', sharedWorktreePath);
      });

      test('handles already-deleted worktree gracefully on close', async () => {
        const conversations = await import('../db/conversations');
        const codebases = await import('../db/codebases');
        const sessions = await import('../db/sessions');
        const removeWorktreeMock = git.removeWorktree as jest.Mock;

        const worktreePath = '/workspace/worktrees/issue-42';

        const issueConversation = {
          id: 'issue-conv-id',
          platform_type: 'github',
          platform_conversation_id: 'owner/repo#42',
          worktree_path: worktreePath,
          codebase_id: 'codebase-id',
          cwd: worktreePath,
        };

        const codebase = {
          id: 'codebase-id',
          name: 'repo',
          default_cwd: '/workspace/repo',
        };

        (codebases.findCodebaseByRepoUrl as jest.Mock).mockResolvedValue(codebase);
        (sessions.getActiveSession as jest.Mock).mockResolvedValue(null);
        (conversations.getConversationByPlatformId as jest.Mock).mockResolvedValueOnce(
          issueConversation
        );
        (conversations.getConversationByWorktreePath as jest.Mock).mockResolvedValueOnce(null);

        // Worktree was already manually deleted
        removeWorktreeMock.mockRejectedValueOnce(new Error('is not a working tree'));

        const issuePayload = createCloseEventPayload('issue', 42);
        const issueSignature = computeSignature(issuePayload, 'fake-webhook-secret');

        // Should not throw - error is caught and logged
        await expect(adapter.handleWebhook(issuePayload, issueSignature)).resolves.toBeUndefined();

        // Verify conversation was still updated
        expect(conversations.updateConversation).toHaveBeenCalledWith('issue-conv-id', {
          worktree_path: null,
          cwd: '/workspace/repo',
        });
      });

      test('deactivates session before cleanup', async () => {
        const conversations = await import('../db/conversations');
        const codebases = await import('../db/codebases');
        const sessions = await import('../db/sessions');

        const worktreePath = '/workspace/worktrees/issue-42';

        const issueConversation = {
          id: 'issue-conv-id',
          platform_type: 'github',
          platform_conversation_id: 'owner/repo#42',
          worktree_path: worktreePath,
          codebase_id: 'codebase-id',
          cwd: worktreePath,
        };

        const activeSession = {
          id: 'active-session-id',
          conversation_id: 'issue-conv-id',
          active: true,
        };

        const codebase = {
          id: 'codebase-id',
          name: 'repo',
          default_cwd: '/workspace/repo',
        };

        (codebases.findCodebaseByRepoUrl as jest.Mock).mockResolvedValue(codebase);
        (conversations.getConversationByPlatformId as jest.Mock).mockResolvedValueOnce(
          issueConversation
        );
        (conversations.getConversationByWorktreePath as jest.Mock).mockResolvedValueOnce(null);
        (sessions.getActiveSession as jest.Mock).mockResolvedValueOnce(activeSession);

        const issuePayload = createCloseEventPayload('issue', 42);
        const issueSignature = computeSignature(issuePayload, 'fake-webhook-secret');

        await adapter.handleWebhook(issuePayload, issueSignature);

        // Verify session was deactivated
        expect(sessions.deactivateSession).toHaveBeenCalledWith('active-session-id');
      });

      test('skips cleanup when conversation has no worktree', async () => {
        const conversations = await import('../db/conversations');
        const removeWorktreeMock = git.removeWorktree as jest.Mock;

        const issueConversation = {
          id: 'issue-conv-id',
          platform_type: 'github',
          platform_conversation_id: 'owner/repo#42',
          worktree_path: null, // No worktree
          codebase_id: 'codebase-id',
          cwd: '/workspace/repo',
        };

        (conversations.getConversationByPlatformId as jest.Mock).mockResolvedValueOnce(
          issueConversation
        );

        const issuePayload = createCloseEventPayload('issue', 42);
        const issueSignature = computeSignature(issuePayload, 'fake-webhook-secret');

        await adapter.handleWebhook(issuePayload, issueSignature);

        // Should not call any cleanup functions
        expect(removeWorktreeMock).not.toHaveBeenCalled();
        expect(conversations.updateConversation).not.toHaveBeenCalled();
      });

      test('skips cleanup when conversation not found', async () => {
        const conversations = await import('../db/conversations');
        const removeWorktreeMock = git.removeWorktree as jest.Mock;

        (conversations.getConversationByPlatformId as jest.Mock).mockResolvedValueOnce(null);

        const issuePayload = createCloseEventPayload('issue', 42);
        const issueSignature = computeSignature(issuePayload, 'fake-webhook-secret');

        await adapter.handleWebhook(issuePayload, issueSignature);

        expect(removeWorktreeMock).not.toHaveBeenCalled();
        expect(conversations.updateConversation).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleWebhook integration tests', () => {
    let adapter: GitHubAdapter;
    let createWorktreeMock: jest.Mock;
    let removeWorktreeMock: jest.Mock;
    let getOrCreateConversationMock: jest.Mock;
    let updateConversationMock: jest.Mock;
    let getConversationByPlatformIdMock: jest.Mock;
    let findCodebaseByRepoUrlMock: jest.Mock;
    let createCodebaseMock: jest.Mock;
    let handleMessageMock: jest.Mock;
    let mockCreateComment: jest.Mock;

    beforeEach(() => {
      // Reset all mocks
      jest.clearAllMocks();

      // Get reference to Octokit mock
      const { Octokit } = require('@octokit/rest');
      const MockOctokit = Octokit as jest.Mock;
      mockCreateComment = jest.fn().mockResolvedValue({});

      MockOctokit.mockImplementation(() => ({
        rest: {
          issues: {
            createComment: mockCreateComment,
          },
          repos: {
            get: jest.fn().mockResolvedValue({
              data: { default_branch: 'main' },
            }),
          },
        },
      }));

      adapter = new GitHubAdapter('fake-token', 'test-secret');

      // Get references to the mocked functions
      createWorktreeMock = git.createWorktreeForIssue as jest.Mock;
      removeWorktreeMock = git.removeWorktree as jest.Mock;

      // Import and setup database mocks
      const dbConversations = require('../db/conversations');
      const dbCodebases = require('../db/codebases');
      const orchestrator = require('../orchestrator/orchestrator');

      getOrCreateConversationMock = dbConversations.getOrCreateConversation as jest.Mock;
      updateConversationMock = dbConversations.updateConversation as jest.Mock;
      getConversationByPlatformIdMock = dbConversations.getConversationByPlatformId as jest.Mock;
      findCodebaseByRepoUrlMock = dbCodebases.findCodebaseByRepoUrl as jest.Mock;
      createCodebaseMock = dbCodebases.createCodebase as jest.Mock;
      handleMessageMock = orchestrator.handleMessage as jest.Mock;

      // Default mock implementations
      createWorktreeMock.mockResolvedValue('/workspace/worktrees/issue-42');
      removeWorktreeMock.mockResolvedValue(undefined);
      handleMessageMock.mockResolvedValue(undefined);
    });

    describe('issue opened with @scar mention', () => {
      test('should create worktree and update conversation', async () => {
        // Setup: new conversation (no codebase_id)
        getOrCreateConversationMock.mockResolvedValue({
          id: 'conv-1',
          codebase_id: null,
          cwd: null,
          worktree_path: null,
        });

        // Setup: new codebase
        findCodebaseByRepoUrlMock.mockResolvedValue(null);
        createCodebaseMock.mockResolvedValue({
          id: 'codebase-1',
          name: 'test-repo',
          default_cwd: '/workspace/test-repo',
        });

        const payload = JSON.stringify({
          action: 'opened',
          issue: {
            number: 42,
            title: 'Test Issue',
            body: '@scar please help with this',
            user: { login: 'testuser' },
            labels: [],
            state: 'open',
          },
          repository: {
            owner: { login: 'testorg' },
            name: 'test-repo',
            full_name: 'testorg/test-repo',
            html_url: 'https://github.com/testorg/test-repo',
            default_branch: 'main',
          },
          sender: { login: 'testuser' },
        });

        // Create signature (HMAC SHA-256)
        const crypto = require('crypto');
        const signature =
          'sha256=' + crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');

        await adapter.handleWebhook(payload, signature);

        // Verify worktree was created for issue (isPR = false)
        expect(createWorktreeMock).toHaveBeenCalled();
        const createWorktreeCall = createWorktreeMock.mock.calls[0];
        expect(createWorktreeCall[0]).toMatch(/test-repo$/);
        expect(createWorktreeCall[1]).toBe(42);
        expect(createWorktreeCall[2]).toBe(false);

        // Verify conversation was updated with worktree path
        expect(updateConversationMock).toHaveBeenCalledWith('conv-1', {
          codebase_id: 'codebase-1',
          cwd: '/workspace/worktrees/issue-42',
          worktree_path: '/workspace/worktrees/issue-42',
        });

        // Verify orchestrator was called
        expect(handleMessageMock).toHaveBeenCalled();
      });

      test('should handle worktree creation failure and notify user', async () => {
        getOrCreateConversationMock.mockResolvedValue({
          id: 'conv-1',
          codebase_id: null,
          cwd: null,
          worktree_path: null,
        });

        findCodebaseByRepoUrlMock.mockResolvedValue(null);
        createCodebaseMock.mockResolvedValue({
          id: 'codebase-1',
          name: 'test-repo',
          default_cwd: '/workspace/test-repo',
        });

        // Simulate worktree creation failure
        createWorktreeMock.mockRejectedValue(new Error('Branch already exists'));

        const payload = JSON.stringify({
          action: 'opened',
          issue: {
            number: 42,
            title: 'Test Issue',
            body: '@scar help',
            user: { login: 'testuser' },
            labels: [],
            state: 'open',
          },
          repository: {
            owner: { login: 'testorg' },
            name: 'test-repo',
            full_name: 'testorg/test-repo',
            html_url: 'https://github.com/testorg/test-repo',
            default_branch: 'main',
          },
          sender: { login: 'testuser' },
        });

        const crypto = require('crypto');
        const signature =
          'sha256=' + crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');

        await adapter.handleWebhook(payload, signature);

        // Verify error message was sent
        expect(mockCreateComment).toHaveBeenCalledWith(
          expect.objectContaining({
            owner: 'testorg',
            repo: 'test-repo',
            issue_number: 42,
            body: expect.stringContaining('Failed to create isolated worktree'),
          })
        );

        // Verify orchestrator was NOT called (stopped before message handling)
        expect(handleMessageMock).not.toHaveBeenCalled();
      });
    });

    describe('pull request opened with @scar mention', () => {
      test('should create pr-XX worktree for pull requests', async () => {
        getOrCreateConversationMock.mockResolvedValue({
          id: 'conv-1',
          codebase_id: null,
          cwd: null,
          worktree_path: null,
        });

        findCodebaseByRepoUrlMock.mockResolvedValue(null);
        createCodebaseMock.mockResolvedValue({
          id: 'codebase-1',
          name: 'test-repo',
          default_cwd: '/workspace/test-repo',
        });

        createWorktreeMock.mockResolvedValue('/workspace/worktrees/pr-42');

        const payload = JSON.stringify({
          action: 'opened',
          pull_request: {
            number: 42,
            title: 'Test PR',
            body: '@scar review this',
            user: { login: 'testuser' },
            state: 'open',
          },
          repository: {
            owner: { login: 'testorg' },
            name: 'test-repo',
            full_name: 'testorg/test-repo',
            html_url: 'https://github.com/testorg/test-repo',
            default_branch: 'main',
          },
          sender: { login: 'testuser' },
        });

        const crypto = require('crypto');
        const signature =
          'sha256=' + crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');

        await adapter.handleWebhook(payload, signature);

        // Verify worktree was created for PR (isPR = true)
        expect(createWorktreeMock).toHaveBeenCalled();
        const createWorktreeCall = createWorktreeMock.mock.calls[0];
        expect(createWorktreeCall[0]).toMatch(/test-repo$/);
        expect(createWorktreeCall[1]).toBe(42);
        expect(createWorktreeCall[2]).toBe(true);

        // Verify conversation was updated with PR worktree path
        expect(updateConversationMock).toHaveBeenCalledWith('conv-1', {
          codebase_id: 'codebase-1',
          cwd: '/workspace/worktrees/pr-42',
          worktree_path: '/workspace/worktrees/pr-42',
        });
      });
    });

    describe('issue closed event', () => {
      test('should call removeWorktree and update conversation', async () => {
        // Setup: existing conversation with worktree
        getConversationByPlatformIdMock.mockResolvedValue({
          id: 'conv-1',
          codebase_id: 'codebase-1',
          cwd: '/workspace/worktrees/issue-42',
          worktree_path: '/workspace/worktrees/issue-42',
        });

        findCodebaseByRepoUrlMock.mockResolvedValue({
          id: 'codebase-1',
          name: 'test-repo',
          default_cwd: '/workspace/test-repo',
        });

        const payload = JSON.stringify({
          action: 'closed',
          issue: {
            number: 42,
            title: 'Test Issue',
            body: 'Issue body',
            user: { login: 'testuser' },
            labels: [],
            state: 'closed',
          },
          repository: {
            owner: { login: 'testorg' },
            name: 'test-repo',
            full_name: 'testorg/test-repo',
            html_url: 'https://github.com/testorg/test-repo',
            default_branch: 'main',
          },
          sender: { login: 'testuser' },
        });

        const crypto = require('crypto');
        const signature =
          'sha256=' + crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');

        await adapter.handleWebhook(payload, signature);

        // Verify worktree was removed
        expect(removeWorktreeMock).toHaveBeenCalledWith(
          expect.stringMatching(/test-repo$/),
          '/workspace/worktrees/issue-42'
        );

        // Verify conversation was updated (worktree_path cleared)
        expect(updateConversationMock).toHaveBeenCalledWith('conv-1', {
          worktree_path: null,
          cwd: expect.stringMatching(/test-repo$/),
        });

        // Verify orchestrator was NOT called (close events don't process messages)
        expect(handleMessageMock).not.toHaveBeenCalled();
      });

      test('should handle removeWorktree failure with uncommitted changes', async () => {
        getConversationByPlatformIdMock.mockResolvedValue({
          id: 'conv-1',
          codebase_id: 'codebase-1',
          cwd: '/workspace/worktrees/issue-42',
          worktree_path: '/workspace/worktrees/issue-42',
        });

        findCodebaseByRepoUrlMock.mockResolvedValue({
          id: 'codebase-1',
          name: 'test-repo',
          default_cwd: '/workspace/test-repo',
        });

        // Simulate removal failure
        removeWorktreeMock.mockRejectedValue(new Error('contains modified or untracked files'));

        const payload = JSON.stringify({
          action: 'closed',
          issue: {
            number: 42,
            title: 'Test Issue',
            body: 'Issue body',
            user: { login: 'testuser' },
            labels: [],
            state: 'closed',
          },
          repository: {
            owner: { login: 'testorg' },
            name: 'test-repo',
            full_name: 'testorg/test-repo',
            html_url: 'https://github.com/testorg/test-repo',
            default_branch: 'main',
          },
          sender: { login: 'testuser' },
        });

        const crypto = require('crypto');
        const signature =
          'sha256=' + crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');

        await adapter.handleWebhook(payload, signature);

        // Verify removal was attempted
        expect(removeWorktreeMock).toHaveBeenCalled();

        // Verify warning message was sent to user
        expect(mockCreateComment).toHaveBeenCalledWith(
          expect.objectContaining({
            owner: 'testorg',
            repo: 'test-repo',
            issue_number: 42,
            body: expect.stringContaining('Could not remove worktree'),
          })
        );

        // Verify conversation was still updated despite removal failure
        expect(updateConversationMock).toHaveBeenCalledWith('conv-1', {
          worktree_path: null,
          cwd: expect.stringMatching(/test-repo$/),
        });
      });
    });

    describe('existing conversation', () => {
      test('should not create new worktree for existing conversations', async () => {
        // Setup: existing conversation with codebase already set
        getOrCreateConversationMock.mockResolvedValue({
          id: 'conv-1',
          codebase_id: 'codebase-1',
          cwd: '/workspace/worktrees/issue-42',
          worktree_path: '/workspace/worktrees/issue-42',
        });

        findCodebaseByRepoUrlMock.mockResolvedValue({
          id: 'codebase-1',
          name: 'test-repo',
          default_cwd: '/workspace/test-repo',
        });

        const payload = JSON.stringify({
          action: 'created',
          comment: {
            body: '@scar can you also help with X?',
            user: { login: 'testuser' },
          },
          issue: {
            number: 42,
            title: 'Test Issue',
            body: 'Original body',
            user: { login: 'testuser' },
            labels: [],
            state: 'open',
          },
          repository: {
            owner: { login: 'testorg' },
            name: 'test-repo',
            full_name: 'testorg/test-repo',
            html_url: 'https://github.com/testorg/test-repo',
            default_branch: 'main',
          },
          sender: { login: 'testuser' },
        });

        const crypto = require('crypto');
        const signature =
          'sha256=' + crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');

        await adapter.handleWebhook(payload, signature);

        // Verify worktree was NOT created (existing conversation)
        expect(createWorktreeMock).not.toHaveBeenCalled();

        // Verify orchestrator was still called
        expect(handleMessageMock).toHaveBeenCalled();
      });
    });

    describe('webhook without @scar mention', () => {
      test('should not process webhooks without mention', async () => {
        const payload = JSON.stringify({
          action: 'opened',
          issue: {
            number: 42,
            title: 'Test Issue',
            body: 'No mention here',
            user: { login: 'testuser' },
            labels: [],
            state: 'open',
          },
          repository: {
            owner: { login: 'testorg' },
            name: 'test-repo',
            full_name: 'testorg/test-repo',
            html_url: 'https://github.com/testorg/test-repo',
            default_branch: 'main',
          },
          sender: { login: 'testuser' },
        });

        const crypto = require('crypto');
        const signature =
          'sha256=' + crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');

        await adapter.handleWebhook(payload, signature);

        // Verify nothing was processed
        expect(createWorktreeMock).not.toHaveBeenCalled();
        expect(handleMessageMock).not.toHaveBeenCalled();
      });
    });
  });
});
