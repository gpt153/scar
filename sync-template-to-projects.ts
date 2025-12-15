#!/usr/bin/env tsx
/**
 * Sync template structure to existing projects
 * Updates all workspace projects with the latest .claude/ and .agents/ structure
 */
import { readdir, cp, stat, access } from 'fs/promises';
import { join, resolve } from 'path';

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || '/workspace';
const TEMPLATE_DIR = resolve(__dirname, '.template');

interface SyncResult {
  project: string;
  synced: boolean;
  error?: string;
}

/**
 * Check if a directory exists
 */
async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a git repository
 */
async function isGitRepo(path: string): Promise<boolean> {
  try {
    await access(join(path, '.git'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Sync template structure to a single project
 */
async function syncProject(projectPath: string): Promise<void> {
  console.log(`  - Syncing .claude/commands...`);
  await cp(join(TEMPLATE_DIR, '.claude/commands'), join(projectPath, '.claude/commands'), {
    recursive: true,
    force: true, // Overwrite existing files
  });

  console.log(`  - Syncing .claude/PRPs...`);
  await cp(join(TEMPLATE_DIR, '.claude/PRPs'), join(projectPath, '.claude/PRPs'), {
    recursive: true,
    force: true,
  });

  console.log(`  - Syncing .claude/settings.json...`);
  await cp(join(TEMPLATE_DIR, '.claude/settings.json'), join(projectPath, '.claude/settings.json'));

  console.log(`  - Syncing .agents/commands...`);
  await cp(join(TEMPLATE_DIR, '.agents/commands'), join(projectPath, '.agents/commands'), {
    recursive: true,
    force: true,
  });

  console.log(`  - Syncing .agents/examples...`);
  await cp(join(TEMPLATE_DIR, '.agents/examples'), join(projectPath, '.agents/examples'), {
    recursive: true,
    force: true,
  });

  console.log(`  - Syncing .agents/PRD.md...`);
  await cp(join(TEMPLATE_DIR, '.agents/PRD.md'), join(projectPath, '.agents/PRD.md'));

  console.log(`  - Syncing .agents/README.md...`);
  await cp(join(TEMPLATE_DIR, '.agents/README.md'), join(projectPath, '.agents/README.md'));
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log('🔄 Syncing template to existing projects...\n');
  console.log(`Template: ${TEMPLATE_DIR}`);
  console.log(`Workspace: ${WORKSPACE_PATH}\n`);

  if (!(await directoryExists(WORKSPACE_PATH))) {
    console.error(`❌ Workspace directory not found: ${WORKSPACE_PATH}`);
    process.exit(1);
  }

  if (!(await directoryExists(TEMPLATE_DIR))) {
    console.error(`❌ Template directory not found: ${TEMPLATE_DIR}`);
    process.exit(1);
  }

  // Find all git repositories in workspace
  const entries = await readdir(WORKSPACE_PATH);
  const results: SyncResult[] = [];

  for (const entry of entries) {
    const projectPath = join(WORKSPACE_PATH, entry);

    // Skip if not a directory
    if (!(await directoryExists(projectPath))) {
      continue;
    }

    // Skip if not a git repo
    if (!(await isGitRepo(projectPath))) {
      console.log(`⏭️  Skipping ${entry} (not a git repository)`);
      continue;
    }

    console.log(`\n📁 ${entry}`);

    try {
      await syncProject(projectPath);
      console.log(`✅ Synced successfully`);
      results.push({ project: entry, synced: true });
    } catch (error) {
      const err = error as Error;
      console.error(`❌ Failed: ${err.message}`);
      results.push({ project: entry, synced: false, error: err.message });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary\n');
  const synced = results.filter((r) => r.synced);
  const failed = results.filter((r) => !r.synced);

  console.log(`✅ Synced: ${synced.length} projects`);
  if (synced.length > 0) {
    synced.forEach((r) => console.log(`   - ${r.project}`));
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length} projects`);
    failed.forEach((r) => console.log(`   - ${r.project}: ${r.error}`));
  }

  console.log('='.repeat(60) + '\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
