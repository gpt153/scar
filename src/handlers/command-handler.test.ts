/**
 * Unit tests for command handler
 */
import { parseCommand, handleCommand } from './command-handler';
import { Conversation } from '../types';

// Mock all external dependencies
jest.mock('../db/conversations');
jest.mock('../db/codebases');
jest.mock('../db/sessions');
jest.mock('../utils/path-validation');
jest.mock('fs/promises');
jest.mock('child_process', () => ({
  exec: jest.fn(),
  execFile: jest.fn(),
}));

import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';
import { isPathWithinWorkspace } from '../utils/path-validation';
import { execFile } from 'child_process';

const mockDb = db as jest.Mocked<typeof db>;
const mockCodebaseDb = codebaseDb as jest.Mocked<typeof codebaseDb>;
const mockSessionDb = sessionDb as jest.Mocked<typeof sessionDb>;
const mockIsPathWithinWorkspace = isPathWithinWorkspace as jest.MockedFunction<
  typeof isPathWithinWorkspace
>;
const mockExecFile = execFile as unknown as jest.Mock;

describe('CommandHandler', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPathWithinWorkspace.mockReturnValue(true);
  });

  describe('parseCommand', () => {
    test('should extract command and args from /clone command', () => {
      const result = parseCommand('/clone https://github.com/user/repo');
      expect(result.command).toBe('clone');
      expect(result.args).toEqual(['https://github.com/user/repo']);
    });

    test('should handle commands without args', () => {
      const result = parseCommand('/help');
      expect(result.command).toBe('help');
      expect(result.args).toEqual([]);
    });

    test('should handle /status command', () => {
      const result = parseCommand('/status');
      expect(result.command).toBe('status');
      expect(result.args).toEqual([]);
    });

    test('should handle /setcwd with path containing spaces', () => {
      const result = parseCommand('/setcwd /workspace/my repo');
      expect(result.command).toBe('setcwd');
      expect(result.args).toEqual(['/workspace/my', 'repo']);
    });

    test('should handle /reset command', () => {
      const result = parseCommand('/reset');
      expect(result.command).toBe('reset');
      expect(result.args).toEqual([]);
    });

    test('should handle command with multiple spaces', () => {
      const result = parseCommand('/clone   https://github.com/user/repo  ');
      expect(result.command).toBe('clone');
      expect(result.args).toEqual(['https://github.com/user/repo']);
    });

    test('should handle /getcwd command', () => {
      const result = parseCommand('/getcwd');
      expect(result.command).toBe('getcwd');
      expect(result.args).toEqual([]);
    });

    test('should parse quoted arguments', () => {
      const result = parseCommand('/command-invoke plan "Add dark mode"');
      expect(result.command).toBe('command-invoke');
      expect(result.args).toEqual(['plan', 'Add dark mode']);
    });

    test('should parse mixed quoted and unquoted args', () => {
      const result = parseCommand('/command-set test .test.md "Task: $1"');
      expect(result.command).toBe('command-set');
      expect(result.args).toEqual(['test', '.test.md', 'Task: $1']);
    });

    test('should parse /command-set', () => {
      const result = parseCommand('/command-set prime .claude/prime.md');
      expect(result.command).toBe('command-set');
      expect(result.args).toEqual(['prime', '.claude/prime.md']);
    });

    test('should parse /load-commands', () => {
      const result = parseCommand('/load-commands .claude/commands');
      expect(result.command).toBe('load-commands');
      expect(result.args).toEqual(['.claude/commands']);
    });

    test('should handle single quotes', () => {
      const result = parseCommand("/command-invoke plan 'Add dark mode'");
      expect(result.command).toBe('command-invoke');
      expect(result.args).toEqual(['plan', 'Add dark mode']);
    });

    test('should parse /repos', () => {
      const result = parseCommand('/repos');
      expect(result.command).toBe('repos');
      expect(result.args).toEqual([]);
    });

    // Bug fix tests: Multi-word quoted arguments should be preserved as single arg
    test('should preserve multi-word quoted string as single argument', () => {
      const result = parseCommand('/command-invoke plan "here is the request"');
      expect(result.command).toBe('command-invoke');
      expect(result.args).toEqual(['plan', 'here is the request']);
      // Specifically verify the second arg is the FULL quoted string
      expect(result.args[1]).toBe('here is the request');
    });

    test('should handle long quoted sentences', () => {
      const result = parseCommand(
        '/command-invoke execute "Implement the user authentication feature with JWT tokens"'
      );
      expect(result.command).toBe('command-invoke');
      expect(result.args).toEqual([
        'execute',
        'Implement the user authentication feature with JWT tokens',
      ]);
    });

    test('should handle multiple quoted arguments', () => {
      const result = parseCommand('/command-invoke test "first arg" "second arg" "third arg"');
      expect(result.command).toBe('command-invoke');
      expect(result.args).toEqual(['test', 'first arg', 'second arg', 'third arg']);
    });

    test('should handle mixed quoted and unquoted with spaces', () => {
      const result = parseCommand('/command-invoke plan "Add feature X" --flag value');
      expect(result.command).toBe('command-invoke');
      expect(result.args).toEqual(['plan', 'Add feature X', '--flag', 'value']);
    });

    test('should handle quoted arg with special characters', () => {
      const result = parseCommand('/command-invoke plan "Fix bug #123: handle edge case"');
      expect(result.command).toBe('command-invoke');
      expect(result.args).toEqual(['plan', 'Fix bug #123: handle edge case']);
    });

    test('should handle empty quoted string', () => {
      const result = parseCommand('/command-invoke plan ""');
      expect(result.command).toBe('command-invoke');
      // Empty quotes get matched by \S+ and stripped, resulting in empty string
      expect(result.args).toEqual(['plan', '']);
    });
  });

  describe('handleCommand', () => {
    const baseConversation: Conversation = {
      id: 'conv-123',
      platform_type: 'telegram',
      platform_conversation_id: 'chat-456',
      ai_assistant_type: 'claude',
      codebase_id: null,
      cwd: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    describe('/help', () => {
      test('should return help message', async () => {
        const result = await handleCommand(baseConversation, '/help');
        expect(result.success).toBe(true);
        expect(result.message).toContain('Available Commands');
        expect(result.message).toContain('/clone');
        expect(result.message).toContain('/setcwd');
      });
    });

    describe('/getcwd', () => {
      test('should return current working directory when set', async () => {
        const conversation = { ...baseConversation, cwd: '/workspace/my-repo' };
        const result = await handleCommand(conversation, '/getcwd');
        expect(result.success).toBe(true);
        expect(result.message).toContain('/workspace/my-repo');
      });

      test('should return "Not set" when cwd is null', async () => {
        const result = await handleCommand(baseConversation, '/getcwd');
        expect(result.success).toBe(true);
        expect(result.message).toContain('Not set');
      });
    });

    describe('/setcwd', () => {
      test('should return error without path argument', async () => {
        const result = await handleCommand(baseConversation, '/setcwd');
        expect(result.success).toBe(false);
        expect(result.message).toContain('Usage');
      });

      test('should reject path traversal attempts', async () => {
        mockIsPathWithinWorkspace.mockReturnValue(false);
        const result = await handleCommand(baseConversation, '/setcwd ../etc/passwd');
        expect(result.success).toBe(false);
        expect(result.message).toContain('must be within /workspace');
      });

      test('should update cwd for valid path', async () => {
        mockIsPathWithinWorkspace.mockReturnValue(true);
        mockDb.updateConversation.mockResolvedValue();
        mockSessionDb.getActiveSession.mockResolvedValue(null);
        mockExecFile.mockImplementation((_cmd, _args, callback) => {
          callback(null, { stdout: '', stderr: '' });
        });

        const result = await handleCommand(baseConversation, '/setcwd /workspace/repo');
        expect(result.success).toBe(true);
        expect(result.message).toContain('/workspace/repo');
        expect(mockDb.updateConversation).toHaveBeenCalled();
      });
    });

    describe('/status', () => {
      test('should show platform and assistant info', async () => {
        const result = await handleCommand(baseConversation, '/status');
        expect(result.success).toBe(true);
        expect(result.message).toContain('telegram');
        expect(result.message).toContain('claude');
      });

      test('should show codebase info when set', async () => {
        const conversation = { ...baseConversation, codebase_id: 'cb-123' };
        mockCodebaseDb.getCodebase.mockResolvedValue({
          id: 'cb-123',
          name: 'my-repo',
          repository_url: 'https://github.com/user/my-repo',
          default_cwd: '/workspace/my-repo',
          ai_assistant_type: 'claude',
          commands: {},
          created_at: new Date(),
          updated_at: new Date(),
        });
        mockSessionDb.getActiveSession.mockResolvedValue(null);

        const result = await handleCommand(conversation, '/status');
        expect(result.success).toBe(true);
        expect(result.message).toContain('my-repo');
      });
    });

    describe('/reset', () => {
      test('should deactivate active session', async () => {
        mockSessionDb.getActiveSession.mockResolvedValue({
          id: 'session-123',
          conversation_id: 'conv-123',
          codebase_id: 'cb-123',
          ai_assistant_type: 'claude',
          assistant_session_id: 'sdk-123',
          active: true,
          metadata: {},
          started_at: new Date(),
          ended_at: null,
        });
        mockSessionDb.deactivateSession.mockResolvedValue();

        const result = await handleCommand(baseConversation, '/reset');
        expect(result.success).toBe(true);
        expect(result.message).toContain('cleared');
        expect(mockSessionDb.deactivateSession).toHaveBeenCalledWith('session-123');
      });

      test('should handle no active session gracefully', async () => {
        mockSessionDb.getActiveSession.mockResolvedValue(null);

        const result = await handleCommand(baseConversation, '/reset');
        expect(result.success).toBe(true);
        expect(result.message).toContain('No active session');
      });
    });

    describe('/command-set', () => {
      test('should return error without codebase', async () => {
        const result = await handleCommand(baseConversation, '/command-set plan plan.md');
        expect(result.success).toBe(false);
        expect(result.message).toContain('No codebase');
      });

      test('should return error without enough args', async () => {
        const conversation = { ...baseConversation, codebase_id: 'cb-123' };
        const result = await handleCommand(conversation, '/command-set plan');
        expect(result.success).toBe(false);
        expect(result.message).toContain('Usage');
      });

      test('should reject path traversal in command path', async () => {
        const conversation = {
          ...baseConversation,
          codebase_id: 'cb-123',
          cwd: '/workspace/repo',
        };
        mockIsPathWithinWorkspace.mockReturnValue(false);

        const result = await handleCommand(conversation, '/command-set evil ../../../etc/passwd');
        expect(result.success).toBe(false);
        expect(result.message).toContain('must be within /workspace');
      });
    });

    describe('/load-commands', () => {
      test('should return error without codebase', async () => {
        const result = await handleCommand(baseConversation, '/load-commands .claude/commands');
        expect(result.success).toBe(false);
        expect(result.message).toContain('No codebase');
      });

      test('should return error without folder argument', async () => {
        const conversation = { ...baseConversation, codebase_id: 'cb-123' };
        const result = await handleCommand(conversation, '/load-commands');
        expect(result.success).toBe(false);
        expect(result.message).toContain('Usage');
      });

      test('should reject path traversal', async () => {
        const conversation = {
          ...baseConversation,
          codebase_id: 'cb-123',
          cwd: '/workspace/repo',
        };
        mockIsPathWithinWorkspace.mockReturnValue(false);

        const result = await handleCommand(conversation, '/load-commands ../../../etc');
        expect(result.success).toBe(false);
        expect(result.message).toContain('must be within /workspace');
      });
    });

    describe('/commands', () => {
      test('should return error without codebase', async () => {
        const result = await handleCommand(baseConversation, '/commands');
        expect(result.success).toBe(false);
        expect(result.message).toContain('No codebase');
      });

      test('should list registered commands', async () => {
        const conversation = { ...baseConversation, codebase_id: 'cb-123' };
        mockCodebaseDb.getCodebase.mockResolvedValue({
          id: 'cb-123',
          name: 'my-repo',
          repository_url: null,
          default_cwd: '/workspace/my-repo',
          ai_assistant_type: 'claude',
          commands: {
            plan: { path: '.claude/commands/plan.md', description: 'Plan command' },
            execute: { path: '.claude/commands/execute.md', description: 'Execute command' },
          },
          created_at: new Date(),
          updated_at: new Date(),
        });

        const result = await handleCommand(conversation, '/commands');
        expect(result.success).toBe(true);
        expect(result.message).toContain('plan');
        expect(result.message).toContain('execute');
      });

      test('should show message when no commands registered', async () => {
        const conversation = { ...baseConversation, codebase_id: 'cb-123' };
        mockCodebaseDb.getCodebase.mockResolvedValue({
          id: 'cb-123',
          name: 'my-repo',
          repository_url: null,
          default_cwd: '/workspace/my-repo',
          ai_assistant_type: 'claude',
          commands: {},
          created_at: new Date(),
          updated_at: new Date(),
        });

        const result = await handleCommand(conversation, '/commands');
        expect(result.success).toBe(true);
        expect(result.message).toContain('No commands registered');
      });
    });

    describe('unknown command', () => {
      test('should return error for unknown command', async () => {
        const result = await handleCommand(baseConversation, '/unknown');
        expect(result.success).toBe(false);
        expect(result.message).toContain('Unknown command');
        expect(result.message).toContain('/help');
      });
    });
  });
});
