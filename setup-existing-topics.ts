/**
 * Script to create Telegram topics for existing workspace projects
 */
import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { pool } from './src/db/connection';
import * as codebaseDb from './src/db/codebases';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';

const execFileAsync = promisify(execFile);

const GROUP_CHAT_ID = '-1003484800871';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const WORKSPACE = process.env.WORKSPACE_PATH || '/workspace';

interface ProjectInfo {
  name: string;
  path: string;
  githubUrl: string | null;
}

async function getGitHubUrl(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectPath, 'remote', 'get-url', 'origin']);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function setupProject(bot: Telegraf, project: ProjectInfo): Promise<void> {
  try {
    console.log(`\n[Setup] Processing: ${project.name}`);

    // 1. Check if codebase already exists
    const existingCodebases = await pool.query(
      'SELECT * FROM remote_agent_codebases WHERE name = $1',
      [project.name]
    );

    let codebaseId: string;

    if (existingCodebases.rows.length > 0) {
      console.log(`  ✓ Codebase already exists in database`);
      codebaseId = existingCodebases.rows[0].id;
    } else {
      // 2. Create codebase record
      console.log(`  → Creating codebase record...`);
      const codebase = await codebaseDb.createCodebase({
        name: project.name,
        repository_url: project.githubUrl || undefined,
        default_cwd: project.path,
        ai_assistant_type: 'claude',
      });
      codebaseId = codebase.id;
      console.log(`  ✓ Codebase created: ${codebaseId}`);
    }

    // 3. Create Telegram topic
    console.log(`  → Creating Telegram topic...`);
    const topic = await bot.telegram.createForumTopic(parseInt(GROUP_CHAT_ID), project.name);
    console.log(`  ✓ Topic created: ID ${String(topic.message_thread_id)}`);

    console.log(`\n✅ ${project.name} setup complete!`);
    console.log(`   📁 Codebase ID: ${codebaseId}`);
    console.log(`   💬 Topic ID: ${String(topic.message_thread_id)}`);
    console.log(`   🔗 GitHub: ${project.githubUrl || 'No remote'}`);
  } catch (error) {
    console.error(`\n❌ Failed to setup ${project.name}:`, error);
  }
}

async function main(): Promise<void> {
  console.log('🚀 Setting up Telegram topics for existing projects...\n');
  console.log(`Group Chat ID: ${GROUP_CHAT_ID}`);
  console.log(`Workspace: ${WORKSPACE}\n`);

  const bot = new Telegraf(BOT_TOKEN);

  const projects: ProjectInfo[] = [
    {
      name: 'health-agent',
      path: resolve(WORKSPACE, 'health-agent'),
      githubUrl: await getGitHubUrl(resolve(WORKSPACE, 'health-agent')),
    },
    {
      name: 'mindmap-planner',
      path: resolve(WORKSPACE, 'mindmap-planner'),
      githubUrl: await getGitHubUrl(resolve(WORKSPACE, 'mindmap-planner')),
    },
    {
      name: 'openhorizon.cc',
      path: resolve(WORKSPACE, 'openhorizon.cc'),
      githubUrl: await getGitHubUrl(resolve(WORKSPACE, 'openhorizon.cc')),
    },
    {
      name: 'persona-agent-system',
      path: resolve(WORKSPACE, 'persona-agent-system'),
      githubUrl: await getGitHubUrl(resolve(WORKSPACE, 'persona-agent-system')),
    },
  ];

  for (const project of projects) {
    await setupProject(bot, project);
  }

  console.log('\n✨ All projects setup complete!\n');
  await pool.end();
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
