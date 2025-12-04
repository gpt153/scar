/**
 * Seed default command templates from .claude/commands/exp-piv-loop
 */
import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import { upsertTemplate } from '../db/command-templates';

const SEED_COMMANDS_PATH = '.claude/commands/exp-piv-loop';

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

export async function seedDefaultCommands(): Promise<void> {
  // Check if builtin commands should be loaded (default: true)
  const loadBuiltins = process.env.LOAD_BUILTIN_COMMANDS !== 'false';

  if (!loadBuiltins) {
    console.log('[Seed] Builtin commands disabled (LOAD_BUILTIN_COMMANDS=false)');
    return;
  }

  console.log('[Seed] Loading builtin command templates...');

  try {
    const files = await readdir(SEED_COMMANDS_PATH);
    const mdFiles = files.filter((f) => f.endsWith('.md'));

    for (const file of mdFiles) {
      const name = basename(file, '.md');
      const filePath = join(SEED_COMMANDS_PATH, file);
      const content = await readFile(filePath, 'utf-8');
      const description = extractDescription(content);

      await upsertTemplate({
        name,
        description: description ?? `From ${SEED_COMMANDS_PATH}`,
        content,
      });

      console.log(`[Seed] Loaded builtin template: ${name}`);
    }

    console.log(`[Seed] Loaded ${String(mdFiles.length)} builtin command templates`);
  } catch {
    // Don't fail startup if seed commands don't exist
    console.log('[Seed] No builtin commands found (this is OK for external-db deployments)');
  }
}
