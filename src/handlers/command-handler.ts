/**
 * Command handler for slash commands
 * Handles deterministic operations without AI
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { Conversation, CommandResult } from '../types';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';

const execAsync = promisify(exec);

export function parseCommand(text: string): { command: string; args: string[] } {
  const parts = text.trim().split(/\s+/);
  return {
    command: parts[0].substring(1), // Remove leading '/'
    args: parts.slice(1)
  };
}

export async function handleCommand(
  conversation: Conversation,
  message: string
): Promise<CommandResult> {
  const { command, args } = parseCommand(message);

  switch (command) {
    case 'help':
      return {
        success: true,
        message: `Available Commands:
/help - Show this help message
/status - Show conversation state
/getcwd - Show current working directory
/setcwd <path> - Set working directory
/clone <repo-url> - Clone GitHub repository
/reset - Clear active session`
      };

    case 'status': {
      let msg = `Platform: ${conversation.platform_type}\nAI Assistant: ${conversation.ai_assistant_type}`;

      if (conversation.codebase_id) {
        const cb = await codebaseDb.getCodebase(conversation.codebase_id);
        if (cb) {
          msg += `\n\nCodebase: ${cb.name}`;
          if (cb.repository_url) {
            msg += `\nRepository: ${cb.repository_url}`;
          }
        }
      } else {
        msg += '\n\nNo codebase configured. Use /clone <repo-url> to get started.';
      }

      msg += `\n\nCurrent Working Directory: ${conversation.cwd || 'Not set'}`;

      const session = await sessionDb.getActiveSession(conversation.id);
      if (session) {
        msg += `\nActive Session: ${session.id.substring(0, 8)}...`;
      }

      return { success: true, message: msg };
    }

    case 'getcwd':
      return {
        success: true,
        message: `Current working directory: ${conversation.cwd || 'Not set'}`
      };

    case 'setcwd': {
      if (args.length === 0) {
        return { success: false, message: 'Usage: /setcwd <path>' };
      }
      const newCwd = args.join(' ');
      await db.updateConversation(conversation.id, { cwd: newCwd });

      // Add this directory to git safe.directory if it's a git repository
      // This prevents "dubious ownership" errors when working with existing repos
      try {
        await execAsync(`git config --global --add safe.directory ${newCwd}`);
        console.log(`[Command] Added ${newCwd} to git safe.directory`);
      } catch (error) {
        // Ignore errors - directory might not be a git repo
        console.log(`[Command] Could not add ${newCwd} to safe.directory (might not be a git repo)`);
      }

      // Reset session when changing working directory
      const session = await sessionDb.getActiveSession(conversation.id);
      if (session) {
        await sessionDb.deactivateSession(session.id);
        console.log(`[Command] Deactivated session after cwd change`);
      }

      return {
        success: true,
        message: `Working directory set to: ${newCwd}\n\nSession reset - starting fresh on next message.`,
        modified: true
      };
    }

    case 'clone': {
      if (args.length === 0) {
        return { success: false, message: 'Usage: /clone <repo-url>' };
      }

      const repoUrl = args[0];
      const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'unknown';
      // Inside Docker container, always use /workspace (mounted volume)
      const workspacePath = '/workspace';
      const targetPath = `${workspacePath}/${repoName}`;

      try {
        console.log(`[Clone] Cloning ${repoUrl} to ${targetPath}`);

        // Build clone command with authentication if GitHub token is available
        let cloneCommand = `git clone ${repoUrl} ${targetPath}`;
        const ghToken = process.env.GH_TOKEN;

        if (ghToken && repoUrl.includes('github.com')) {
          // Inject token into GitHub URL for private repo access
          // Convert: https://github.com/user/repo.git -> https://token@github.com/user/repo.git
          let authenticatedUrl = repoUrl;
          if (repoUrl.startsWith('https://github.com')) {
            authenticatedUrl = repoUrl.replace('https://github.com', `https://${ghToken}@github.com`);
          } else if (repoUrl.startsWith('http://github.com')) {
            authenticatedUrl = repoUrl.replace('http://github.com', `https://${ghToken}@github.com`);
          } else if (!repoUrl.startsWith('http')) {
            // Handle github.com/user/repo format
            authenticatedUrl = `https://${ghToken}@${repoUrl}`;
          }
          cloneCommand = `git clone ${authenticatedUrl} ${targetPath}`;
          console.log(`[Clone] Using authenticated GitHub clone`);
        }

        await execAsync(cloneCommand);

        // Add the cloned repository to git safe.directory to prevent ownership errors
        // This is needed because we run as non-root user but git might see different ownership
        await execAsync(`git config --global --add safe.directory ${targetPath}`);
        console.log(`[Clone] Added ${targetPath} to git safe.directory`);

        const codebase = await codebaseDb.createCodebase({
          name: repoName,
          repository_url: repoUrl,
          default_cwd: targetPath
        });

        await db.updateConversation(conversation.id, {
          codebase_id: codebase.id,
          cwd: targetPath
        });

        // Reset session when cloning a new repository
        const session = await sessionDb.getActiveSession(conversation.id);
        if (session) {
          await sessionDb.deactivateSession(session.id);
          console.log(`[Command] Deactivated session after clone`);
        }

        return {
          success: true,
          message: `Repository cloned successfully!\n\nCodebase: ${repoName}\nPath: ${targetPath}\n\nSession reset - starting fresh on next message.\n\nYou can now start asking questions about the code.`,
          modified: true
        };
      } catch (error) {
        const err = error as Error;
        console.error('[Clone] Failed:', err);
        return {
          success: false,
          message: `Failed to clone repository: ${err.message}`
        };
      }
    }

    case 'reset': {
      const session = await sessionDb.getActiveSession(conversation.id);
      if (session) {
        await sessionDb.deactivateSession(session.id);
        return {
          success: true,
          message: 'Session cleared. Starting fresh on next message.\n\nCodebase configuration preserved.'
        };
      }
      return {
        success: true,
        message: 'No active session to reset.'
      };
    }

    default:
      return {
        success: false,
        message: `Unknown command: /${command}\n\nType /help to see available commands.`
      };
  }
}
