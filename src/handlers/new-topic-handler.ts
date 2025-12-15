/**
 * Handler for /new-topic command
 * Creates complete project scaffolding: GitHub repo + workspace + Archon project + Telegram topic
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, cp } from 'fs/promises';
import { join, resolve } from 'path';
import { Telegraf } from 'telegraf';
import { createRepository } from '../utils/github-repo';
import * as codebaseDb from '../db/codebases';

const execFileAsync = promisify(execFile);

export interface NewTopicOptions {
  projectName: string;
  groupChatId: string;
  githubToken: string;
  workspacePath: string;
  bot: Telegraf;
}

export interface NewTopicResult {
  success: boolean;
  message: string;
  topicId?: number;
  codebaseId?: string;
}

/**
 * Convert project name to URL-safe format
 * "Github search agent" → "github-search-agent"
 */
function sanitizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Copy template structure to new project
 * Includes .claude/, .agents/, and CLAUDE.md
 */
async function copyTemplateStructure(
  repoPath: string,
  metadata: {
    projectName: string;
    githubUrl: string;
    archonProjectId: string;
  }
): Promise<void> {
  const templateDir = resolve(__dirname, '../../.template');

  // Copy .claude/ directory
  console.log('[NewTopic] Copying .claude/ directory...');
  await cp(join(templateDir, '.claude'), join(repoPath, '.claude'), {
    recursive: true,
  });

  // Copy .agents/ directory
  console.log('[NewTopic] Copying .agents/ directory...');
  await cp(join(templateDir, '.agents'), join(repoPath, '.agents'), {
    recursive: true,
  });

  // Create customized CLAUDE.md
  console.log('[NewTopic] Creating CLAUDE.md...');
  const templatePath = join(templateDir, 'CLAUDE.md');
  const { readFile } = await import('fs/promises');
  const template = await readFile(templatePath, 'utf-8');

  const customized = template
    .replace(/\{\{PROJECT_NAME\}\}/g, metadata.projectName)
    .replace(/\{\{GITHUB_URL\}\}/g, metadata.githubUrl)
    .replace(/\{\{ARCHON_PROJECT_ID\}\}/g, metadata.archonProjectId)
    .replace(/\{\{WORKSPACE_PATH\}\}/g, repoPath)
    .replace(
      /\{\{PROJECT_DESCRIPTION\}\}/g,
      `${metadata.projectName} - Created via Remote Coding Agent`
    )
    .replace(/\{\{CUSTOM_NOTES\}\}/g, 'Add project-specific notes here.');

  await writeFile(join(repoPath, 'CLAUDE.md'), customized, 'utf-8');
}

/**
 * Create README.md with project metadata
 */
async function createProjectReadme(
  workspacePath: string,
  metadata: {
    projectName: string;
    githubUrl: string;
    archonProjectId: string;
    workspacePath: string;
  }
): Promise<void> {
  const content = `# ${metadata.projectName}

## Project Information

- **GitHub Repository**: ${metadata.githubUrl}
- **Archon Project ID**: ${metadata.archonProjectId}
- **Workspace Path**: ${metadata.workspacePath}
- **Created**: ${new Date().toISOString()}

## Getting Started

This project was created via the Remote Coding Agent Telegram bot.

Use the dedicated Telegram topic to interact with the AI assistant for this project.
`;

  await writeFile(join(workspacePath, 'README.md'), content, 'utf-8');
}

/**
 * Execute /new-topic command workflow
 */
export async function handleNewTopic(options: NewTopicOptions): Promise<NewTopicResult> {
  const { projectName, groupChatId, githubToken, workspacePath, bot } = options;

  try {
    // 1. Sanitize project name
    const repoName = sanitizeProjectName(projectName);
    if (!repoName) {
      return {
        success: false,
        message: 'Invalid project name. Use alphanumeric characters and spaces.',
      };
    }

    // 2. Create GitHub repository (private, with README)
    console.log(`[NewTopic] Creating GitHub repo: ${repoName}`);
    const repo = await createRepository(githubToken, {
      name: repoName,
      description: `${projectName} - Created via Remote Coding Agent`,
      private: true,
      autoInit: true, // Initialize with README
    });

    // 3. Clone repository to workspace
    console.log(`[NewTopic] Cloning to workspace: ${workspacePath}`);
    const repoPath = join(workspacePath, repoName);
    await execFileAsync('git', ['clone', repo.cloneUrl, repoPath]);

    // 4. Create Archon project
    // Note: MCP tools are not directly accessible from handlers
    // The orchestrator/AI can create the Archon project separately
    // For now, use a placeholder ID that can be updated later
    console.log('[NewTopic] Archon project creation - to be handled by AI');
    const archonProjectId = `pending-${Date.now()}`;

    // 5. Copy template structure (.claude/, .agents/, CLAUDE.md)
    console.log('[NewTopic] Copying template structure...');
    await copyTemplateStructure(repoPath, {
      projectName,
      githubUrl: repo.htmlUrl,
      archonProjectId,
    });

    // 6. Update README with metadata
    console.log('[NewTopic] Updating README with metadata');
    await createProjectReadme(repoPath, {
      projectName,
      githubUrl: repo.htmlUrl,
      archonProjectId,
      workspacePath: repoPath,
    });

    // 7. Commit all changes (template + README)
    await execFileAsync('git', ['-C', repoPath, 'add', '.']);
    await execFileAsync('git', [
      '-C',
      repoPath,
      'commit',
      '-m',
      'Add project template and metadata',
    ]);
    await execFileAsync('git', ['-C', repoPath, 'push']);

    // 8. Create codebase record in database
    console.log('[NewTopic] Creating codebase record');
    const codebase = await codebaseDb.createCodebase({
      name: projectName,
      repository_url: repo.htmlUrl,
      default_cwd: repoPath,
      ai_assistant_type: process.env.DEFAULT_AI_ASSISTANT ?? 'claude',
    });

    // 9. Create Telegram topic
    console.log('[NewTopic] Creating Telegram topic');
    const topic = await bot.telegram.createForumTopic(parseInt(groupChatId), projectName);

    return {
      success: true,
      message: `✅ Project "${projectName}" created successfully!

📁 **Codebase**: ${projectName}
📂 **Path**: ${repoPath}
🔗 **GitHub**: ${repo.htmlUrl}
📊 **Archon Project**: ${archonProjectId} (to be created)
💬 **Telegram Topic**: Created (ID: ${String(topic.message_thread_id)})

Switch to the new topic to start working!`,
      topicId: topic.message_thread_id,
      codebaseId: codebase.id,
    };
  } catch (error) {
    const err = error as Error;
    console.error('[NewTopic] Error:', err);
    return {
      success: false,
      message: `❌ Failed to create project: ${err.message}`,
    };
  }
}
