/**
 * Command handler for slash commands
 * Handles deterministic operations without AI
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, readdir, access, rm } from 'fs/promises';
import { join, basename, resolve, relative } from 'path';
import { Conversation, CommandResult } from '../types';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';
import * as templateDb from '../db/command-templates';
import { isPathWithinWorkspace } from '../utils/path-validation';

const execFileAsync = promisify(execFile);

/**
 * Convert an absolute path to a relative path from the repository root
 * Falls back to showing relative to workspace if not in a git repo
 */
function shortenPath(absolutePath: string, repoRoot?: string): string {
  // If we have a repo root, show path relative to it
  if (repoRoot) {
    const relPath = relative(repoRoot, absolutePath);
    // Only use relative path if it doesn't start with '..' (i.e., it's within the repo)
    if (!relPath.startsWith('..')) {
      return relPath;
    }
  }

  // Fallback: show relative to workspace
  const workspacePath = resolve(process.env.WORKSPACE_PATH ?? '/workspace');
  const relPath = relative(workspacePath, absolutePath);
  if (!relPath.startsWith('..')) {
    return relPath;
  }

  // If all else fails, return the original path
  return absolutePath;
}

/**
 * Recursively find all .md files in a directory and its subdirectories
 */
async function findMarkdownFilesRecursive(
  rootPath: string,
  relativePath = ''
): Promise<{ commandName: string; relativePath: string }[]> {
  const results: { commandName: string; relativePath: string }[] = [];
  const fullPath = join(rootPath, relativePath);

  const entries = await readdir(fullPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden directories and common exclusions
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    if (entry.isDirectory()) {
      // Recurse into subdirectory
      const subResults = await findMarkdownFilesRecursive(rootPath, join(relativePath, entry.name));
      results.push(...subResults);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      // Found a markdown file - use filename as command name
      results.push({
        commandName: basename(entry.name, '.md'),
        relativePath: join(relativePath, entry.name),
      });
    }
  }

  return results;
}

export function parseCommand(text: string): { command: string; args: string[] } {
  // Match quoted strings or non-whitespace sequences
  const matches = text.match(/"[^"]+"|'[^']+'|\S+/g) ?? [];

  if (matches.length === 0 || !matches[0]) {
    return { command: '', args: [] };
  }

  const command = matches[0].substring(1); // Remove leading '/'
  const args = matches.slice(1).map(arg => {
    // Remove surrounding quotes if present
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      return arg.slice(1, -1);
    }
    return arg;
  });

  return { command, args };
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

Command Templates (global):
  /<name> [args] - Invoke a template directly
  /templates - List all templates
  /template-add <name> <path> - Add template from file
  /template-delete <name> - Remove a template

Codebase Commands (per-project):
  /command-set <name> <path> [text] - Register command
  /load-commands <folder> - Bulk load (recursive)
  /command-invoke <name> [args] - Execute
  /commands - List registered
  Note: Commands use relative paths (e.g., .claude/commands)

Codebase:
  /clone <repo-url> - Clone repository
  /repos - List repositories (numbered)
  /repo <#|name> [pull] - Switch repo (auto-loads commands)
  /repo-remove <#|name> - Remove repo and codebase record
  /getcwd - Show working directory
  /setcwd <path> - Set directory
  Note: Use /repo for quick switching, /setcwd for manual paths

Worktrees:
  /worktree create <branch> - Create isolated worktree
  /worktree list - Show worktrees for this repo
  /worktree remove [--force] - Remove current worktree

Session:
  /status - Show state
  /reset - Clear session
  /help - Show help`,
      };

    case 'status': {
      let msg = `Platform: ${conversation.platform_type}\nAI Assistant: ${conversation.ai_assistant_type}`;

      let codebase = conversation.codebase_id
        ? await codebaseDb.getCodebase(conversation.codebase_id)
        : null;

      // Auto-detect codebase from cwd if not explicitly linked
      if (!codebase && conversation.cwd) {
        codebase = await codebaseDb.findCodebaseByDefaultCwd(conversation.cwd);
        if (codebase) {
          // Auto-link the detected codebase to this conversation
          await db.updateConversation(conversation.id, { codebase_id: codebase.id });
          console.log(`[Status] Auto-linked codebase ${codebase.name} to conversation`);
        }
      }

      if (codebase?.name) {
        msg += `\n\nCodebase: ${codebase.name}`;
        if (codebase.repository_url) {
          msg += `\nRepository: ${codebase.repository_url}`;
        }
      } else {
        msg += '\n\nNo codebase configured. Use /clone <repo-url> to get started.';
      }

      msg += `\n\nCurrent Working Directory: ${conversation.cwd ?? 'Not set'}`;

      if (conversation.worktree_path) {
        const repoRoot = codebase?.default_cwd;
        const shortPath = shortenPath(conversation.worktree_path, repoRoot);
        msg += `\nWorktree: ${shortPath}`;
      }

      const session = await sessionDb.getActiveSession(conversation.id);
      if (session?.id) {
        msg += `\nActive Session: ${session.id.slice(0, 8)}...`;
      }

      return { success: true, message: msg };
    }

    case 'getcwd':
      return {
        success: true,
        message: `Current working directory: ${conversation.cwd ?? 'Not set'}`,
      };

    case 'setcwd': {
      if (args.length === 0) {
        return { success: false, message: 'Usage: /setcwd <path>' };
      }
      const newCwd = args.join(' ');
      const resolvedCwd = resolve(newCwd);

      // Validate path is within workspace to prevent path traversal
      const workspacePath = resolve(process.env.WORKSPACE_PATH ?? '/workspace');
      if (!isPathWithinWorkspace(resolvedCwd)) {
        return { success: false, message: `Path must be within ${workspacePath} directory` };
      }

      await db.updateConversation(conversation.id, { cwd: resolvedCwd });

      // Add this directory to git safe.directory if it's a git repository
      // This prevents "dubious ownership" errors when working with existing repos
      // Use execFile instead of execAsync to prevent command injection
      try {
        await execFileAsync('git', ['config', '--global', '--add', 'safe.directory', resolvedCwd]);
        console.log(`[Command] Added ${resolvedCwd} to git safe.directory`);
      } catch (_error) {
        // Ignore errors - directory might not be a git repo
        console.log(
          `[Command] Could not add ${resolvedCwd} to safe.directory (might not be a git repo)`
        );
      }

      // Reset session when changing working directory
      const session = await sessionDb.getActiveSession(conversation.id);
      if (session) {
        await sessionDb.deactivateSession(session.id);
        console.log('[Command] Deactivated session after cwd change');
      }

      return {
        success: true,
        message: `Working directory set to: ${resolvedCwd}\n\nSession reset - starting fresh on next message.`,
        modified: true,
      };
    }

    case 'clone': {
      if (args.length === 0 || !args[0]) {
        return { success: false, message: 'Usage: /clone <repo-url>' };
      }

      // Normalize URL: strip trailing slashes
      const normalizedUrl: string = args[0].replace(/\/+$/, '');

      // Convert SSH URL to HTTPS format if needed
      // git@github.com:user/repo.git -> https://github.com/user/repo.git
      let workingUrl = normalizedUrl;
      if (normalizedUrl.startsWith('git@github.com:')) {
        workingUrl = normalizedUrl.replace('git@github.com:', 'https://github.com/');
      }

      const repoName = workingUrl.split('/').pop()?.replace('.git', '') ?? 'unknown';
      // Use WORKSPACE_PATH env var for flexibility (local dev vs Docker)
      // resolve() converts relative paths to absolute (cross-platform)
      const workspacePath = resolve(process.env.WORKSPACE_PATH ?? '/workspace');
      const targetPath = join(workspacePath, repoName);

      try {
        // Check if target directory already exists
        try {
          await access(targetPath);

          // Directory exists - try to find existing codebase by repo URL
          // Check both with and without .git suffix (per github.ts pattern)
          const urlNoGit = workingUrl.replace(/\.git$/, '');
          const urlWithGit = urlNoGit + '.git';

          const existingCodebase =
            (await codebaseDb.findCodebaseByRepoUrl(urlNoGit)) ??
            (await codebaseDb.findCodebaseByRepoUrl(urlWithGit));

          if (existingCodebase) {
            // Link conversation to existing codebase
            await db.updateConversation(conversation.id, {
              codebase_id: existingCodebase.id,
              cwd: targetPath,
            });

            // Reset session when switching codebases
            const session = await sessionDb.getActiveSession(conversation.id);
            if (session) {
              await sessionDb.deactivateSession(session.id);
            }

            // Check for command folders (same logic as successful clone)
            let commandFolder: string | null = null;
            for (const folder of ['.claude/commands', '.agents/commands']) {
              try {
                await access(join(targetPath, folder));
                commandFolder = folder;
                break;
              } catch {
                /* ignore */
              }
            }

            let responseMessage = `Repository already cloned.\n\nLinked to existing codebase: ${existingCodebase.name}\nPath: ${targetPath}\n\nSession reset - starting fresh on next message.`;

            if (commandFolder) {
              responseMessage += `\n\n📁 Found: ${commandFolder}/\nUse /load-commands ${commandFolder} to register commands.`;
            }

            return {
              success: true,
              message: responseMessage,
              modified: true,
            };
          }

          // Directory exists but no codebase found
          return {
            success: false,
            message: `Directory already exists: ${targetPath}\n\nNo matching codebase found in database. Options:\n- Remove the directory and re-clone\n- Use /setcwd ${targetPath} (limited functionality)`,
          };
        } catch {
          // Directory doesn't exist, proceed with clone
        }

        console.log(`[Clone] Cloning ${workingUrl} to ${targetPath}`);

        // Build clone command with authentication if GitHub token is available
        let cloneUrl = workingUrl;
        const ghToken = process.env.GH_TOKEN;

        if (ghToken && workingUrl.includes('github.com')) {
          // Inject token into GitHub URL for private repo access
          // Convert: https://github.com/user/repo.git -> https://token@github.com/user/repo.git
          if (workingUrl.startsWith('https://github.com')) {
            cloneUrl = workingUrl.replace('https://github.com', `https://${ghToken}@github.com`);
          } else if (workingUrl.startsWith('http://github.com')) {
            cloneUrl = workingUrl.replace('http://github.com', `https://${ghToken}@github.com`);
          } else if (!workingUrl.startsWith('http')) {
            // Handle github.com/user/repo format (bare domain)
            cloneUrl = `https://${ghToken}@${workingUrl}`;
          }
          console.log('[Clone] Using authenticated GitHub clone');
        }

        await execFileAsync('git', ['clone', cloneUrl, targetPath]);

        // Add the cloned repository to git safe.directory to prevent ownership errors
        // This is needed because we run as non-root user but git might see different ownership
        await execFileAsync('git', ['config', '--global', '--add', 'safe.directory', targetPath]);
        console.log(`[Clone] Added ${targetPath} to git safe.directory`);

        // Auto-detect assistant type based on folder structure
        let suggestedAssistant = 'claude';
        const codexFolder = join(targetPath, '.codex');
        const claudeFolder = join(targetPath, '.claude');

        try {
          await access(codexFolder);
          suggestedAssistant = 'codex';
          console.log('[Clone] Detected .codex folder - using Codex assistant');
        } catch {
          try {
            await access(claudeFolder);
            suggestedAssistant = 'claude';
            console.log('[Clone] Detected .claude folder - using Claude assistant');
          } catch {
            // Default to claude
            console.log('[Clone] No assistant folder detected - defaulting to Claude');
          }
        }

        const codebase = await codebaseDb.createCodebase({
          name: repoName,
          repository_url: workingUrl,
          default_cwd: targetPath,
          ai_assistant_type: suggestedAssistant,
        });

        await db.updateConversation(conversation.id, {
          codebase_id: codebase.id,
          cwd: targetPath,
        });

        // Reset session when cloning a new repository
        const session = await sessionDb.getActiveSession(conversation.id);
        if (session) {
          await sessionDb.deactivateSession(session.id);
          console.log('[Command] Deactivated session after clone');
        }

        // Auto-load commands if found
        let commandsLoaded = 0;
        for (const folder of ['.claude/commands', '.agents/commands']) {
          try {
            const commandPath = join(targetPath, folder);
            await access(commandPath);

            const markdownFiles = await findMarkdownFilesRecursive(commandPath);
            if (markdownFiles.length > 0) {
              const commands = await codebaseDb.getCodebaseCommands(codebase.id);
              markdownFiles.forEach(({ commandName, relativePath }) => {
                commands[commandName] = {
                  path: join(folder, relativePath),
                  description: `From ${folder}`,
                };
              });
              await codebaseDb.updateCodebaseCommands(codebase.id, commands);
              commandsLoaded = markdownFiles.length;
              break;
            }
          } catch {
            // Folder doesn't exist, try next
          }
        }

        let responseMessage = `Repository cloned successfully!\n\nCodebase: ${repoName}\nPath: ${targetPath}`;
        if (commandsLoaded > 0) {
          responseMessage += `\n✓ Loaded ${String(commandsLoaded)} commands`;
        }
        responseMessage += '\n\nSession reset - starting fresh on next message.\n\nYou can now start asking questions about the code.';

        return {
          success: true,
          message: responseMessage,
          modified: true,
        };
      } catch (error) {
        const err = error as Error;
        console.error('[Clone] Failed:', err);
        return {
          success: false,
          message: `Failed to clone repository: ${err.message}`,
        };
      }
    }

    case 'command-set': {
      if (args.length < 2) {
        return { success: false, message: 'Usage: /command-set <name> <path> [text]' };
      }
      if (!conversation.codebase_id) {
        return { success: false, message: 'No codebase configured. Use /clone first.' };
      }

      const [commandName, commandPath, ...textParts] = args;
      const commandText = textParts.join(' ');
      const workspacePath = resolve(process.env.WORKSPACE_PATH ?? '/workspace');
      const basePath = conversation.cwd ?? workspacePath;
      const fullPath = resolve(basePath, commandPath);

      // Validate path is within workspace to prevent path traversal
      if (!isPathWithinWorkspace(fullPath)) {
        return { success: false, message: `Path must be within ${workspacePath} directory` };
      }

      try {
        if (commandText) {
          await writeFile(fullPath, commandText, 'utf-8');
        } else {
          await readFile(fullPath, 'utf-8'); // Validate exists
        }
        await codebaseDb.registerCommand(conversation.codebase_id, commandName, {
          path: commandPath,
          description: `Custom: ${commandName}`,
        });
        return {
          success: true,
          message: `Command '${commandName}' registered!\nPath: ${commandPath}`,
        };
      } catch (error) {
        const err = error as Error;
        console.error('[Command] command-set failed:', err);
        return { success: false, message: `Failed: ${err.message}` };
      }
    }

    case 'load-commands': {
      if (!args.length) {
        return { success: false, message: 'Usage: /load-commands <folder>' };
      }
      if (!conversation.codebase_id) {
        return { success: false, message: 'No codebase configured.' };
      }

      const folderPath = args.join(' ');
      const workspacePath = resolve(process.env.WORKSPACE_PATH ?? '/workspace');
      const basePath = conversation.cwd ?? workspacePath;
      const fullPath = resolve(basePath, folderPath);

      // Validate path is within workspace to prevent path traversal
      if (!isPathWithinWorkspace(fullPath)) {
        return { success: false, message: `Path must be within ${workspacePath} directory` };
      }

      try {
        // Recursively find all .md files
        const markdownFiles = await findMarkdownFilesRecursive(fullPath);

        if (!markdownFiles.length) {
          return {
            success: false,
            message: `No .md files found in ${folderPath} (searched recursively)`,
          };
        }

        const commands = await codebaseDb.getCodebaseCommands(conversation.codebase_id);

        // Register each command (later files with same name will override earlier ones)
        markdownFiles.forEach(({ commandName, relativePath }) => {
          commands[commandName] = {
            path: join(folderPath, relativePath),
            description: `From ${folderPath}`,
          };
        });

        await codebaseDb.updateCodebaseCommands(conversation.codebase_id, commands);

        return {
          success: true,
          message: `Loaded ${String(markdownFiles.length)} commands recursively: ${markdownFiles.map(f => f.commandName).join(', ')}`,
        };
      } catch (error) {
        const err = error as Error;
        console.error('[Command] load-commands failed:', err);
        return { success: false, message: `Failed: ${err.message}` };
      }
    }

    case 'commands': {
      if (!conversation.codebase_id) {
        return { success: false, message: 'No codebase configured.' };
      }

      const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
      const commands = codebase?.commands ?? {};

      if (!Object.keys(commands).length) {
        return {
          success: true,
          message: 'No commands registered.\n\nUse /command-set or /load-commands.',
        };
      }

      let msg = 'Registered Commands:\n\n';
      for (const [name, def] of Object.entries(commands)) {
        msg += `${name} - ${def.path}\n`;
      }
      return { success: true, message: msg };
    }

    case 'repos': {
      const workspacePath = resolve(process.env.WORKSPACE_PATH ?? '/workspace');

      try {
        const entries = await readdir(workspacePath, { withFileTypes: true });
        const folders = entries
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name)
          .sort();

        if (!folders.length) {
          return {
            success: true,
            message: 'No repositories found in /workspace\n\nUse /clone <repo-url> to add one.',
          };
        }

        // Get current codebase to check for active repo (consistent with /status)
        let currentCodebase = conversation.codebase_id
          ? await codebaseDb.getCodebase(conversation.codebase_id)
          : null;

        // Auto-detect codebase from cwd if not explicitly linked (same as /status)
        if (!currentCodebase && conversation.cwd) {
          currentCodebase = await codebaseDb.findCodebaseByDefaultCwd(conversation.cwd);
        }

        let msg = 'Repositories:\n\n';

        for (let i = 0; i < folders.length; i++) {
          const folder = folders[i];
          const folderPath = join(workspacePath, folder);
          // Mark as active only if current codebase's default_cwd matches this folder
          const isActive = currentCodebase?.default_cwd === folderPath;
          const marker = isActive ? ' ← active' : '';
          msg += `${String(i + 1)}. ${folder}${marker}\n`;
        }

        msg += '\nUse /repo <number|name> to switch';

        return { success: true, message: msg };
      } catch (error) {
        const err = error as Error;
        console.error('[Command] repos failed:', err);
        return { success: false, message: `Failed to list repositories: ${err.message}` };
      }
    }

    case 'reset': {
      const session = await sessionDb.getActiveSession(conversation.id);
      if (session) {
        await sessionDb.deactivateSession(session.id);
        return {
          success: true,
          message:
            'Session cleared. Starting fresh on next message.\n\nCodebase configuration preserved.',
        };
      }
      return {
        success: true,
        message: 'No active session to reset.',
      };
    }

    case 'repo': {
      if (args.length === 0) {
        return { success: false, message: 'Usage: /repo <number|name> [pull]' };
      }

      const workspacePath = resolve(process.env.WORKSPACE_PATH ?? '/workspace');
      const identifier = args[0];
      const shouldPull = args[1]?.toLowerCase() === 'pull';

      try {
        // Get sorted list of repos (same as /repos)
        const entries = await readdir(workspacePath, { withFileTypes: true });
        const folders = entries
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name)
          .sort();

        if (!folders.length) {
          return {
            success: false,
            message: 'No repositories found. Use /clone <repo-url> first.',
          };
        }

        // Find the target folder by number or name
        let targetFolder: string | undefined;
        const num = parseInt(identifier, 10);
        if (!isNaN(num) && num >= 1 && num <= folders.length) {
          targetFolder = folders[num - 1];
        } else {
          // Try exact match first, then prefix match
          targetFolder =
            folders.find(f => f === identifier) ?? folders.find(f => f.startsWith(identifier));
        }

        if (!targetFolder) {
          return {
            success: false,
            message: `Repository not found: ${identifier}\n\nUse /repos to see available repositories.`,
          };
        }

        const targetPath = join(workspacePath, targetFolder);

        // Git pull if requested
        if (shouldPull) {
          try {
            await execFileAsync('git', ['-C', targetPath, 'pull']);
            console.log(`[Command] Pulled latest for ${targetFolder}`);
          } catch (pullError) {
            const err = pullError as Error;
            console.error('[Command] git pull failed:', err);
            return {
              success: false,
              message: `Failed to pull: ${err.message}`,
            };
          }
        }

        // Find or create codebase for this path
        let codebase = await codebaseDb.findCodebaseByDefaultCwd(targetPath);

        if (!codebase) {
          // Create new codebase for this directory
          // Auto-detect assistant type
          let suggestedAssistant = 'claude';
          try {
            await access(join(targetPath, '.codex'));
            suggestedAssistant = 'codex';
          } catch {
            // Default to claude
          }

          codebase = await codebaseDb.createCodebase({
            name: targetFolder,
            default_cwd: targetPath,
            ai_assistant_type: suggestedAssistant,
          });
          console.log(`[Command] Created codebase for ${targetFolder}`);
        }

        // Link conversation to codebase
        await db.updateConversation(conversation.id, {
          codebase_id: codebase.id,
          cwd: targetPath,
        });

        // Reset session when switching
        const session = await sessionDb.getActiveSession(conversation.id);
        if (session) {
          await sessionDb.deactivateSession(session.id);
        }

        // Auto-load commands if found
        let commandsLoaded = 0;
        for (const folder of ['.claude/commands', '.agents/commands']) {
          try {
            const commandPath = join(targetPath, folder);
            await access(commandPath);

            const markdownFiles = await findMarkdownFilesRecursive(commandPath);
            if (markdownFiles.length > 0) {
              const commands = await codebaseDb.getCodebaseCommands(codebase.id);
              markdownFiles.forEach(({ commandName, relativePath }) => {
                commands[commandName] = {
                  path: join(folder, relativePath),
                  description: `From ${folder}`,
                };
              });
              await codebaseDb.updateCodebaseCommands(codebase.id, commands);
              commandsLoaded = markdownFiles.length;
              break;
            }
          } catch {
            // Folder doesn't exist, try next
          }
        }

        let msg = `Switched to: ${targetFolder}`;
        if (shouldPull) {
          msg += '\n✓ Pulled latest changes';
        }
        if (commandsLoaded > 0) {
          msg += `\n✓ Loaded ${String(commandsLoaded)} commands`;
        }
        msg += '\n\nReady to work!';

        return { success: true, message: msg, modified: true };
      } catch (error) {
        const err = error as Error;
        console.error('[Command] repo switch failed:', err);
        return { success: false, message: `Failed: ${err.message}` };
      }
    }

    case 'repo-remove': {
      if (args.length === 0) {
        return { success: false, message: 'Usage: /repo-remove <number|name>' };
      }

      const workspacePath = resolve(process.env.WORKSPACE_PATH ?? '/workspace');
      const identifier = args[0];

      try {
        // Get sorted list of repos (same as /repos)
        const entries = await readdir(workspacePath, { withFileTypes: true });
        const folders = entries
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name)
          .sort();

        if (!folders.length) {
          return {
            success: false,
            message: 'No repositories found. Nothing to remove.',
          };
        }

        // Find the target folder by number or name
        let targetFolder: string | undefined;
        const num = parseInt(identifier, 10);
        if (!isNaN(num) && num >= 1 && num <= folders.length) {
          targetFolder = folders[num - 1];
        } else {
          // Try exact match first, then prefix match
          targetFolder =
            folders.find(f => f === identifier) ?? folders.find(f => f.startsWith(identifier));
        }

        if (!targetFolder) {
          return {
            success: false,
            message: `Repository not found: ${identifier}\n\nUse /repos to see available repositories.`,
          };
        }

        const targetPath = join(workspacePath, targetFolder);

        // Find codebase by path
        const codebase = await codebaseDb.findCodebaseByDefaultCwd(targetPath);

        // If current conversation uses this codebase, unlink it
        if (codebase && conversation.codebase_id === codebase.id) {
          await db.updateConversation(conversation.id, { codebase_id: null, cwd: null });
          // Also deactivate any active session
          const session = await sessionDb.getActiveSession(conversation.id);
          if (session) {
            await sessionDb.deactivateSession(session.id);
          }
        }

        // Delete codebase record (this also unlinks sessions)
        if (codebase) {
          await codebaseDb.deleteCodebase(codebase.id);
          console.log(`[Command] Deleted codebase: ${codebase.name}`);
        }

        // Remove directory
        await rm(targetPath, { recursive: true, force: true });
        console.log(`[Command] Removed directory: ${targetPath}`);

        let msg = `Removed: ${targetFolder}`;
        if (codebase) {
          msg += '\n✓ Deleted codebase record';
        }
        if (conversation.codebase_id === codebase?.id) {
          msg += '\n✓ Unlinked from current conversation';
        }

        return { success: true, message: msg, modified: true };
      } catch (error) {
        const err = error as Error;
        console.error('[Command] repo-remove failed:', err);
        return { success: false, message: `Failed to remove: ${err.message}` };
      }
    }

    case 'template-add': {
      if (args.length < 2) {
        return { success: false, message: 'Usage: /template-add <name> <file-path>' };
      }
      if (!conversation.cwd) {
        return { success: false, message: 'No working directory set. Use /clone or /setcwd first.' };
      }

      const [templateName, ...pathParts] = args;
      const filePath = pathParts.join(' ');
      const fullPath = resolve(conversation.cwd, filePath);

      try {
        const content = await readFile(fullPath, 'utf-8');

        // Extract description from frontmatter if present
        const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(content);
        let description: string | undefined;
        if (frontmatterMatch) {
          const descMatch = /description:\s*(.+)/.exec(frontmatterMatch[1]);
          description = descMatch?.[1]?.trim();
        }

        await templateDb.upsertTemplate({
          name: templateName,
          description: description ?? `From ${filePath}`,
          content,
        });

        return {
          success: true,
          message: `Template '${templateName}' saved!\n\nUse it with: /${templateName} [args]`,
        };
      } catch (error) {
        const err = error as Error;
        return { success: false, message: `Failed to read file: ${err.message}` };
      }
    }

    case 'template-list':
    case 'templates': {
      const templates = await templateDb.getAllTemplates();

      if (templates.length === 0) {
        return {
          success: true,
          message: 'No command templates registered.\n\nUse /template-add <name> <file-path> to add one.',
        };
      }

      let msg = 'Command Templates:\n\n';
      for (const t of templates) {
        msg += `/${t.name}`;
        if (t.description) {
          msg += ` - ${t.description}`;
        }
        msg += '\n';
      }
      msg += '\nUse /<name> [args] to invoke any template.';
      return { success: true, message: msg };
    }

    case 'template-delete': {
      if (args.length < 1) {
        return { success: false, message: 'Usage: /template-delete <name>' };
      }

      const deleted = await templateDb.deleteTemplate(args[0]);
      if (deleted) {
        return { success: true, message: `Template '${args[0]}' deleted.` };
      }
      return { success: false, message: `Template '${args[0]}' not found.` };
    }

    case 'worktree': {
      const subcommand = args[0];

      if (!conversation.codebase_id) {
        return { success: false, message: 'No codebase configured. Use /clone first.' };
      }

      const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
      if (!codebase) {
        return { success: false, message: 'Codebase not found.' };
      }

      const mainPath = codebase.default_cwd;
      const worktreesDir = join(mainPath, 'worktrees');

      switch (subcommand) {
        case 'create': {
          const branchName = args[1];
          if (!branchName) {
            return { success: false, message: 'Usage: /worktree create <branch-name>' };
          }

          // Check if already using a worktree
          if (conversation.worktree_path) {
            const shortPath = shortenPath(conversation.worktree_path, mainPath);
            return {
              success: false,
              message: `Already using worktree: ${shortPath}\n\nRun /worktree remove first.`,
            };
          }

          // Validate branch name (alphanumeric, dash, underscore only)
          if (!/^[a-zA-Z0-9_-]+$/.test(branchName)) {
            return {
              success: false,
              message: 'Branch name must contain only letters, numbers, dashes, and underscores.',
            };
          }

          const worktreePath = join(worktreesDir, branchName);

          try {
            // Create worktree with new branch
            await execFileAsync('git', [
              '-C',
              mainPath,
              'worktree',
              'add',
              worktreePath,
              '-b',
              branchName,
            ]);

            // Add to git safe.directory
            await execFileAsync('git', [
              'config',
              '--global',
              '--add',
              'safe.directory',
              worktreePath,
            ]);

            // Update conversation to use this worktree
            await db.updateConversation(conversation.id, { worktree_path: worktreePath });

            // Reset session for fresh start
            const session = await sessionDb.getActiveSession(conversation.id);
            if (session) {
              await sessionDb.deactivateSession(session.id);
            }

            const shortPath = shortenPath(worktreePath, mainPath);
            return {
              success: true,
              message: `Worktree created!\n\nBranch: ${branchName}\nPath: ${shortPath}\n\nThis conversation now works in isolation.\nRun dependency install if needed (e.g., npm install).`,
              modified: true,
            };
          } catch (error) {
            const err = error as Error;
            console.error('[Worktree] Create failed:', err);

            // Check for common errors
            if (err.message.includes('already exists')) {
              return {
                success: false,
                message: `Branch '${branchName}' already exists. Use a different name.`,
              };
            }
            return { success: false, message: `Failed to create worktree: ${err.message}` };
          }
        }

        case 'list': {
          try {
            const { stdout } = await execFileAsync('git', ['-C', mainPath, 'worktree', 'list']);

            // Parse output and mark current
            const lines = stdout.trim().split('\n');
            let msg = 'Worktrees:\n\n';

            for (const line of lines) {
              // Extract the path (first part before whitespace)
              const parts = line.split(/\s+/);
              const fullPath = parts[0];
              const shortPath = shortenPath(fullPath, mainPath);

              // Reconstruct line with shortened path
              const restOfLine = parts.slice(1).join(' ');
              const shortenedLine = restOfLine ? `${shortPath} ${restOfLine}` : shortPath;

              const isActive =
                conversation.worktree_path && line.startsWith(conversation.worktree_path);
              const marker = isActive ? ' <- active' : '';
              msg += `${shortenedLine}${marker}\n`;
            }

            return { success: true, message: msg };
          } catch (error) {
            const err = error as Error;
            return { success: false, message: `Failed to list worktrees: ${err.message}` };
          }
        }

        case 'remove': {
          if (!conversation.worktree_path) {
            return { success: false, message: 'This conversation is not using a worktree.' };
          }

          const worktreePath = conversation.worktree_path;
          const forceFlag = args[1] === '--force';

          try {
            // Remove worktree (--force discards uncommitted changes)
            const gitArgs = ['-C', mainPath, 'worktree', 'remove'];
            if (forceFlag) {
              gitArgs.push('--force');
            }
            gitArgs.push(worktreePath);

            await execFileAsync('git', gitArgs);

            // Clear worktree_path, keep cwd pointing to main repo
            await db.updateConversation(conversation.id, {
              worktree_path: null,
              cwd: mainPath,
            });

            // Reset session
            const session = await sessionDb.getActiveSession(conversation.id);
            if (session) {
              await sessionDb.deactivateSession(session.id);
            }

            const shortPath = shortenPath(worktreePath, mainPath);
            return {
              success: true,
              message: `Worktree removed: ${shortPath}\n\nSwitched back to main repo.`,
              modified: true,
            };
          } catch (error) {
            const err = error as Error;
            console.error('[Worktree] Remove failed:', err);

            // Provide friendly error for uncommitted changes
            if (err.message.includes('untracked files') || err.message.includes('modified')) {
              return {
                success: false,
                message: 'Worktree has uncommitted changes.\n\nCommit your work first, or use `/worktree remove --force` to discard.',
              };
            }
            return { success: false, message: `Failed to remove worktree: ${err.message}` };
          }
        }

        default:
          return {
            success: false,
            message: 'Usage:\n  /worktree create <branch>\n  /worktree list\n  /worktree remove [--force]',
          };
      }
    }

    default:
      return {
        success: false,
        message: `Unknown command: /${command}\n\nType /help to see available commands.`,
      };
  }
}
