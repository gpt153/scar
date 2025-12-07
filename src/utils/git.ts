import { readFile, access, mkdir } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join, basename } from 'path';
import { homedir } from 'os';

const execFileAsync = promisify(execFile);

/**
 * Get the base directory for worktrees
 * Uses WORKTREE_BASE env var if set, otherwise defaults to sibling of repo
 */
export function getWorktreeBase(repoPath: string): string {
  const envBase = process.env.WORKTREE_BASE;
  if (envBase) {
    // Expand ~ to home directory using os.homedir() for cross-platform support
    if (envBase.startsWith('~')) {
      // Use join() to normalize path separators cross-platform
      const pathAfterTilde = envBase.slice(1).replace(/^[/\\]/, ''); // Remove leading ~ and any separator
      return join(homedir(), pathAfterTilde);
    }
    return envBase;
  }
  // Default: sibling to repo (original behavior)
  return join(repoPath, '..', 'worktrees');
}

/**
 * Check if a worktree already exists at the given path
 * A valid worktree has both the directory and a .git file/directory
 */
export async function worktreeExists(worktreePath: string): Promise<boolean> {
  try {
    await access(worktreePath);
    const gitPath = join(worktreePath, '.git');
    await access(gitPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all worktrees for a repository
 * Returns array of {path, branch} objects parsed from git worktree list --porcelain
 */
export async function listWorktrees(
  repoPath: string
): Promise<{ path: string; branch: string }[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'worktree', 'list', '--porcelain'],
      { timeout: 10000 }
    );

    const worktrees: { path: string; branch: string }[] = [];
    let currentPath = '';

    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.substring(9);
      } else if (line.startsWith('branch ')) {
        const branch = line.substring(7).replace('refs/heads/', '');
        if (currentPath) {
          worktrees.push({ path: currentPath, branch });
        }
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Find an existing worktree by branch name pattern
 * Useful for discovering skill-created worktrees when app receives GitHub event
 */
export async function findWorktreeByBranch(
  repoPath: string,
  branchPattern: string
): Promise<string | null> {
  const worktrees = await listWorktrees(repoPath);

  // Exact match first
  const exact = worktrees.find(wt => wt.branch === branchPattern);
  if (exact) return exact.path;

  // Partial match (e.g., "feature-auth" matches "feature/auth" after slugification)
  const slugified = branchPattern.replace(/\//g, '-');
  const partial = worktrees.find(
    wt => wt.branch.replace(/\//g, '-') === slugified || wt.branch === slugified
  );
  if (partial) return partial.path;

  return null;
}

/**
 * Check if a path is inside a git worktree (vs main repo)
 * Worktrees have a .git FILE, main repos have a .git DIRECTORY
 */
export async function isWorktreePath(path: string): Promise<boolean> {
  try {
    const gitPath = join(path, '.git');
    const content = await readFile(gitPath, 'utf-8');
    // Worktree .git file contains "gitdir: /path/to/main/.git/worktrees/..."
    return content.startsWith('gitdir:');
  } catch {
    return false;
  }
}

/**
 * Create a git worktree for an issue or PR
 * Returns the worktree path
 *
 * For PRs: provide prHeadBranch and optionally prHeadSha for reproducible reviews
 * For issues: creates a new branch (issue-XX)
 *
 * Will adopt existing worktrees if found (enables skill-app symbiosis)
 */
export async function createWorktreeForIssue(
  repoPath: string,
  issueNumber: number,
  isPR: boolean,
  prHeadBranch?: string,
  prHeadSha?: string
): Promise<string> {
  const branchName = isPR ? `pr-${String(issueNumber)}` : `issue-${String(issueNumber)}`;
  const projectName = basename(repoPath);
  const worktreeBase = getWorktreeBase(repoPath);
  const worktreePath = join(worktreeBase, projectName, branchName);

  // Check if worktree already exists at expected path (possibly created by skill)
  if (await worktreeExists(worktreePath)) {
    console.log(`[Git] Adopting existing worktree: ${worktreePath}`);
    return worktreePath;
  }

  // For PRs: also check if skill created a worktree with the PR's branch name
  if (isPR && prHeadBranch) {
    const existingByBranch = await findWorktreeByBranch(repoPath, prHeadBranch);
    if (existingByBranch) {
      console.log(`[Git] Adopting existing worktree for branch ${prHeadBranch}: ${existingByBranch}`);
      return existingByBranch;
    }
  }

  // Ensure worktree base directory exists
  const projectWorktreeDir = join(worktreeBase, projectName);
  await mkdir(projectWorktreeDir, { recursive: true });

  if (isPR && prHeadBranch) {
    // For PRs: fetch and checkout the PR's head branch
    try {
      // If SHA provided, use it for reproducible reviews (hybrid approach)
      if (prHeadSha) {
        // Fetch the specific commit SHA
        await execFileAsync('git', ['-C', repoPath, 'fetch', 'origin', prHeadSha], {
          timeout: 30000,
        });

        // Create worktree at the specific SHA
        await execFileAsync('git', ['-C', repoPath, 'worktree', 'add', worktreePath, prHeadSha], {
          timeout: 30000,
        });

        // Create a local tracking branch so it's not detached HEAD
        await execFileAsync('git', ['-C', worktreePath, 'checkout', '-b', `pr-${String(issueNumber)}-review`, prHeadSha], {
          timeout: 30000,
        });
      } else {
        // Fallback: fetch the PR's head branch from origin
        await execFileAsync('git', ['-C', repoPath, 'fetch', 'origin', prHeadBranch], {
          timeout: 30000,
        });

        // Create worktree using the fetched branch
        await execFileAsync('git', ['-C', repoPath, 'worktree', 'add', worktreePath, `origin/${prHeadBranch}`], {
          timeout: 30000,
        });
      }
    } catch (error) {
      const err = error as Error & { stderr?: string };
      throw new Error(`Failed to create worktree for PR branch '${prHeadBranch}': ${err.message}`);
    }
  } else {
    // For issues (or PRs without branch info): create new branch
    try {
      // Try to create with new branch
      await execFileAsync('git', ['-C', repoPath, 'worktree', 'add', worktreePath, '-b', branchName], {
        timeout: 30000,
      });
    } catch (error) {
      const err = error as Error & { stderr?: string };
      // Branch already exists - use existing branch
      if (err.stderr?.includes('already exists')) {
        await execFileAsync('git', ['-C', repoPath, 'worktree', 'add', worktreePath, branchName], {
          timeout: 30000,
        });
      } else {
        throw error;
      }
    }
  }

  return worktreePath;
}

/**
 * Remove a git worktree
 * Throws if uncommitted changes exist (git's natural guardrail)
 */
export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  await execFileAsync('git', ['-C', repoPath, 'worktree', 'remove', worktreePath], {
    timeout: 30000,
  });
}

/**
 * Get canonical repo path from a worktree path
 * If already canonical, returns the same path
 */
export async function getCanonicalRepoPath(path: string): Promise<string> {
  if (await isWorktreePath(path)) {
    // Read .git file to find main repo
    const gitPath = join(path, '.git');
    const content = await readFile(gitPath, 'utf-8');
    // gitdir: /path/to/repo/.git/worktrees/branch-name
    const match = /gitdir: (.+)\/\.git\/worktrees\//.exec(content);
    if (match) {
      return match[1];
    }
  }
  return path;
}
