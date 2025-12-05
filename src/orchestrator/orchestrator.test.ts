import { MockPlatformAdapter } from '../test/mocks/platform';
import { Conversation, Codebase, Session } from '../types';
import { join } from 'path';

// Setup mocks before importing the module under test
const mockGetOrCreateConversation = jest.fn();
const mockUpdateConversation = jest.fn();
const mockGetCodebase = jest.fn();
const mockGetActiveSession = jest.fn();
const mockCreateSession = jest.fn();
const mockUpdateSession = jest.fn();
const mockDeactivateSession = jest.fn();
const mockUpdateSessionMetadata = jest.fn();
const mockGetTemplate = jest.fn();
const mockHandleCommand = jest.fn();
const mockParseCommand = jest.fn();
const mockGetAssistantClient = jest.fn();
const mockReadFile = jest.fn();
const mockAccess = jest.fn();

jest.mock('../db/conversations', () => ({
  getOrCreateConversation: mockGetOrCreateConversation,
  updateConversation: mockUpdateConversation,
}));

jest.mock('../db/codebases', () => ({
  getCodebase: mockGetCodebase,
}));

jest.mock('../db/sessions', () => ({
  getActiveSession: mockGetActiveSession,
  createSession: mockCreateSession,
  updateSession: mockUpdateSession,
  deactivateSession: mockDeactivateSession,
  updateSessionMetadata: mockUpdateSessionMetadata,
}));

jest.mock('../db/command-templates', () => ({
  getTemplate: mockGetTemplate,
}));

jest.mock('../handlers/command-handler', () => ({
  handleCommand: mockHandleCommand,
  parseCommand: mockParseCommand,
}));

jest.mock('../clients/factory', () => ({
  getAssistantClient: mockGetAssistantClient,
}));

jest.mock('fs/promises', () => ({
  readFile: mockReadFile,
  access: mockAccess,
}));

import { handleMessage } from './orchestrator';

/**
 * Helper to wrap command content with execution context (matches wrapCommandForExecution in orchestrator.ts)
 */
function wrapCommandForExecution(commandName: string, content: string): string {
  return `The user invoked the \`/${commandName}\` command. Execute the following instructions immediately without asking for confirmation:

---

${content}

---

Remember: The user already decided to run this command. Take action now.`;
}

describe('orchestrator', () => {
  let platform: MockPlatformAdapter;

  const mockConversation: Conversation = {
    id: 'conv-123',
    platform_type: 'telegram',
    platform_conversation_id: 'chat-456',
    ai_assistant_type: 'claude',
    codebase_id: 'codebase-789',
    cwd: '/workspace/project',
    worktree_path: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockCodebase: Codebase = {
    id: 'codebase-789',
    name: 'test-project',
    repository_url: 'https://github.com/user/repo',
    default_cwd: '/workspace/test-project',
    ai_assistant_type: 'claude',
    commands: {
      plan: { path: '.claude/commands/plan.md', description: 'Plan feature' },
      execute: { path: '.claude/commands/execute.md', description: 'Execute plan' },
    },
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockSession: Session = {
    id: 'session-abc',
    conversation_id: 'conv-123',
    codebase_id: 'codebase-789',
    ai_assistant_type: 'claude',
    assistant_session_id: 'claude-session-xyz',
    active: true,
    metadata: {},
    started_at: new Date(),
    ended_at: null,
  };

  const mockClient = {
    sendQuery: jest.fn(),
    getType: jest.fn().mockReturnValue('claude'),
  };

  beforeEach(() => {
    platform = new MockPlatformAdapter();
    jest.clearAllMocks();

    // Default mocks
    mockGetOrCreateConversation.mockResolvedValue(mockConversation);
    mockGetCodebase.mockResolvedValue(mockCodebase);
    mockGetActiveSession.mockResolvedValue(null);
    mockCreateSession.mockResolvedValue(mockSession);
    mockGetTemplate.mockResolvedValue(null); // No templates by default
    mockGetAssistantClient.mockReturnValue(mockClient);
    mockAccess.mockResolvedValue(undefined); // Path exists by default
    mockParseCommand.mockImplementation((message: string) => {
      const parts = message.split(/\s+/);
      return { command: parts[0].substring(1), args: parts.slice(1) };
    });
  });

  describe('slash commands (non-invoke)', () => {
    test('delegates to command handler and returns', async () => {
      mockHandleCommand.mockResolvedValue({ message: 'Command executed', modified: false });

      await handleMessage(platform, 'chat-456', '/status');

      expect(mockHandleCommand).toHaveBeenCalledWith(mockConversation, '/status');
      expect(platform.sendMessage).toHaveBeenCalledWith('chat-456', 'Command executed');
      expect(mockGetAssistantClient).not.toHaveBeenCalled();
    });

    test('reloads conversation when modified', async () => {
      mockHandleCommand.mockResolvedValue({ message: 'Codebase set', modified: true });

      await handleMessage(platform, 'chat-456', '/clone https://github.com/user/repo');

      expect(mockGetOrCreateConversation).toHaveBeenCalledTimes(2);
    });
  });

  describe('/command-invoke', () => {
    test('sends error when no codebase configured', async () => {
      mockGetOrCreateConversation.mockResolvedValue({
        ...mockConversation,
        codebase_id: null,
      });
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      expect(platform.sendMessage).toHaveBeenCalledWith(
        'chat-456',
        'No codebase configured. Use /clone for a new repo or /repos to list your current repos you can switch to.'
      );
    });

    test('sends error when no command name provided', async () => {
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: [] });

      await handleMessage(platform, 'chat-456', '/command-invoke');

      expect(platform.sendMessage).toHaveBeenCalledWith(
        'chat-456',
        'Usage: /command-invoke <name> [args...]'
      );
    });

    test('sends error when command not found', async () => {
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['unknown'] });

      await handleMessage(platform, 'chat-456', '/command-invoke unknown');

      expect(platform.sendMessage).toHaveBeenCalledWith(
        'chat-456',
        "Command 'unknown' not found. Use /commands to see available."
      );
    });

    test('sends error when codebase not found', async () => {
      mockGetCodebase.mockResolvedValue(null);
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      expect(platform.sendMessage).toHaveBeenCalledWith('chat-456', 'Codebase not found.');
    });

    test('sends error when file read fails', async () => {
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'));

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      expect(platform.sendMessage).toHaveBeenCalledWith(
        'chat-456',
        'Failed to read command file: ENOENT: no such file'
      );
    });

    test('reads command file and sends to AI', async () => {
      mockParseCommand.mockReturnValue({
        command: 'command-invoke',
        args: ['plan', 'Add dark mode'],
      });
      mockReadFile.mockResolvedValue('Plan the following: $1');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'assistant', content: 'I will plan this feature.' };
        yield { type: 'result', sessionId: 'new-session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan "Add dark mode"');

      // Use join() for platform-agnostic path construction
      const expectedPath = join('/workspace/project', '.claude/commands/plan.md');
      expect(mockReadFile).toHaveBeenCalledWith(expectedPath, 'utf-8');
      // Session has assistant_session_id so it's passed to sendQuery
      expect(mockClient.sendQuery).toHaveBeenCalledWith(
        wrapCommandForExecution('plan', 'Plan the following: Add dark mode'),
        '/workspace/project',
        'claude-session-xyz'
      );
    });

    test('appends issueContext after command text', async () => {
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Command text here');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan', 'Issue #42: Fix the bug');

      expect(mockClient.sendQuery).toHaveBeenCalledWith(
        wrapCommandForExecution('plan', 'Command text here') + '\n\n---\n\nIssue #42: Fix the bug',
        expect.any(String),
        'claude-session-xyz' // Uses existing session's ID
      );
    });
  });

  describe('regular messages', () => {
    test('sends error when no codebase configured', async () => {
      mockGetOrCreateConversation.mockResolvedValue({
        ...mockConversation,
        codebase_id: null,
      });

      await handleMessage(platform, 'chat-456', 'Hello, help me with code');

      expect(platform.sendMessage).toHaveBeenCalledWith(
        'chat-456',
        'No codebase configured. Use /clone for a new repo or /repos to list your current repos you can switch to.'
      );
    });
  });

  describe('router template', () => {
    test('routes non-slash messages through router template when available', async () => {
      mockGetTemplate.mockImplementation(async (name: string) => {
        if (name === 'router') {
          return {
            id: 'router-id',
            name: 'router',
            description: 'Route requests',
            content: 'Router prompt with $ARGUMENTS',
            created_at: new Date(),
            updated_at: new Date(),
          };
        }
        return null;
      });
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', 'fix the login bug');

      expect(mockGetTemplate).toHaveBeenCalledWith('router');
      expect(mockClient.sendQuery).toHaveBeenCalledWith(
        'Router prompt with fix the login bug',
        '/workspace/project',
        'claude-session-xyz'
      );
    });

    test('passes message directly if router template not available', async () => {
      mockGetTemplate.mockResolvedValue(null);
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', 'fix the login bug');

      expect(mockClient.sendQuery).toHaveBeenCalledWith(
        'fix the login bug',
        '/workspace/project',
        'claude-session-xyz'
      );
    });
  });

  describe('session management', () => {
    test('creates new session when none exists', async () => {
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Plan command');
      mockGetActiveSession.mockResolvedValue(null);
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      expect(mockCreateSession).toHaveBeenCalledWith({
        conversation_id: 'conv-123',
        codebase_id: 'codebase-789',
        ai_assistant_type: 'claude',
      });
    });

    test('resumes existing session', async () => {
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Plan command');
      mockGetActiveSession.mockResolvedValue(mockSession);
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(mockClient.sendQuery).toHaveBeenCalledWith(
        wrapCommandForExecution('plan', 'Plan command'),
        '/workspace/project',
        'claude-session-xyz'
      );
    });

    test('creates new session for plan-feature→execute transition', async () => {
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['execute'] });
      mockReadFile.mockResolvedValue('Execute command');
      mockGetActiveSession.mockResolvedValue({
        ...mockSession,
        metadata: { lastCommand: 'plan-feature' },
      });
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke execute');

      expect(mockDeactivateSession).toHaveBeenCalledWith('session-abc');
      expect(mockCreateSession).toHaveBeenCalled();
    });

    test('updates session with AI session ID', async () => {
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Plan command');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'ai-session-123' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      expect(mockUpdateSession).toHaveBeenCalledWith('session-abc', 'ai-session-123');
    });

    test('tracks lastCommand in metadata', async () => {
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Plan command');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      expect(mockUpdateSessionMetadata).toHaveBeenCalledWith('session-abc', {
        lastCommand: 'plan',
      });
    });
  });

  describe('streaming modes', () => {
    beforeEach(() => {
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Plan command');
    });

    test('stream mode sends each chunk immediately', async () => {
      platform.getStreamingMode.mockReturnValue('stream');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'assistant', content: 'First chunk' };
        yield { type: 'tool', toolName: 'Bash', toolInput: { command: 'ls' } };
        yield { type: 'assistant', content: 'Second chunk' };
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      expect(platform.sendMessage).toHaveBeenCalledTimes(3);
      expect(platform.sendMessage).toHaveBeenNthCalledWith(1, 'chat-456', 'First chunk');
      expect(platform.sendMessage).toHaveBeenNthCalledWith(
        2,
        'chat-456',
        expect.stringContaining('BASH')
      );
      expect(platform.sendMessage).toHaveBeenNthCalledWith(3, 'chat-456', 'Second chunk');
    });

    test('batch mode accumulates and sends all messages joined', async () => {
      platform.getStreamingMode.mockReturnValue('batch');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'assistant', content: 'Part 1' };
        yield { type: 'tool', toolName: 'Bash', toolInput: { command: 'npm test' } };
        yield { type: 'assistant', content: 'Part 2\n\nFinal summary' };
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      // Batch mode sends: 1) "starting" message, 2) all messages joined
      expect(platform.sendMessage).toHaveBeenCalledTimes(2);
      expect(platform.sendMessage).toHaveBeenNthCalledWith(
        1,
        'chat-456',
        expect.stringContaining('is on the case')
      );
      // Verify both Part 1 and Final summary are included (joined with ---)
      const finalMessage = platform.sendMessage.mock.calls[1][1];
      expect(finalMessage).toContain('Part 1');
      expect(finalMessage).toContain('---');
      expect(finalMessage).toContain('Final summary');
    });

    test('batch mode filters out tool indicators from final message', async () => {
      platform.getStreamingMode.mockReturnValue('batch');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'assistant', content: '🔧 BASH\nnpm test\n\nClean summary here' };
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      // Second message is the final one (first is "starting" message)
      const sentMessage = platform.sendMessage.mock.calls[1][1];
      expect(sentMessage).not.toContain('🔧');
      expect(sentMessage).toContain('Clean summary');
    });
  });

  describe('error handling', () => {
    test('sends contextual error message on unexpected error', async () => {
      mockGetOrCreateConversation.mockRejectedValue(new Error('Database error'));

      await handleMessage(platform, 'chat-456', '/status');

      expect(platform.sendMessage).toHaveBeenCalledWith(
        'chat-456',
        '⚠️ Error: Database error. Try /reset if issue persists.'
      );
    });

    test('sends rate limit message for rate limit errors', async () => {
      mockGetOrCreateConversation.mockRejectedValue(new Error('rate limit exceeded'));

      await handleMessage(platform, 'chat-456', '/status');

      expect(platform.sendMessage).toHaveBeenCalledWith(
        'chat-456',
        '⚠️ AI rate limit reached. Please wait a moment and try again.'
      );
    });

    test('sends generic message for sensitive errors', async () => {
      mockGetOrCreateConversation.mockRejectedValue(
        new Error('Connection to postgres://user:password@host:5432/db failed')
      );

      await handleMessage(platform, 'chat-456', '/status');

      expect(platform.sendMessage).toHaveBeenCalledWith(
        'chat-456',
        '⚠️ An unexpected error occurred. Try /reset to start a fresh session.'
      );
    });
  });

  describe('cwd resolution', () => {
    test('uses conversation cwd when set', async () => {
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Plan command');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      expect(mockClient.sendQuery).toHaveBeenCalledWith(
        wrapCommandForExecution('plan', 'Plan command'),
        '/workspace/project', // conversation.cwd
        'claude-session-xyz' // Uses existing session's ID
      );
    });

    test('falls back to codebase default_cwd', async () => {
      mockGetOrCreateConversation.mockResolvedValue({
        ...mockConversation,
        cwd: null,
      });
      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Plan command');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      expect(mockClient.sendQuery).toHaveBeenCalledWith(
        wrapCommandForExecution('plan', 'Plan command'),
        '/workspace/test-project', // codebase.default_cwd
        'claude-session-xyz' // Uses existing session's ID
      );
    });
  });

  describe('stale worktree handling', () => {
    test('should deactivate session and clear worktree when cwd does not exist', async () => {
      // Setup: conversation with worktree_path that doesn't exist
      const conversationWithStaleWorktree = {
        ...mockConversation,
        worktree_path: '/nonexistent/worktree/path',
        cwd: '/nonexistent/worktree/path',
      };
      mockGetOrCreateConversation.mockResolvedValue(conversationWithStaleWorktree);

      // Mock fs.access to throw (path doesn't exist)
      mockAccess.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

      // Mock active session
      mockGetActiveSession.mockResolvedValue({
        ...mockSession,
        id: 'stale-session-id',
      });

      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Plan command');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      // Verify session was deactivated
      expect(mockDeactivateSession).toHaveBeenCalledWith('stale-session-id');

      // Verify worktree_path was cleared
      expect(mockUpdateConversation).toHaveBeenCalledWith(
        'conv-123',
        expect.objectContaining({
          worktree_path: null,
          cwd: '/workspace/test-project', // Falls back to codebase default_cwd
        })
      );
    });

    test('should use default cwd when worktree path is stale', async () => {
      // Setup: conversation with worktree_path that doesn't exist
      const conversationWithStaleWorktree = {
        ...mockConversation,
        worktree_path: '/nonexistent/worktree/path',
        cwd: '/nonexistent/worktree/path',
      };
      mockGetOrCreateConversation.mockResolvedValue(conversationWithStaleWorktree);

      // Mock fs.access to throw (path doesn't exist)
      mockAccess.mockRejectedValueOnce(new Error('ENOENT'));

      // Create a new session without assistant_session_id (simulating fresh start)
      const freshSession = {
        ...mockSession,
        assistant_session_id: null,
      };
      mockCreateSession.mockResolvedValue(freshSession);

      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Plan command');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      // Verify AI client was called with the fallback cwd
      expect(mockClient.sendQuery).toHaveBeenCalledWith(
        wrapCommandForExecution('plan', 'Plan command'),
        '/workspace/test-project', // Falls back to codebase default_cwd
        undefined // New session created (assistant_session_id is null -> undefined)
      );
    });

    test('should not deactivate session if cwd exists', async () => {
      // Mock fs.access to succeed (path exists)
      mockAccess.mockResolvedValue(undefined);

      // Mock active session
      mockGetActiveSession.mockResolvedValue(mockSession);

      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Plan command');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      // Verify session was NOT deactivated (for stale worktree reason)
      // Note: It might be deactivated for plan→execute transition, but not for stale worktree
      expect(mockUpdateConversation).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ worktree_path: null })
      );
    });

    test('should handle conversation without worktree_path gracefully', async () => {
      // Conversation without worktree_path
      mockGetOrCreateConversation.mockResolvedValue({
        ...mockConversation,
        worktree_path: null,
        cwd: '/workspace/project',
      });

      // cwd exists
      mockAccess.mockResolvedValue(undefined);

      mockParseCommand.mockReturnValue({ command: 'command-invoke', args: ['plan'] });
      mockReadFile.mockResolvedValue('Plan command');
      mockClient.sendQuery.mockImplementation(async function* () {
        yield { type: 'result', sessionId: 'session-id' };
      });

      await handleMessage(platform, 'chat-456', '/command-invoke plan');

      // Should work normally, no worktree cleanup needed
      expect(mockClient.sendQuery).toHaveBeenCalledWith(
        wrapCommandForExecution('plan', 'Plan command'),
        '/workspace/project',
        'claude-session-xyz'
      );
    });
  });
});
