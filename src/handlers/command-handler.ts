/**
 * Command handler for slash commands
 * Handles deterministic operations without AI
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, readdir, access, rm } from 'fs/promises';
import { join, basename, resolve, relative } from 'path';
import { Bot } from 'grammy';
import { Conversation, CommandResult } from '../types';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';
import * as templateDb from '../db/command-templates';
import * as messagesDb from '../db/messages';
import * as portDb from '../db/port-allocations';
import { isPathWithinWorkspace } from '../utils/path-validation';
import { listWorktrees } from '../utils/git';
import { handleNewTopic } from './new-topic-handler';
import { ArchonClient, type CrawlProgress } from '../clients/archon';
import type { IPlatformAdapter } from '../types';
import {
  handleDockerConfigCommand,
  handleDockerStatusCommand,
  handleDockerLogsCommand,
  handleDockerRestartCommand,
  handleDockerDeployCommand,
} from './docker-commands';
import {
  handleCloudRunStatusCommand,
  handleCloudRunLogsCommand,
  handleCloudRunDeployCommand,
  handleCloudRunRollbackCommand,
  handleCloudRunConfigCommand,
  handleCloudRunListCommand,
} from './gcp-commands';
import {
  setSecret,
  getSecret,
  listSecrets,
  syncSecrets,
  checkRequiredSecrets,
  deleteSecret,
  getProjectName,
} from '../utils/secrets-manager';

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
  message: string,
  bot?: Bot,
  platform?: IPlatformAdapter
): Promise<CommandResult> {
  const { command, args } = parseCommand(message);

  switch (command) {
    case 'new-topic': {
      if (args.length < 1) {
        return {
          success: false,
          message: 'Usage: /new-topic <project-name>\n\nExample: /new-topic Github search agent',
        };
      }

      const projectName = args.join(' ');
      const githubToken = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;

      if (!githubToken) {
        return {
          success: false,
          message: '❌ GitHub token not configured. Set GH_TOKEN or GITHUB_TOKEN in environment.',
        };
      }

      const workspacePath = resolve(process.env.WORKSPACE_PATH ?? '/workspace');
      const platformType = platform?.getPlatformType() ?? 'unknown';

      // Telegram-specific: Create forum topic
      // For Telegram general chat (no colon in ID), create topic
      // For other platforms or existing topics, skip topic creation
      const isTelegramGeneralChat =
        platformType === 'telegram' && !conversation.platform_conversation_id.includes(':');

      let telegramBot = undefined;
      let groupChatId = undefined;

      if (isTelegramGeneralChat && bot) {
        telegramBot = bot;
        groupChatId = conversation.platform_conversation_id;
      }

      const result = await handleNewTopic({
        projectName,
        githubToken,
        workspacePath,
        // Telegram-specific (optional)
        bot: telegramBot,
        groupChatId,
        // Platform info for conversation creation
        platformType,
        conversationId: conversation.platform_conversation_id,
      });

      // Return with Archon follow-up if project was created successfully
      if (result.success && result.codebaseId && result.githubUrl && result.workspacePath) {
        return {
          success: result.success,
          message: result.message,
          modified: true,
          archonFollowup: {
            projectName,
            githubUrl: result.githubUrl,
            workspacePath: result.workspacePath,
            codebaseId: result.codebaseId,
          },
        };
      }

      return { success: result.success, message: result.message, modified: true };
    }
    case 'help':
      return {
        success: true,
        message: `Available Commands:

Project Management:
  /new-topic <name> - Create new project (GitHub repo + workspace)
    • Creates private GitHub repository
    • Configures webhook for @scar mentions
    • Copies all command templates
    • For Telegram: Creates forum topic

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

Port Management:
  /port-allocate <name> [env] [port] - Allocate port
  /port-list [--worktree|--codebase|--all] - List ports
  /port-release <port> - Release port
  /port-check <port> - Check port status
  /port-stats [env] - Show port utilization
  /port-cleanup [--dry-run] - Clean stale allocations

Secrets Management:
  /secret-set [--global] <key> <value> - Set a secret
  /secret-get <key> - Get secret value
  /secret-list - List all secret keys
  /secret-sync - Sync secrets to .env.local
  /secret-check <key...> - Check if secrets exist
  /secret-delete [--global] <key> - Delete a secret

Session:
  /status - Show state
  /reset - Clear session
  /reset-context - Reset AI context, keep worktree
  /help - Show help

Knowledge Base (Archon):
  /crawl <url> - Crawl and index documentation website
  /crawl-status <progressId> - Check crawl progress`,
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

        // Clone repository (authentication via gh CLI credential helper)
        // The credential helper automatically retrieves tokens from gh auth context
        console.log('[Clone] Cloning repository (auth via gh CLI credential helper)');
        await execFileAsync('git', ['clone', workingUrl, targetPath]);

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
        responseMessage +=
          '\n\nSession reset - starting fresh on next message.\n\nYou can now start asking questions about the code.';

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

    case 'crawl': {
      const url = args[0];
      if (!url) {
        return {
          success: false,
          message: 'Usage: /crawl <url>\n\nExample: /crawl https://docs.anthropic.com',
        };
      }

      // Feature detection
      if (!process.env.ARCHON_URL) {
        return {
          success: false,
          message:
            'Archon integration not configured.\n\nSet ARCHON_URL in .env to enable crawling.\nSee docs/archon-integration.md for setup.',
        };
      }

      try {
        const client = new ArchonClient();

        // Health check first
        const healthStatus = await client.health();
        if (!healthStatus.ready) {
          return {
            success: false,
            message: `Archon server not ready.\n\nStatus: ${healthStatus.status}\n\nEnsure Archon is running: docker compose up -d`,
          };
        }

        // Get codebase name for tagging
        const codebase = conversation.codebase_id
          ? await codebaseDb.getCodebase(conversation.codebase_id)
          : null;
        const tags = codebase ? [codebase.name, 'scar-crawl'] : ['scar-crawl'];

        // Start crawl
        const crawlResponse = await client.startCrawl({
          url,
          knowledge_type: 'technical',
          tags,
          max_depth: 2,
          extract_code_examples: true,
        });

        // Send initial progress message
        if (platform) {
          await platform.sendMessage(
            conversation.platform_conversation_id,
            `🔍 Started crawling ${url}\n\nProgress ID: ${crawlResponse.progressId}\nEstimated duration: ${crawlResponse.estimatedDuration}\n\n⏳ Polling for completion...`
          );
        }

        // Poll with progress updates
        const finalProgress = await client.pollProgress(
          crawlResponse.progressId,
          async (progress: CrawlProgress) => {
            // Send progress updates every 10%
            if (platform && progress.progress % 10 === 0 && progress.progress > 0) {
              await platform.sendMessage(
                conversation.platform_conversation_id,
                `⏳ Progress: ${progress.progress}%\nProcessed: ${progress.processedPages}/${progress.totalPages} pages\nCurrent: ${progress.currentUrl}`
              );
            }
          }
        );

        if (finalProgress.status === 'completed') {
          return {
            success: true,
            message: `✅ Crawl completed!\n\n📊 Summary:\n- Total pages: ${finalProgress.totalPages}\n- Pages processed: ${finalProgress.processedPages}\n- Crawl type: ${finalProgress.crawlType}\n\n💡 Knowledge is now available for all conversations`,
          };
        } else if (finalProgress.status === 'error') {
          return {
            success: false,
            message: `❌ Crawl failed\n\nError: ${finalProgress.log}`,
          };
        } else {
          return {
            success: false,
            message: `⚠️ Crawl status: ${finalProgress.status}\n\nLast update: ${finalProgress.log}`,
          };
        }
      } catch (error) {
        console.error('[Crawl] Command failed:', error);
        return {
          success: false,
          message: `Failed to crawl ${url}\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\nCheck that Archon is running and accessible.`,
        };
      }
    }

    case 'crawl-status': {
      const progressId = args[0];
      if (!progressId) {
        return {
          success: false,
          message:
            'Usage: /crawl-status <progressId>\n\nGet the progress ID from /crawl command output.',
        };
      }

      if (!process.env.ARCHON_URL) {
        return {
          success: false,
          message: 'Archon integration not configured. Set ARCHON_URL in .env',
        };
      }

      try {
        const client = new ArchonClient();
        const progress = await client.getProgress(progressId);

        const statusEmoji =
          {
            starting: '🔄',
            in_progress: '⏳',
            completed: '✅',
            error: '❌',
            cancelled: '⚠️',
          }[progress.status] ?? '❓';

        return {
          success: true,
          message:
            `${statusEmoji} Crawl Status: ${progress.status}\n\n` +
            `Progress: ${progress.progress}%\n` +
            `Pages: ${progress.processedPages}/${progress.totalPages}\n` +
            `Current URL: ${progress.currentUrl}\n\n` +
            `Log: ${progress.log}`,
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to get crawl status\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
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

    case 'reset-context': {
      // Reset AI session while keeping worktree
      const activeSession = await sessionDb.getActiveSession(conversation.id);
      if (activeSession) {
        await sessionDb.deactivateSession(activeSession.id);
        return {
          success: true,
          message:
            'AI context reset. Your next message will start a fresh conversation while keeping your current working directory.',
        };
      }
      return {
        success: true,
        message: 'No active session to reset.',
      };
    }

    case 'resume': {
      // Load conversation history and prepare context for next message
      const limit = parseInt(process.env.MESSAGE_HISTORY_LIMIT || '50');

      try {
        const history = await messagesDb.getMessageHistory(conversation.id, limit);

        if (history.length === 0) {
          return {
            success: true,
            message: '📜 No previous messages found. Starting fresh!',
          };
        }

        // Get statistics about loaded messages
        const projects = Array.from(new Set(history.map(m => m.codebase_name).filter(Boolean)));
        const platforms = Array.from(new Set(history.map(m => m.platform_type)));
        const bySender = history.reduce<Record<string, number>>((acc, msg) => {
          acc[msg.sender] = (acc[msg.sender] || 0) + 1;
          return acc;
        }, {});

        // Format history as context string
        const contextPrompt = messagesDb.formatMessagesAsContext(history);

        // Deactivate current session if exists
        const session = await sessionDb.getActiveSession(conversation.id);
        if (session) {
          await sessionDb.deactivateSession(session.id);
        }

        // Create new session with history context in metadata
        const newSession = await sessionDb.createSession({
          conversation_id: conversation.id,
          codebase_id: conversation.codebase_id ?? undefined,
          ai_assistant_type: conversation.ai_assistant_type,
        });

        await sessionDb.updateSessionMetadata(newSession.id, {
          resumedWithHistory: true,
          historyMessageCount: history.length,
          historyContext: contextPrompt,
        });

        // Build response message
        let msg = `📜 Loaded last ${history.length} messages from conversation history.\n\n`;

        if (projects.length > 0) {
          msg += `🔍 Projects: ${projects.join(', ')}\n`;
        }

        msg += `📱 Platforms: ${platforms.join(', ')}\n`;
        msg += '\n📊 Breakdown:\n';
        msg += `  - ${bySender.user || 0} user messages\n`;
        msg += `  - ${bySender.assistant || 0} assistant responses\n`;
        if (bySender.system) {
          msg += `  - ${bySender.system} system messages\n`;
        }

        msg += '\nContext is now active. Your next message will include this history!';

        return {
          success: true,
          message: msg,
          modified: true, // Reload conversation state
        };
      } catch (error) {
        const err = error as Error;
        console.error('[Command] resume failed:', err);
        return {
          success: false,
          message: `Failed to load message history: ${err.message}`,
        };
      }
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
        return {
          success: false,
          message: 'No working directory set. Use /clone or /setcwd first.',
        };
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
          message:
            'No command templates registered.\n\nUse /template-add <name> <file-path> to add one.',
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

            // Allocate a development port for this worktree
            let portAllocation;
            try {
              const serviceName = codebase?.name
                ? `${codebase.name}-${branchName}`
                : `worktree-${branchName}`;

              portAllocation = await portDb.allocatePort({
                service_name: serviceName,
                description: `Development server for ${branchName}`,
                environment: 'dev',
                codebase_id: conversation.codebase_id || undefined,
                conversation_id: conversation.id,
                worktree_path: worktreePath,
              });
            } catch (portErr: unknown) {
              console.error('[Worktree] Port allocation failed:', portErr);
              // Continue without port allocation - non-critical error
            }

            const shortPath = shortenPath(worktreePath, mainPath);
            let message = `Worktree created!\n\nBranch: ${branchName}\nPath: ${shortPath}`;

            if (portAllocation) {
              message += `\nAllocated Port: ${portAllocation.port}`;
              message += `\n\nUse: PORT=${portAllocation.port} npm run dev`;
            } else {
              message += '\n\nThis conversation now works in isolation.';
              message += '\nRun dependency install if needed (e.g., npm install).';
            }

            return {
              success: true,
              message,
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

            // Release all ports associated with this worktree
            let releasedPorts = 0;
            try {
              const worktreePorts = await portDb.getPortsByWorktree(worktreePath);
              for (const allocation of worktreePorts) {
                const released = await portDb.releasePort(allocation.port);
                if (released) {
                  releasedPorts++;
                }
              }
            } catch (portErr: unknown) {
              console.error('[Worktree] Port release failed:', portErr);
              // Continue - non-critical error
            }

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
            let message = `Worktree removed: ${shortPath}`;
            if (releasedPorts > 0) {
              message += `\nReleased ${releasedPorts} port${releasedPorts > 1 ? 's' : ''}`;
            }
            message += '\n\nSwitched back to main repo.';

            return {
              success: true,
              message,
              modified: true,
            };
          } catch (error) {
            const err = error as Error;
            console.error('[Worktree] Remove failed:', err);

            // Provide friendly error for uncommitted changes
            if (err.message.includes('untracked files') || err.message.includes('modified')) {
              return {
                success: false,
                message:
                  'Worktree has uncommitted changes.\n\nCommit your work first, or use `/worktree remove --force` to discard.',
              };
            }
            return { success: false, message: `Failed to remove worktree: ${err.message}` };
          }
        }

        case 'orphans': {
          // Show all worktrees from git perspective (source of truth)
          // Useful for discovering skill-created worktrees or stale entries
          const gitWorktrees = await listWorktrees(mainPath);

          if (gitWorktrees.length <= 1) {
            return {
              success: true,
              message:
                'No worktrees found (only main repo).\n\nUse `/worktree create <branch>` to create one.',
            };
          }

          let msg = 'All worktrees (from git):\n\n';
          for (const wt of gitWorktrees) {
            const isMainRepo = wt.path === mainPath;
            if (isMainRepo) continue;

            const shortPath = shortenPath(wt.path, mainPath);
            const isCurrent = wt.path === conversation.worktree_path;
            const marker = isCurrent ? ' ← current' : '';
            msg += `  ${wt.branch} → ${shortPath}${marker}\n`;
          }

          msg += '\nNote: This shows ALL worktrees including those created by external tools.\n';
          msg += 'Git (`git worktree list`) is the source of truth.';

          return { success: true, message: msg };
        }

        default:
          return {
            success: false,
            message:
              'Usage:\n  /worktree create <branch>\n  /worktree list\n  /worktree remove [--force]\n  /worktree orphans',
          };
      }
    }

    case 'port-allocate': {
      // Usage: /port-allocate <service-name> [dev|production|test] [preferred-port]
      if (args.length < 1) {
        return {
          success: false,
          message:
            'Usage: /port-allocate <service-name> [environment] [preferred-port]\n\n' +
            'Environment: dev (default), production, test\n\n' +
            'Example: /port-allocate api-server dev\n' +
            'Example: /port-allocate frontend dev 8080',
        };
      }

      const serviceName = args[0];
      const environment = (args[1] as 'dev' | 'production' | 'test') || 'dev';
      const preferredPort = args[2] ? parseInt(args[2]) : undefined;

      if (!['dev', 'production', 'test'].includes(environment)) {
        return {
          success: false,
          message: '❌ Invalid environment. Use: dev, production, or test',
        };
      }

      try {
        const allocation = await portDb.allocatePort({
          service_name: serviceName,
          environment,
          preferred_port: preferredPort,
          codebase_id: conversation.codebase_id || undefined,
          conversation_id: conversation.id,
          worktree_path: conversation.worktree_path || undefined,
        });

        return {
          success: true,
          message:
            '✅ Port allocated!\n\n' +
            `Port: ${allocation.port}\n` +
            `Service: ${allocation.service_name}\n` +
            `Environment: ${allocation.environment}\n\n` +
            `Use: PORT=${allocation.port} npm run dev`,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `❌ Failed to allocate port: ${message}`,
        };
      }
    }

    case 'port-list': {
      // Usage: /port-list [--worktree] [--codebase] [--environment dev|prod|test] [--all]
      const showWorktree = args.includes('--worktree');
      const showCodebase = args.includes('--codebase');
      const showAll = args.includes('--all');
      const envIndex = args.findIndex(arg => arg === '--environment');
      const environment = envIndex >= 0 ? (args[envIndex + 1] as 'dev' | 'production' | 'test') : undefined;

      try {
        let allocations;

        if (showAll) {
          allocations = await portDb.listAllocations();
        } else if (showWorktree && conversation.worktree_path) {
          allocations = await portDb.getPortsByWorktree(conversation.worktree_path);
        } else if (showCodebase && conversation.codebase_id) {
          allocations = await portDb.getPortsByCodebase(conversation.codebase_id);
        } else if (environment) {
          allocations = await portDb.listAllocations({ environment });
        } else {
          // Default: show ports for current conversation
          allocations = await portDb.listAllocations({
            conversation_id: conversation.id,
            status: 'allocated',
          });
        }

        if (allocations.length === 0) {
          return {
            success: true,
            message: '📋 No port allocations found.\n\nUse `/port-allocate <service-name>` to allocate a port.',
          };
        }

        let msg = '📋 Port Allocations:\n\n';
        for (const alloc of allocations) {
          const status = alloc.status === 'allocated' ? '🟢' : alloc.status === 'released' ? '🔴' : '🟡';
          msg += `${status} Port ${alloc.port} - ${alloc.service_name} (${alloc.environment})\n`;
          if (alloc.description) {
            msg += `   ${alloc.description}\n`;
          }
        }

        return { success: true, message: msg };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `❌ Failed to list ports: ${message}`,
        };
      }
    }

    case 'port-release': {
      // Usage: /port-release <port>
      if (args.length < 1) {
        return {
          success: false,
          message: 'Usage: /port-release <port>\n\nExample: /port-release 8080',
        };
      }

      const port = parseInt(args[0]);
      if (isNaN(port)) {
        return {
          success: false,
          message: '❌ Invalid port number',
        };
      }

      try {
        const released = await portDb.releasePort(port);
        if (!released) {
          return {
            success: false,
            message: `❌ Port ${port} was not allocated or already released`,
          };
        }

        return {
          success: true,
          message: `✅ Port ${port} released successfully`,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `❌ Failed to release port: ${message}`,
        };
      }
    }

    case 'port-check': {
      // Usage: /port-check <port>
      if (args.length < 1) {
        return {
          success: false,
          message: 'Usage: /port-check <port>\n\nExample: /port-check 8080',
        };
      }

      const port = parseInt(args[0]);
      if (isNaN(port)) {
        return {
          success: false,
          message: '❌ Invalid port number',
        };
      }

      try {
        const allocation = await portDb.getPortAllocation(port);

        if (!allocation) {
          return {
            success: true,
            message: `✅ Port ${port} is available`,
          };
        }

        const statusIcon = allocation.status === 'allocated' ? '🟢' : allocation.status === 'released' ? '🔴' : '🟡';

        let msg = `${statusIcon} Port ${port} Information:\n\n`;
        msg += `Service: ${allocation.service_name}\n`;
        msg += `Status: ${allocation.status}\n`;
        msg += `Environment: ${allocation.environment}\n`;
        if (allocation.description) {
          msg += `Description: ${allocation.description}\n`;
        }
        msg += `Allocated: ${allocation.allocated_at.toLocaleString()}\n`;

        if (allocation.status === 'released' && allocation.released_at) {
          msg += `Released: ${allocation.released_at.toLocaleString()}\n`;
        }

        return { success: true, message: msg };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `❌ Failed to check port: ${message}`,
        };
      }
    }

    case 'port-cleanup': {
      // Usage: /port-cleanup [--dry-run]
      const dryRun = args.includes('--dry-run');

      try {
        if (dryRun) {
          return {
            success: true,
            message:
              '🔍 Dry run mode: would remove stale allocations (released > 30 days ago)\n\n' +
              'Run `/port-cleanup` without --dry-run to perform cleanup.',
          };
        }

        const cleaned = await portDb.cleanupStaleAllocations();

        return {
          success: true,
          message: `✅ Cleaned up ${cleaned} stale port allocation(s)`,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `❌ Failed to cleanup ports: ${message}`,
        };
      }
    }

    case 'port-stats': {
      // Usage: /port-stats [environment]
      const environment = (args[0] as 'dev' | 'production' | 'test') || 'dev';

      if (!['dev', 'production', 'test'].includes(environment)) {
        return {
          success: false,
          message: '❌ Invalid environment. Use: dev, production, or test',
        };
      }

      try {
        const stats = await portDb.getPortRangeUtilization(environment);

        let msg = `📊 Port Range Statistics (${environment}):\n\n`;
        msg += `Total Ports: ${stats.total}\n`;
        msg += `Allocated: ${stats.allocated}\n`;
        msg += `Available: ${stats.available}\n`;
        msg += `Utilization: ${stats.utilizationPercent}%\n`;

        if (stats.utilizationPercent > 80) {
          msg += `\n⚠️ Warning: ${environment} port range is ${stats.utilizationPercent}% full!`;
        }

        return { success: true, message: msg };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          message: `❌ Failed to get stats: ${message}`,
        };
      }
    }

    // Docker Management Commands
    case 'docker-config': {
      // Usage: /docker-config [set|show|add-container] [args...]
      return await handleDockerConfigCommand(conversation.codebase_id, args);
    }

    case 'docker-status': {
      // Usage: /docker-status
      return await handleDockerStatusCommand(conversation.codebase_id);
    }

    case 'docker-logs': {
      // Usage: /docker-logs [container] [lines]
      return await handleDockerLogsCommand(conversation.codebase_id, args);
    }

    case 'docker-restart': {
      // Usage: /docker-restart [confirm]
      const confirmed = args[0]?.toLowerCase() === 'confirm';
      return await handleDockerRestartCommand(conversation.codebase_id, confirmed);
    }

    case 'docker-deploy': {
      // Usage: /docker-deploy [yes|confirm]
      const confirmed = args[0]?.toLowerCase() === 'yes' || args[0]?.toLowerCase() === 'confirm';
      return await handleDockerDeployCommand(conversation.codebase_id, confirmed);
    }

    // GCP Cloud Run commands
    case 'cloudrun-status': {
      // Usage: /cloudrun-status
      return await handleCloudRunStatusCommand(conversation.codebase_id);
    }

    case 'cloudrun-logs': {
      // Usage: /cloudrun-logs [lines]
      return await handleCloudRunLogsCommand(conversation.codebase_id, args);
    }

    case 'cloudrun-deploy': {
      // Usage: /cloudrun-deploy [yes]
      return await handleCloudRunDeployCommand(conversation.codebase_id, conversation.cwd, args);
    }

    case 'cloudrun-rollback': {
      // Usage: /cloudrun-rollback [revision]
      return await handleCloudRunRollbackCommand(conversation.codebase_id, args);
    }

    case 'cloudrun-config':
    case 'gcp-config': {
      // Usage: /cloudrun-config [action] [args...]
      // Alias: /gcp-config
      return await handleCloudRunConfigCommand(conversation.codebase_id, args);
    }

    case 'cloudrun-list': {
      // Usage: /cloudrun-list
      return await handleCloudRunListCommand(conversation.codebase_id);
    }

    case 'secret-set': {
      // Usage: /secret-set [--global] <key> <value>
      if (args.length < 2) {
        return {
          success: false,
          message:
            'Usage: /secret-set [--global] <key> <value>\n\n' +
            'Examples:\n' +
            '  /secret-set OPENAI_API_KEY sk-proj-...\n' +
            '  /secret-set --global GITHUB_TOKEN ghp_...',
        };
      }

      const isGlobal = args[0] === '--global';
      const keyIndex = isGlobal ? 1 : 0;
      const valueIndex = isGlobal ? 2 : 1;

      if (args.length < valueIndex + 1) {
        return {
          success: false,
          message: 'Error: Missing value. Usage: /secret-set [--global] <key> <value>',
        };
      }

      const key = args[keyIndex];
      const value = args.slice(valueIndex).join(' '); // Allow spaces in value
      const scope = isGlobal ? 'global' : 'project';

      const workspacePath = resolve(conversation.cwd ?? process.env.WORKSPACE_PATH ?? '/workspace');
      const projectName = getProjectName(workspacePath);

      try {
        await setSecret(projectName, key, value, scope);
        return {
          success: true,
          message: `✅ Secret ${key} saved to ${scope} scope\n\nPath: ~/.archon/.secrets/${scope === 'global' ? 'global.env' : `projects/${projectName}.env`}`,
        };
      } catch (error) {
        return {
          success: false,
          message: `❌ Failed to set secret: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    case 'secret-get': {
      // Usage: /secret-get <key>
      if (args.length < 1) {
        return {
          success: false,
          message: 'Usage: /secret-get <key>\n\nExample: /secret-get OPENAI_API_KEY',
        };
      }

      const key = args[0];
      const workspacePath = resolve(conversation.cwd ?? process.env.WORKSPACE_PATH ?? '/workspace');
      const projectName = getProjectName(workspacePath);

      try {
        const value = await getSecret(projectName, key);
        if (value === null) {
          return {
            success: false,
            message: `❌ Secret ${key} not found\n\nSet it with: /secret-set ${key} <value>`,
          };
        }

        // Mask sensitive values in display (show first 8 chars)
        const displayValue = value.length > 12 ? `${value.substring(0, 8)}...` : '***';

        return {
          success: true,
          message: `🔑 ${key}=${displayValue}\n\nFull value available in code via getSecret()`,
        };
      } catch (error) {
        return {
          success: false,
          message: `❌ Failed to get secret: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    case 'secret-list': {
      // Usage: /secret-list
      const workspacePath = resolve(conversation.cwd ?? process.env.WORKSPACE_PATH ?? '/workspace');
      const projectName = getProjectName(workspacePath);

      try {
        const secrets = await listSecrets(projectName);

        let message = '📋 Secrets List:\n\n';

        if (secrets.global.length > 0) {
          message += `**Global secrets** (${secrets.global.length}):\n`;
          secrets.global.forEach(key => {
            message += `  • ${key}\n`;
          });
          message += '\n';
        } else {
          message += '**Global secrets:** None\n\n';
        }

        if (secrets.project.length > 0) {
          message += `**Project secrets** (${secrets.project.length}) [${projectName}]:\n`;
          secrets.project.forEach(key => {
            message += `  • ${key}\n`;
          });
        } else {
          message += '**Project secrets:** None\n';
        }

        message += '\n💡 Use /secret-get <key> to view values';

        return {
          success: true,
          message,
        };
      } catch (error) {
        return {
          success: false,
          message: `❌ Failed to list secrets: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    case 'secret-sync': {
      // Usage: /secret-sync
      const workspacePath = resolve(conversation.cwd ?? process.env.WORKSPACE_PATH ?? '/workspace');
      const projectName = getProjectName(workspacePath);

      try {
        await syncSecrets(projectName, workspacePath);
        return {
          success: true,
          message:
            '✅ Secrets synced to .env.local\n\n' +
            `Path: ${workspacePath}/.env.local\n` +
            'Project secrets override global secrets.\n\n' +
            '💡 .env.local is automatically added to .gitignore',
        };
      } catch (error) {
        return {
          success: false,
          message: `❌ Failed to sync secrets: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    case 'secret-check': {
      // Usage: /secret-check <key1> <key2> ...
      if (args.length < 1) {
        return {
          success: false,
          message:
            'Usage: /secret-check <key1> [key2] ...\n\n' +
            'Example: /secret-check OPENAI_API_KEY ANTHROPIC_API_KEY',
        };
      }

      const workspacePath = resolve(conversation.cwd ?? process.env.WORKSPACE_PATH ?? '/workspace');
      const projectName = getProjectName(workspacePath);

      try {
        const result = await checkRequiredSecrets(projectName, args);

        let message = '🔍 Secret Check Results:\n\n';

        if (result.found.length > 0) {
          message += `✅ **Found** (${result.found.length}):\n`;
          result.found.forEach(key => {
            message += `  • ${key}\n`;
          });
          message += '\n';
        }

        if (result.missing.length > 0) {
          message += `❌ **Missing** (${result.missing.length}):\n`;
          result.missing.forEach(key => {
            message += `  • ${key}\n`;
          });
          message += '\n💡 Set missing secrets with: /secret-set <key> <value>';
        }

        return {
          success: result.missing.length === 0,
          message,
        };
      } catch (error) {
        return {
          success: false,
          message: `❌ Failed to check secrets: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    case 'secret-delete': {
      // Usage: /secret-delete [--global] <key>
      if (args.length < 1) {
        return {
          success: false,
          message:
            'Usage: /secret-delete [--global] <key>\n\n' +
            'Examples:\n' +
            '  /secret-delete OLD_API_KEY\n' +
            '  /secret-delete --global DEPRECATED_TOKEN',
        };
      }

      const isGlobal = args[0] === '--global';
      const keyIndex = isGlobal ? 1 : 0;

      if (args.length < keyIndex + 1) {
        return {
          success: false,
          message: 'Error: Missing key. Usage: /secret-delete [--global] <key>',
        };
      }

      const key = args[keyIndex];
      const scope = isGlobal ? 'global' : 'project';

      const workspacePath = resolve(conversation.cwd ?? process.env.WORKSPACE_PATH ?? '/workspace');
      const projectName = getProjectName(workspacePath);

      try {
        const deleted = await deleteSecret(projectName, key, scope);

        if (!deleted) {
          return {
            success: false,
            message: `❌ Secret ${key} not found in ${scope} scope`,
          };
        }

        return {
          success: true,
          message: `✅ Deleted secret ${key} from ${scope} scope`,
        };
      } catch (error) {
        return {
          success: false,
          message: `❌ Failed to delete secret: ${error instanceof Error ? error.message : String(error)}`,
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
