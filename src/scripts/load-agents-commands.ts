/**
 * Load command templates from .agents/commands
 */
// IMPORTANT: Load dotenv FIRST before any database imports
import { config } from 'dotenv';
config();

import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { upsertTemplate } from '../db/command-templates';

const AGENTS_COMMANDS_PATH = '.agents/commands';

/**
 * Extract description from markdown frontmatter
 * ---
 * description: Some description
 * ---
 */
function extractDescription(content: string): string | undefined {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!frontmatterMatch) return undefined;

  const frontmatter = frontmatterMatch[1];
  const descMatch = /description:\s*(.+)/.exec(frontmatter);
  return descMatch?.[1]?.trim();
}

async function loadAgentsCommands(): Promise<void> {
  console.log('[Load] Loading commands from .agents/commands...');

  try {
    const files = await readdir(AGENTS_COMMANDS_PATH);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    for (const file of mdFiles) {
      const name = basename(file, '.md');
      const filePath = join(AGENTS_COMMANDS_PATH, file);
      const content = await readFile(filePath, 'utf-8');
      const description = extractDescription(content);

      await upsertTemplate({
        name,
        description: description ?? `From ${AGENTS_COMMANDS_PATH}`,
        content,
      });

      console.log(`[Load] Loaded template: ${name}`);
    }

    console.log(`[Load] Loaded ${String(mdFiles.length)} command templates from .agents/commands`);
  } catch (error) {
    console.error('[Load] Failed to load .agents/commands:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  loadAgentsCommands()
    .then(() => {
      console.log('[Load] Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('[Load] Error:', error);
      process.exit(1);
    });
}

export { loadAgentsCommands };
