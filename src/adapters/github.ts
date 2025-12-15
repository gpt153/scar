/**
 * GitHub platform adapter using Octokit REST API and Webhooks
 * Handles issue and PR comments with @mention detection
 */
import { Octokit } from '@octokit/rest';
import { createHmac, timingSafeEqual } from 'crypto';
import { IPlatformAdapter } from '../types';
import { handleMessage } from '../orchestrator/orchestrator';
import { classifyAndFormatError } from '../utils/error-formatter';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, access } from 'fs/promises';
import { join, resolve } from 'path';
import { parseAllowedUsers, isGitHubUserAuthorized } from '../utils/github-auth';
import { isWorktreePath, createWorktreeForIssue, removeWorktree } from '../utils/git';
import { getLinkedIssueNumbers } from '../utils/github-graphql';

const execAsync = promisify(exec);

interface WebhookEvent {
  action: string;
  issue?: {
    number: number;
    title: string;
    body: string | null;
    user: { login: string };
    labels: { name: string }[];
    state: string;
    pull_request?: { url: string }; // Present if the issue is actually a PR
  };
  pull_request?: {
    number: number;
    title: string;
    body: string | null;
    user: { login: string };
    state: string;
    changed_files?: number;
    additions?: number;
    deletions?: number;
  };
  comment?: {
    body: string;
    user: { login: string };
  };
  repository: {
    owner: { login: string };
    name: string;
    full_name: string;
    html_url: string;
    default_branch: string;
  };
  sender: { login: string };
}

export class GitHubAdapter implements IPlatformAdapter {
  private octokit: Octokit;
  private webhookSecret: string;
  private allowedUsers: string[];
  private botMention: string;

  constructor(token: string, webhookSecret: string, botMention?: string) {
    this.octokit = new Octokit({ auth: token });
    this.webhookSecret = webhookSecret;
    this.botMention = botMention ?? 'remote-agent';

    // Parse GitHub user whitelist (optional - empty = open access)
    this.allowedUsers = parseAllowedUsers(process.env.GITHUB_ALLOWED_USERS);
    if (this.allowedUsers.length > 0) {
      console.log(`[GitHub] User whitelist enabled (${this.allowedUsers.length} users)`);
    } else {
      console.log('[GitHub] User whitelist disabled (open access)');
    }

    console.log('[GitHub] Adapter initialized with secret:', webhookSecret.substring(0, 8) + '...');
    console.log('[GitHub] Bot mention configured as:', this.botMention);
  }

  /**
   * Check if an error is retryable (transient network issues)
   */
  private isRetryableError(error: unknown): boolean {
    const err = error as Error | undefined;
    const message = err?.message ?? '';
    const causeErr = (error as { cause?: Error }).cause;
    const cause = causeErr?.message ?? '';
    const combined = `${message} ${cause}`.toLowerCase();

    // Retry on transient network errors
    return (
      combined.includes('timeout') ||
      combined.includes('econnrefused') ||
      combined.includes('econnreset') ||
      combined.includes('etimedout') ||
      combined.includes('fetch failed')
    );
  }

  /**
   * Send a message to a GitHub issue or PR
   * Includes retry logic for transient network failures
   */
  async sendMessage(conversationId: string, message: string): Promise<void> {
    const parsed = this.parseConversationId(conversationId);
    if (!parsed) {
      console.error('[GitHub] Invalid conversationId:', conversationId);
      return;
    }

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.octokit.rest.issues.createComment({
          owner: parsed.owner,
          repo: parsed.repo,
          issue_number: parsed.number,
          body: message,
        });
        console.log(`[GitHub] Comment posted to ${conversationId}`);
        return;
      } catch (error) {
        const isRetryable = this.isRetryableError(error);
        if (attempt < maxRetries && isRetryable) {
          const delay = 1000 * attempt;
          console.log(
            `[GitHub] Retry ${String(attempt)}/${String(maxRetries)} for ${conversationId} (waiting ${String(delay)}ms)`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        console.error('[GitHub] Failed to post comment:', { error, conversationId });
        return;
      }
    }
  }

  /**
   * Get streaming mode (always batch for GitHub to avoid comment spam)
   */
  getStreamingMode(): 'batch' {
    return 'batch';
  }

  /**
   * Get platform type
   */
  getPlatformType(): string {
    return 'github';
  }

  /**
   * Start the adapter (no-op for webhook-based adapter)
   */
  async start(): Promise<void> {
    console.log('[GitHub] Webhook adapter ready');
  }

  /**
   * Stop the adapter (no-op for webhook-based adapter)
   */
  stop(): void {
    console.log('[GitHub] Adapter stopped');
  }

  /**
   * Verify webhook signature using HMAC SHA-256
   */
  private verifySignature(payload: string, signature: string): boolean {
    try {
      const hmac = createHmac('sha256', this.webhookSecret);
      const digest = 'sha256=' + hmac.update(payload).digest('hex');

      const digestBuffer = Buffer.from(digest);
      const signatureBuffer = Buffer.from(signature);

      if (digestBuffer.length !== signatureBuffer.length) {
        console.error('[GitHub] Signature length mismatch:', {
          receivedLength: signatureBuffer.length,
          computedLength: digestBuffer.length,
        });
        return false;
      }

      const isValid = timingSafeEqual(digestBuffer, signatureBuffer);

      if (!isValid) {
        console.error('[GitHub] Signature mismatch:', {
          received: signature.substring(0, 15) + '...',
          computed: digest.substring(0, 15) + '...',
          secretLength: this.webhookSecret.length,
        });
      }

      return isValid;
    } catch (error) {
      console.error('[GitHub] Signature verification error:', error);
      return false;
    }
  }

  /**
   * Parse webhook event and extract relevant data
   */
  private parseEvent(event: WebhookEvent): {
    owner: string;
    repo: string;
    number: number;
    comment: string;
    eventType: 'issue' | 'issue_comment' | 'pull_request';
    issue?: WebhookEvent['issue'];
    pullRequest?: WebhookEvent['pull_request'];
    isCloseEvent?: boolean;
  } | null {
    const owner = event.repository.owner.login;
    const repo = event.repository.name;

    // Detect issue closed
    if (event.issue && event.action === 'closed') {
      return {
        owner,
        repo,
        number: event.issue.number,
        comment: '',
        eventType: 'issue',
        issue: event.issue,
        isCloseEvent: true,
      };
    }

    // Detect PR merged/closed
    if (event.pull_request && event.action === 'closed') {
      return {
        owner,
        repo,
        number: event.pull_request.number,
        comment: '',
        eventType: 'pull_request',
        pullRequest: event.pull_request,
        isCloseEvent: true,
      };
    }

    // issue_comment (covers both issues and PRs)
    if (event.comment) {
      const number = event.issue?.number ?? event.pull_request?.number;
      if (!number) return null;
      return {
        owner,
        repo,
        number,
        comment: event.comment.body,
        eventType: 'issue_comment',
        issue: event.issue,
        pullRequest: event.pull_request,
      };
    }

    // issues.opened
    if (event.issue && event.action === 'opened') {
      return {
        owner,
        repo,
        number: event.issue.number,
        comment: event.issue.body ?? '',
        eventType: 'issue',
        issue: event.issue,
      };
    }

    // pull_request.opened
    if (event.pull_request && event.action === 'opened') {
      return {
        owner,
        repo,
        number: event.pull_request.number,
        comment: event.pull_request.body ?? '',
        eventType: 'pull_request',
        pullRequest: event.pull_request,
      };
    }

    return null;
  }

  /**
   * Check if text contains @mention for the configured bot
   */
  private hasMention(text: string): boolean {
    const pattern = new RegExp(`@${this.botMention}[\\s,:;]`, 'i');
    return pattern.test(text) || text.trim().toLowerCase() === `@${this.botMention.toLowerCase()}`;
  }

  /**
   * Strip @mention from text for the configured bot
   */
  private stripMention(text: string): string {
    const pattern = new RegExp(`@${this.botMention}[\\s,:;]+`, 'gi');
    return text.replace(pattern, '').trim();
  }

  /**
   * Build conversationId from owner, repo, and number
   */
  private buildConversationId(owner: string, repo: string, number: number): string {
    return `${owner}/${repo}#${String(number)}`;
  }

  /**
   * Parse conversationId into owner, repo, and number
   */
  private parseConversationId(
    conversationId: string
  ): { owner: string; repo: string; number: number } | null {
    const regex = /^([^/]+)\/([^#]+)#(\d+)$/;
    const match = regex.exec(conversationId);
    if (!match) return null;
    return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
  }

  /**
   * Ensure repository is cloned and ready
   * For new conversations: clone or sync
   * For existing conversations: skip
   */
  private async ensureRepoReady(
    owner: string,
    repo: string,
    defaultBranch: string,
    repoPath: string,
    shouldSync: boolean
  ): Promise<void> {
    try {
      await access(repoPath);
      if (shouldSync) {
        console.log('[GitHub] Syncing repository');
        await execAsync(
          `cd ${repoPath} && git fetch origin && git reset --hard origin/${defaultBranch}`
        );
      }
    } catch {
      console.log(`[GitHub] Cloning repository to ${repoPath}`);
      const ghToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
      const repoUrl = `https://github.com/${owner}/${repo}.git`;
      let cloneCommand = `git clone ${repoUrl} ${repoPath}`;

      if (ghToken) {
        const authenticatedUrl = `https://${ghToken}@github.com/${owner}/${repo}.git`;
        cloneCommand = `git clone ${authenticatedUrl} ${repoPath}`;
      }

      await execAsync(cloneCommand);
      await execAsync(`git config --global --add safe.directory '${repoPath}'`);
    }
  }

  /**
   * Auto-detect and load commands from .claude/commands or .agents/commands
   */
  private async autoDetectAndLoadCommands(repoPath: string, codebaseId: string): Promise<void> {
    const commandFolders = ['.claude/commands', '.agents/commands'];

    for (const folder of commandFolders) {
      try {
        const fullPath = join(repoPath, folder);
        await access(fullPath);

        const files = (await readdir(fullPath)).filter(f => f.endsWith('.md'));
        if (files.length === 0) continue;

        const commands = await codebaseDb.getCodebaseCommands(codebaseId);
        files.forEach(file => {
          commands[file.replace('.md', '')] = {
            path: join(folder, file),
            description: `From ${folder}`,
          };
        });

        await codebaseDb.updateCodebaseCommands(codebaseId, commands);
        console.log(`[GitHub] Loaded ${String(files.length)} commands from ${folder}`);
        return;
      } catch {
        continue;
      }
    }
  }

  /**
   * Get or create codebase for repository
   * Returns: codebase record, path to use, and whether it's new
   * Always uses canonical path (not worktree paths) for codebase registration
   */
  private async getOrCreateCodebaseForRepo(
    owner: string,
    repo: string
  ): Promise<{
    codebase: { id: string; name: string; default_cwd: string };
    repoPath: string;
    isNew: boolean;
  }> {
    // Try both with and without .git suffix to match existing clones
    const repoUrlNoGit = `https://github.com/${owner}/${repo}`;
    const repoUrlWithGit = `${repoUrlNoGit}.git`;

    let existing = await codebaseDb.findCodebaseByRepoUrl(repoUrlNoGit);
    existing ??= await codebaseDb.findCodebaseByRepoUrl(repoUrlWithGit);

    // Canonical path is always $WORKSPACE_PATH/{repo}
    const canonicalPath = join(resolve(process.env.WORKSPACE_PATH ?? '/workspace'), repo);

    if (existing) {
      // Check if existing codebase points to a worktree path - fix it if so
      // Either it's an actual worktree, or it looks like one (contains /worktrees/ in path)
      const looksLikeWorktreePath = existing.default_cwd.includes('/worktrees/');
      if (looksLikeWorktreePath || (await isWorktreePath(existing.default_cwd))) {
        console.log(`[GitHub] Fixing stale worktree path for codebase: ${existing.name}`);
        await codebaseDb.updateCodebase(existing.id, { default_cwd: canonicalPath });
        existing.default_cwd = canonicalPath;
      }

      console.log(`[GitHub] Using existing codebase: ${existing.name} at ${existing.default_cwd}`);
      return { codebase: existing, repoPath: existing.default_cwd, isNew: false };
    }

    // Use just the repo name (not owner-repo) to match /clone behavior
    // resolve() converts relative paths to absolute (cross-platform)
    const codebase = await codebaseDb.createCodebase({
      name: repo,
      repository_url: repoUrlNoGit, // Store without .git for consistency
      default_cwd: canonicalPath,
    });

    console.log(`[GitHub] Created new codebase: ${codebase.name} at ${canonicalPath}`);
    return { codebase, repoPath: canonicalPath, isNew: true };
  }

  /**
   * Clean up worktree when an issue/PR is closed
   * Handles shared worktrees: only removes if no other conversations reference it
   */
  private async cleanupWorktree(owner: string, repo: string, number: number): Promise<void> {
    const conversationId = this.buildConversationId(owner, repo, number);
    const conversation = await db.getConversationByPlatformId('github', conversationId);

    if (!conversation?.worktree_path) {
      console.log(`[GitHub] No worktree to cleanup for ${conversationId}`);
      return;
    }

    // Deactivate any active session for this conversation
    // This prevents resume attempts with a stale cwd
    const activeSession = await sessionDb.getActiveSession(conversation.id);
    if (activeSession) {
      await sessionDb.deactivateSession(activeSession.id);
      console.log(`[GitHub] Deactivated session ${activeSession.id} for worktree cleanup`);
    }

    const { codebase } = await this.getOrCreateCodebaseForRepo(owner, repo);
    const worktreePath = conversation.worktree_path;

    // Clear worktree path from THIS conversation first
    // This must happen before checking for other users of the worktree
    await db.updateConversation(conversation.id, {
      worktree_path: null,
      cwd: codebase.default_cwd,
    });

    // Check if any OTHER conversations still use this worktree (shared worktree case)
    const otherConv = await db.getConversationByWorktreePath(worktreePath);
    if (otherConv) {
      console.log(
        `[GitHub] Keeping worktree ${worktreePath}, still used by ${otherConv.platform_conversation_id}`
      );
      console.log(`[GitHub] Cleanup complete for ${conversationId}`);
      return;
    }

    // No other conversations use this worktree - safe to remove
    try {
      await removeWorktree(codebase.default_cwd, worktreePath);
      console.log(`[GitHub] Removed worktree: ${worktreePath}`);
    } catch (error) {
      const err = error as Error;
      // Handle already-deleted worktree gracefully (e.g., manual cleanup)
      if (err.message.includes('is not a working tree')) {
        console.log(`[GitHub] Worktree already removed: ${worktreePath}`);
      } else {
        console.error('[GitHub] Failed to remove worktree:', error);
        // Notify user about orphaned worktree (likely has uncommitted changes)
        const hasUncommittedChanges = err.message.includes('contains modified or untracked files');
        if (hasUncommittedChanges) {
          await this.sendMessage(
            conversationId,
            `Warning: Could not remove worktree at \`${worktreePath}\` because it contains uncommitted changes. You may want to manually commit or discard these changes.`
          );
        }
      }
    }

    console.log(`[GitHub] Cleanup complete for ${conversationId}`);
  }

  /**
   * Build context-rich message for issue
   */
  private buildIssueContext(issue: WebhookEvent['issue'], userComment: string): string {
    if (!issue) return userComment;
    const labels = issue.labels.map(l => l.name).join(', ');

    return `[GitHub Issue Context]
Issue #${String(issue.number)}: "${issue.title}"
Author: ${issue.user.login}
Labels: ${labels}
Status: ${issue.state}

Description:
${issue.body ?? ''}

---

${userComment}`;
  }

  /**
   * Build context-rich message for pull request
   */
  private buildPRContext(pr: WebhookEvent['pull_request'], userComment: string): string {
    if (!pr) return userComment;
    const stats = pr.changed_files
      ? `Changed files: ${String(pr.changed_files)} (+${String(pr.additions ?? 0)}, -${String(pr.deletions ?? 0)})`
      : '';

    return `[GitHub Pull Request Context]
PR #${String(pr.number)}: "${pr.title}"
Author: ${pr.user.login}
Status: ${pr.state}
${stats}

Description:
${pr.body ?? ''}

Use 'gh pr diff ${String(pr.number)}' to see detailed changes.

---

${userComment}`;
  }

  /**
   * Handle incoming webhook event
   */
  async handleWebhook(payload: string, signature: string): Promise<void> {
    // 1. Verify signature
    if (!this.verifySignature(payload, signature)) {
      console.error('[GitHub] Invalid webhook signature');
      return;
    }

    // 2. Parse event
    const event = JSON.parse(payload) as WebhookEvent;

    // 2b. Authorization check - verify sender is in whitelist
    const senderUsername = event.sender?.login;
    if (!isGitHubUserAuthorized(senderUsername, this.allowedUsers)) {
      // Log unauthorized attempt (mask username for privacy)
      const maskedUser = senderUsername ? `${senderUsername.slice(0, 3)}***` : 'unknown';
      console.log(`[GitHub] Unauthorized webhook from user ${maskedUser}`);
      return; // Silent rejection - no error response
    }

    const parsed = this.parseEvent(event);
    if (!parsed) return;

    const { owner, repo, number, comment, eventType, issue, pullRequest, isCloseEvent } = parsed;

    // 3. Handle close/merge events (cleanup worktree)
    if (isCloseEvent) {
      console.log(`[GitHub] Handling close event for ${owner}/${repo}#${String(number)}`);
      await this.cleanupWorktree(owner, repo, number);
      return; // Don't process as a message
    }

    // 4. Check @mention
    if (!this.hasMention(comment)) return;

    console.log(`[GitHub] Processing ${eventType}: ${owner}/${repo}#${String(number)}`);

    // 4. Build conversationId
    const conversationId = this.buildConversationId(owner, repo, number);

    // 5. Check if new conversation
    const existingConv = await db.getOrCreateConversation('github', conversationId);
    const isNewConversation = !existingConv.codebase_id;

    // 6. Get/create codebase (checks for existing first!)
    const {
      codebase,
      repoPath,
      isNew: isNewCodebase,
    } = await this.getOrCreateCodebaseForRepo(owner, repo);

    // 7. Get default branch
    const { data: repoData } = await this.octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch;

    // 8. Ensure repo ready (clone if needed, sync if new conversation)
    await this.ensureRepoReady(owner, repo, defaultBranch, repoPath, isNewConversation);

    // 9. Auto-load commands if new codebase
    if (isNewCodebase) {
      await this.autoDetectAndLoadCommands(repoPath, codebase.id);
    }

    // 10. Create worktree for this issue/PR (if conversation doesn't have one)
    let worktreePath: string | null = null;
    let prHeadBranch: string | undefined;
    let prHeadSha: string | undefined;
    // Detect PR: either pull_request event, or issue_comment on a PR (indicated by issue.pull_request or pullRequest)
    const isPR = eventType === 'pull_request' || !!pullRequest || !!issue?.pull_request;
    if (!existingConv.worktree_path) {
      // For PRs: Check if this PR is linked to an existing issue with a worktree
      if (isPR) {
        const linkedIssues = await getLinkedIssueNumbers(owner, repo, number);

        for (const issueNum of linkedIssues) {
          // Check if the linked issue has a worktree we can reuse
          const issueConvId = this.buildConversationId(owner, repo, issueNum);
          const issueConv = await db.getConversationByPlatformId('github', issueConvId);

          if (issueConv?.worktree_path) {
            // Reuse the issue's worktree
            worktreePath = issueConv.worktree_path;
            console.log(
              `[GitHub] PR #${String(number)} linked to issue #${String(issueNum)}, sharing worktree: ${worktreePath}`
            );

            // Update this conversation to use the shared worktree
            await db.updateConversation(existingConv.id, {
              codebase_id: codebase.id,
              cwd: worktreePath,
              worktree_path: worktreePath,
            });
            break; // Use first found worktree
          }
        }
      }

      // If no shared worktree found, create new one
      if (!worktreePath) {
        try {
          // For PRs, fetch the head branch name and SHA from GitHub API
          if (isPR) {
            try {
              const { data: prData } = await this.octokit.rest.pulls.get({
                owner,
                repo,
                pull_number: number,
              });
              prHeadBranch = prData.head.ref;
              prHeadSha = prData.head.sha;
              console.log(
                `[GitHub] PR #${String(number)} head branch: ${prHeadBranch}, SHA: ${prHeadSha}`
              );
            } catch (error) {
              console.warn(
                '[GitHub] Failed to fetch PR head branch, will create new branch instead:',
                error
              );
            }
          }

          worktreePath = await createWorktreeForIssue(
            repoPath,
            number,
            isPR,
            prHeadBranch,
            prHeadSha
          );
          console.log(`[GitHub] Created worktree: ${worktreePath}`);

          // Update conversation with worktree path
          await db.updateConversation(existingConv.id, {
            codebase_id: codebase.id,
            cwd: worktreePath,
            worktree_path: worktreePath,
          });
        } catch (error) {
          const err = error as Error;
          console.error('[GitHub] Failed to create worktree:', error);
          const branchName = isPR ? `pr-${String(number)}` : `issue-${String(number)}`;
          await this.sendMessage(
            conversationId,
            `Failed to create isolated worktree for branch \`${branchName}\`. This may be due to a branch name conflict or filesystem issue.\n\nError: ${err.message}\n\nPlease resolve the issue and try again.`
          );
          return; // Don't continue without isolation
        }
      }
    } else {
      // Conversation already has a worktree, use it
      worktreePath = existingConv.worktree_path;
    }

    // 11. Build message with context
    const strippedComment = this.stripMention(comment);
    let finalMessage = strippedComment;
    let contextToAppend: string | undefined;

    // IMPORTANT: Slash commands must be processed deterministically (not by AI)
    // Extract only the first line if it's a slash command
    const isSlashCommand = strippedComment.trim().startsWith('/');
    const isCommandInvoke = strippedComment.trim().startsWith('/command-invoke');

    if (isSlashCommand) {
      // For slash commands, use only the first line to avoid mixing commands with instructions
      const firstLine = strippedComment.split('\n')[0].trim();
      finalMessage = firstLine;
      console.log(`[GitHub] Processing slash command: ${firstLine}`);

      // For /command-invoke, pass just the issue/PR number (not full description)
      // This avoids tempting the AI to implement before planning
      if (isCommandInvoke) {
        const activeSession = await sessionDb.getActiveSession(existingConv.id);
        const isFirstCommandInvoke = !activeSession;

        if (isFirstCommandInvoke) {
          console.log('[GitHub] Adding issue/PR reference for first /command-invoke');
          if (eventType === 'issue' && issue) {
            contextToAppend = `GitHub Issue #${String(issue.number)}: "${issue.title}"\nUse 'gh issue view ${String(issue.number)}' for full details if needed.`;
          } else if (eventType === 'issue_comment' && issue) {
            contextToAppend = `GitHub Issue #${String(issue.number)}: "${issue.title}"\nUse 'gh issue view ${String(issue.number)}' for full details if needed.`;
          } else if (eventType === 'pull_request' && pullRequest) {
            contextToAppend = `GitHub Pull Request #${String(pullRequest.number)}: "${pullRequest.title}"\nUse 'gh pr view ${String(pullRequest.number)}' for full details if needed.`;
          } else if (eventType === 'issue_comment' && pullRequest) {
            contextToAppend = `GitHub Pull Request #${String(pullRequest.number)}: "${pullRequest.title}"\nUse 'gh pr view ${String(pullRequest.number)}' for full details if needed.`;
          }
        }
      }
    } else {
      // For non-command messages, always add issue/PR context
      // Router needs this context to understand what the user is asking about
      if (eventType === 'issue' && issue) {
        finalMessage = this.buildIssueContext(issue, strippedComment);
      } else if (eventType === 'issue_comment' && issue) {
        finalMessage = this.buildIssueContext(issue, strippedComment);
      } else if (eventType === 'pull_request' && pullRequest) {
        finalMessage = this.buildPRContext(pullRequest, strippedComment);
      } else if (eventType === 'issue_comment' && pullRequest) {
        finalMessage = this.buildPRContext(pullRequest, strippedComment);
      }
    }

    // Add worktree context if working in an isolated branch
    if (worktreePath) {
      // Use the actual PR head branch name if available, otherwise use the worktree naming convention
      const branchName =
        isPR && prHeadBranch
          ? prHeadBranch
          : isPR
            ? `pr-${String(number)}`
            : `issue-${String(number)}`;
      let worktreeContext: string;

      if (isPR && prHeadBranch && prHeadSha) {
        // SHA-based PR review - show commit SHA for reproducibility
        const shortSha = prHeadSha.substring(0, 7);
        worktreeContext = `\n\n[Working in isolated worktree at commit ${shortSha} (PR #${String(number)} branch: ${branchName}). This is the exact commit that triggered the review for reproducibility.]`;
      } else if (isPR && prHeadBranch) {
        // Branch-based PR review (fallback)
        worktreeContext = `\n\n[Working in isolated worktree with PR branch: ${branchName}. This is the actual PR branch with all changes.]`;
      } else {
        // Issue workflow
        worktreeContext = `\n\n[Working in isolated branch: ${branchName}. When done, changes can be committed and pushed, then a PR can be created from this branch.]`;
      }

      contextToAppend = contextToAppend ? contextToAppend + worktreeContext : worktreeContext;
    }

    // 12. Route to orchestrator
    try {
      await handleMessage(this, conversationId, finalMessage, contextToAppend);
    } catch (error) {
      const err = error as Error;
      console.error('[GitHub] Message handling error:', error);
      const userMessage = classifyAndFormatError(err);
      await this.sendMessage(conversationId, userMessage);
    }
  }
}
