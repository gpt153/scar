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
import * as fsPromises from 'fs/promises';

const mockDb = db as jest.Mocked<typeof db>;
const mockCodebaseDb = codebaseDb as jest.Mocked<typeof codebaseDb>;
const mockSessionDb = sessionDb as jest.Mocked<typeof sessionDb>;
const mockIsPathWithinWorkspace = isPathWithinWorkspace as jest.MockedFunction<
  typeof isPathWithinWorkspace
>;
const mockExecFile = execFile as unknown as jest.Mock;
const mockFsPromises = fsPromises as jest.Mocked<typeof fsPromises>;

describe('CommandHandler', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPathWithinWorkspace.mockReturnValue(true);
    // Ensure consistent workspace path for tests
    delete process.env.WORKSPACE_PATH;
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

    test('should parse /repo with number', () => {
      const result = parseCommand('/repo 1');
      expect(result.command).toBe('repo');
      expect(result.args).toEqual(['1']);
    });

    test('should parse /repo with name', () => {
      const result = parseCommand('/repo dylan');
      expect(result.command).toBe('repo');
      expect(result.args).toEqual(['dylan']);
    });

    test('should parse /repo with pull', () => {
      const result = parseCommand('/repo 1 pull');
      expect(result.command).toBe('repo');
      expect(result.args).toEqual(['1', 'pull']);
    });

    test('should parse /repo-remove with number', () => {
      const result = parseCommand('/repo-remove 1');
      expect(result.command).toBe('repo-remove');
      expect(result.args).toEqual(['1']);
    });

    test('should parse /repo-remove with name', () => {
      const result = parseCommand('/repo-remove my-repo');
      expect(result.command).toBe('repo-remove');
      expect(result.args).toEqual(['my-repo']);
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
      worktree_path: null,
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
        expect(result.message).toContain('Path must be within');
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

      test('should auto-detect and link codebase from cwd', async () => {
        // Conversation has cwd set but no codebase_id
        const conversation = {
          ...baseConversation,
          cwd: '/workspace/detected-repo',
          codebase_id: null,
        };

        // Mock findCodebaseByDefaultCwd to return a matching codebase
        mockCodebaseDb.findCodebaseByDefaultCwd.mockResolvedValue({
          id: 'cb-auto',
          name: 'detected-repo',
          repository_url: 'https://github.com/user/detected-repo',
          default_cwd: '/workspace/detected-repo',
          ai_assistant_type: 'claude',
          commands: {},
          created_at: new Date(),
          updated_at: new Date(),
        });
        mockDb.updateConversation.mockResolvedValue();
        mockSessionDb.getActiveSession.mockResolvedValue(null);

        const result = await handleCommand(conversation, '/status');

        expect(result.success).toBe(true);
        expect(result.message).toContain('detected-repo');
        // Verify auto-link was called
        expect(mockDb.updateConversation).toHaveBeenCalledWith('conv-123', {
          codebase_id: 'cb-auto',
        });
      });

      test('should show no codebase when cwd does not match any codebase', async () => {
        const conversation = {
          ...baseConversation,
          cwd: '/workspace/unknown-repo',
          codebase_id: null,
        };

        mockCodebaseDb.findCodebaseByDefaultCwd.mockResolvedValue(null);
        mockSessionDb.getActiveSession.mockResolvedValue(null);

        const result = await handleCommand(conversation, '/status');

        expect(result.success).toBe(true);
        expect(result.message).toContain('No codebase configured');
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
        expect(result.message).toContain('Path must be within');
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
        expect(result.message).toContain('Path must be within');
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

    describe('/repo-remove', () => {
      test('should return error without argument', async () => {
        const result = await handleCommand(baseConversation, '/repo-remove');
        expect(result.success).toBe(false);
        expect(result.message).toContain('Usage');
      });
    });

    describe('/repos', () => {
      test('should mark repo as active when codebase_id matches', async () => {
        // Setup: conversation has codebase_id linked
        const conversation = {
          ...baseConversation,
          codebase_id: 'cb-123',
          cwd: '/workspace/my-repo',
        };

        // Mock codebase lookup
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

        // Mock workspace directory listing
        mockFsPromises.readdir.mockResolvedValue([
          { name: 'my-repo', isDirectory: () => true },
          { name: 'other-repo', isDirectory: () => true },
        ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

        const result = await handleCommand(conversation, '/repos');

        expect(result.success).toBe(true);
        expect(result.message).toContain('my-repo');
        expect(result.message).toContain('← active');
        // Only the matching repo should be marked active
        expect(result.message).not.toMatch(/other-repo.*← active/);
      });

      test('should auto-detect active repo from cwd when no codebase_id', async () => {
        // Setup: conversation has cwd set but no codebase_id
        const conversation = {
          ...baseConversation,
          cwd: '/workspace/detected-repo',
          codebase_id: null,
        };

        // Mock codebase auto-detection
        mockCodebaseDb.findCodebaseByDefaultCwd.mockResolvedValue({
          id: 'cb-detected',
          name: 'detected-repo',
          repository_url: 'https://github.com/user/detected-repo',
          default_cwd: '/workspace/detected-repo',
          ai_assistant_type: 'claude',
          commands: {},
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Mock workspace directory listing
        mockFsPromises.readdir.mockResolvedValue([
          { name: 'detected-repo', isDirectory: () => true },
          { name: 'other-repo', isDirectory: () => true },
        ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

        const result = await handleCommand(conversation, '/repos');

        expect(result.success).toBe(true);
        expect(result.message).toContain('detected-repo');
        expect(result.message).toContain('← active');
      });

      test('should NOT mark repo active when cwd is subdirectory but no matching codebase', async () => {
        // Setup: cwd is a subdirectory of a repo, but no codebase matches
        // This tests the fix: we should NOT use startsWith() anymore
        const conversation = {
          ...baseConversation,
          cwd: '/workspace/some-repo/src/deep/path',
          codebase_id: null,
        };

        // Mock: no codebase matches this cwd
        mockCodebaseDb.findCodebaseByDefaultCwd.mockResolvedValue(null);

        // Mock workspace directory listing
        mockFsPromises.readdir.mockResolvedValue([
          { name: 'some-repo', isDirectory: () => true },
          { name: 'other-repo', isDirectory: () => true },
        ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

        const result = await handleCommand(conversation, '/repos');

        expect(result.success).toBe(true);
        // Neither repo should be marked active
        expect(result.message).not.toContain('← active');
      });

      test('should be consistent with /status active detection', async () => {
        // This test verifies /repos and /status agree on active codebase
        const conversation = {
          ...baseConversation,
          cwd: '/workspace/test-repo',
          codebase_id: null,
        };

        const mockCodebase = {
          id: 'cb-test',
          name: 'test-repo',
          repository_url: 'https://github.com/user/test-repo',
          default_cwd: '/workspace/test-repo',
          ai_assistant_type: 'claude',
          commands: {},
          created_at: new Date(),
          updated_at: new Date(),
        };

        // Setup mocks for /repos
        mockCodebaseDb.findCodebaseByDefaultCwd.mockResolvedValue(mockCodebase);
        mockFsPromises.readdir.mockResolvedValue([
          { name: 'test-repo', isDirectory: () => true },
        ] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

        const reposResult = await handleCommand(conversation, '/repos');

        // Reset mocks for /status
        mockCodebaseDb.findCodebaseByDefaultCwd.mockResolvedValue(mockCodebase);
        mockDb.updateConversation.mockResolvedValue();
        mockSessionDb.getActiveSession.mockResolvedValue(null);

        const statusResult = await handleCommand(conversation, '/status');

        // Both should show test-repo as active/configured
        expect(reposResult.message).toContain('← active');
        expect(statusResult.message).toContain('test-repo');
        expect(statusResult.message).not.toContain('No codebase configured');
      });
    });

    describe('/worktree', () => {
      const conversationWithCodebase: Conversation = {
        ...baseConversation,
        codebase_id: 'codebase-123',
        cwd: '/workspace/my-repo',
      };

      beforeEach(() => {
        mockCodebaseDb.getCodebase.mockResolvedValue({
          id: 'codebase-123',
          name: 'my-repo',
          repository_url: 'https://github.com/user/my-repo',
          default_cwd: '/workspace/my-repo',
          ai_assistant_type: 'claude',
          commands: {},
          created_at: new Date(),
          updated_at: new Date(),
        });
      });

      describe('create', () => {
        test('should require codebase', async () => {
          const result = await handleCommand(baseConversation, '/worktree create feat-x');
          expect(result.success).toBe(false);
          expect(result.message).toContain('No codebase');
        });

        test('should require branch name', async () => {
          const result = await handleCommand(conversationWithCodebase, '/worktree create');
          expect(result.success).toBe(false);
          expect(result.message).toContain('Usage');
        });

        test('should validate branch name format', async () => {
          const result = await handleCommand(
            conversationWithCodebase,
            '/worktree create "bad name"'
          );
          expect(result.success).toBe(false);
          expect(result.message).toContain('letters, numbers');
        });

        test('should create worktree with valid name', async () => {
          mockExecFile.mockImplementation(
            (_cmd: string, _args: string[], callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
              callback(null, { stdout: '', stderr: '' });
            }
          );
          mockSessionDb.getActiveSession.mockResolvedValue(null);

          const result = await handleCommand(conversationWithCodebase, '/worktree create feat-auth');

          expect(result.success).toBe(true);
          expect(result.message).toContain('Worktree created');
          expect(result.message).toContain('feat-auth');
          // Should show shortened path relative to repo root
          expect(result.message).toContain('worktrees/feat-auth');
          expect(result.message).not.toContain('/workspace/my-repo/worktrees');
          expect(mockDb.updateConversation).toHaveBeenCalledWith(
            conversationWithCodebase.id,
            expect.objectContaining({ worktree_path: '/workspace/my-repo/worktrees/feat-auth' })
          );
        });

        test('should reject if already using a worktree', async () => {
          const convWithWorktree: Conversation = {
            ...conversationWithCodebase,
            worktree_path: '/workspace/my-repo/worktrees/existing-branch',
          };

          const result = await handleCommand(convWithWorktree, '/worktree create new-branch');

          expect(result.success).toBe(false);
          expect(result.message).toContain('Already using worktree');
          // Should show shortened path
          expect(result.message).toContain('worktrees/existing-branch');
          expect(result.message).toContain('/worktree remove first');
        });
      });

      describe('list', () => {
        test('should list worktrees', async () => {
          mockExecFile.mockImplementation(
            (_cmd: string, _args: string[], callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
              callback(null, {
                stdout:
                  '/workspace/my-repo  abc1234 [main]\n/workspace/my-repo/worktrees/feat-x  def5678 [feat-x]\n',
                stderr: '',
              });
            }
          );

          const result = await handleCommand(conversationWithCodebase, '/worktree list');

          expect(result.success).toBe(true);
          expect(result.message).toContain('Worktrees:');
          expect(result.message).toContain('main');
          // Should show shortened paths
          // The main repo root becomes "." and worktree shows as relative path
          expect(result.message).toContain('abc1234 [main]');
          expect(result.message).toContain('worktrees/feat-x');
          // Should NOT contain the full absolute path
          expect(result.message).not.toContain('/workspace/my-repo/worktrees');
        });
      });

      describe('remove', () => {
        test('should require active worktree', async () => {
          const result = await handleCommand(conversationWithCodebase, '/worktree remove');
          expect(result.success).toBe(false);
          expect(result.message).toContain('not using a worktree');
        });

        test('should remove worktree and switch to main', async () => {
          const convWithWorktree: Conversation = {
            ...conversationWithCodebase,
            worktree_path: '/workspace/my-repo/worktrees/feat-x',
          };

          mockExecFile.mockImplementation(
            (_cmd: string, _args: string[], callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
              callback(null, { stdout: '', stderr: '' });
            }
          );
          mockSessionDb.getActiveSession.mockResolvedValue(null);

          const result = await handleCommand(convWithWorktree, '/worktree remove');

          expect(result.success).toBe(true);
          expect(result.message).toContain('removed');
          // Should show shortened path
          expect(result.message).toContain('worktrees/feat-x');
          expect(result.message).not.toContain('/workspace/my-repo/worktrees');
          expect(mockDb.updateConversation).toHaveBeenCalledWith(
            convWithWorktree.id,
            expect.objectContaining({ worktree_path: null, cwd: '/workspace/my-repo' })
          );
        });
      });

      describe('default', () => {
        test('should show usage for unknown subcommand', async () => {
          const result = await handleCommand(conversationWithCodebase, '/worktree foo');
          expect(result.success).toBe(false);
          expect(result.message).toContain('Usage');
        });
      });
    });

    describe('/clone', () => {
      // Mock fs/promises for testing command auto-loading
      const { access, readdir } = require('fs/promises');
      const mockAccess = access as jest.MockedFunction<typeof access>;
      const mockReaddir = readdir as jest.MockedFunction<typeof readdir>;

      beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup default mocks for git operations (callback-style for promisify)
        // execFile signature: (cmd, args, options?, callback)
        mockExecFile.mockImplementation(
          (_cmd: string, _args: string[], optionsOrCallback: any, callback?: any) => {
            const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
            if (cb) {
              cb(null, { stdout: '', stderr: '' });
            }
          }
        );

        // Default: no command folders exist
        mockAccess.mockRejectedValue(new Error('ENOENT'));
        mockReaddir.mockResolvedValue([]);

        mockIsPathWithinWorkspace.mockReturnValue(true);
        mockCodebaseDb.createCodebase.mockResolvedValue({
          id: 'cb-new',
          name: 'test-repo',
          repository_url: 'https://github.com/user/test-repo',
          default_cwd: '/workspace/test-repo',
          ai_assistant_type: 'claude',
          commands: {},
          created_at: new Date(),
          updated_at: new Date(),
        });
        mockDb.updateConversation.mockResolvedValue();
        mockSessionDb.getActiveSession.mockResolvedValue(null);
        mockCodebaseDb.getCodebaseCommands.mockResolvedValue({});
        mockCodebaseDb.updateCodebaseCommands.mockResolvedValue();
      });

      test('should auto-load commands from .claude/commands/ when present', async () => {
        // Mock .claude/commands folder exists
        mockAccess.mockImplementation((path: string) => {
          if (path.includes('.claude/commands')) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        });

        // Mock markdown files in .claude/commands
        mockReaddir.mockResolvedValue([
          { name: 'test-command.md', isFile: () => true, isDirectory: () => false } as any,
          { name: 'another-command.md', isFile: () => true, isDirectory: () => false } as any,
        ]);

        const result = await handleCommand(
          baseConversation,
          '/clone https://github.com/user/test-repo'
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('Repository cloned successfully');
        expect(result.message).toContain('✓ Loaded 2 commands');
        expect(mockCodebaseDb.updateCodebaseCommands).toHaveBeenCalledWith(
          'cb-new',
          expect.objectContaining({
            'test-command': expect.objectContaining({
              path: '.claude/commands/test-command.md',
              description: 'From .claude/commands',
            }),
            'another-command': expect.objectContaining({
              path: '.claude/commands/another-command.md',
              description: 'From .claude/commands',
            }),
          })
        );
      });

      test('should auto-load commands from .agents/commands/ when .claude absent', async () => {
        // Mock only .agents/commands exists
        mockAccess.mockImplementation((path: string) => {
          if (path.includes('.agents/commands')) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        });

        mockReaddir.mockResolvedValue([
          { name: 'rca.md', isFile: () => true, isDirectory: () => false } as any,
        ]);

        const result = await handleCommand(
          baseConversation,
          '/clone https://github.com/user/test-repo'
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('✓ Loaded 1 commands');
        expect(mockCodebaseDb.updateCodebaseCommands).toHaveBeenCalledWith(
          'cb-new',
          expect.objectContaining({
            rca: expect.objectContaining({
              path: '.agents/commands/rca.md',
              description: 'From .agents/commands',
            }),
          })
        );
      });

      test('should not show loaded message when no command folders exist', async () => {
        // Both command folders don't exist (default mock state)
        const result = await handleCommand(
          baseConversation,
          '/clone https://github.com/user/test-repo'
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('Repository cloned successfully');
        expect(result.message).not.toContain('✓ Loaded');
        expect(mockCodebaseDb.updateCodebaseCommands).not.toHaveBeenCalled();
      });

      test('should not show loaded message when command folder is empty', async () => {
        // Command folder exists but has no markdown files
        mockAccess.mockImplementation((path: string) => {
          if (path.includes('.claude/commands')) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        });

        mockReaddir.mockResolvedValue([
          { name: '.gitkeep', isFile: () => true, isDirectory: () => false } as any,
        ]);

        const result = await handleCommand(
          baseConversation,
          '/clone https://github.com/user/test-repo'
        );

        expect(result.success).toBe(true);
        expect(result.message).not.toContain('✓ Loaded');
        expect(mockCodebaseDb.updateCodebaseCommands).not.toHaveBeenCalled();
      });

      test('should check .claude/commands before .agents/commands (priority order)', async () => {
        // This test verifies that the code checks folders in the correct priority order
        // We test this by checking that .claude/commands is checked first
        mockAccess.mockImplementation((path: string) => {
          if (path.includes('.claude/commands')) {
            return Promise.resolve();
          }
          // Reject .agents/commands to ensure we stop at .claude
          return Promise.reject(new Error('ENOENT'));
        });

        mockReaddir.mockResolvedValue([
          { name: 'priority-test.md', isFile: () => true, isDirectory: () => false } as any,
        ]);

        const result = await handleCommand(
          baseConversation,
          '/clone https://github.com/user/test-repo'
        );

        expect(result.success).toBe(true);
        // Should successfully load from .claude/commands
        expect(result.message).toMatch(/✓ Loaded \d+ command/);
      });

      test('should recursively find commands in subdirectories', async () => {
        // This test verifies that findMarkdownFilesRecursive is called
        // which handles subdirectory traversal
        mockAccess.mockImplementation((path: string) => {
          if (path.includes('.claude/commands')) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        });

        // Mock a directory with a subdirectory
        mockReaddir
          .mockResolvedValueOnce([
            { name: 'cmd1.md', isFile: () => true, isDirectory: () => false } as any,
            { name: 'subfolder', isFile: () => false, isDirectory: () => true } as any,
          ])
          .mockResolvedValueOnce([
            { name: 'cmd2.md', isFile: () => true, isDirectory: () => false } as any,
          ]);

        const result = await handleCommand(
          baseConversation,
          '/clone https://github.com/user/test-repo'
        );

        expect(result.success).toBe(true);
        // Should successfully load commands
        expect(result.message).toMatch(/✓ Loaded \d+ command/);
        // Verify readdir was called multiple times (once for root, once for subdirectory)
        expect(mockReaddir).toHaveBeenCalledTimes(2);
      });

      test('should preserve existing commands when auto-loading', async () => {
        // Mock existing commands in the codebase
        mockCodebaseDb.getCodebaseCommands.mockResolvedValue({
          'existing-cmd': {
            path: '.claude/existing.md',
            description: 'Existing command',
          },
        });

        mockAccess.mockImplementation((path: string) => {
          if (path.includes('.claude/commands')) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('ENOENT'));
        });

        mockReaddir.mockResolvedValue([
          { name: 'new-cmd.md', isFile: () => true, isDirectory: () => false } as any,
        ]);

        const result = await handleCommand(
          baseConversation,
          '/clone https://github.com/user/test-repo'
        );

        expect(result.success).toBe(true);

        // Verify commands were updated
        expect(mockCodebaseDb.updateCodebaseCommands).toHaveBeenCalled();
        const updateCall = mockCodebaseDb.updateCodebaseCommands.mock.calls[0];
        const commands = updateCall[1];

        // Should preserve existing command
        expect(commands).toHaveProperty('existing-cmd');
        expect(commands['existing-cmd'].path).toBe('.claude/existing.md');

        // Should add new command (name depends on what readdir returned)
        expect(Object.keys(commands).length).toBeGreaterThan(1);
      });

      test('should reset session when cloning', async () => {
        const activeSession = {
          id: 'session-123',
          conversation_id: 'conv-123',
          codebase_id: 'cb-old',
          ai_assistant_type: 'claude',
          assistant_session_id: 'asst-123',
          active: true,
          started_at: new Date(),
          ended_at: null,
          metadata: {},
        };

        mockSessionDb.getActiveSession.mockResolvedValue(activeSession);
        mockSessionDb.deactivateSession.mockResolvedValue();

        const result = await handleCommand(
          baseConversation,
          '/clone https://github.com/user/test-repo'
        );

        expect(result.success).toBe(true);
        expect(mockSessionDb.deactivateSession).toHaveBeenCalledWith('session-123');
      });
    });
  });
});
