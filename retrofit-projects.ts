/**
 * Retrofit existing projects with template structure
 * Adds .claude/, .agents/, and CLAUDE.md to all existing projects
 */
import 'dotenv/config';
import { readFile, writeFile, mkdir, cp, access } from 'fs/promises';
import { join } from 'path';
import { pool } from './src/db/connection';

const WORKSPACE = process.env.WORKSPACE_PATH || '/workspace';
const TEMPLATE_DIR = join(__dirname, '.template');

interface ProjectInfo {
  name: string;
  path: string;
  githubUrl: string | null;
  archonProjectId: string | null;
  description?: string;
}

/**
 * Copy template structure to project directory
 */
async function copyTemplate(projectPath: string): Promise<void> {
  console.log('  → Copying .claude/ directory...');
  const claudeDir = join(projectPath, '.claude');

  // Create .claude directory if it doesn't exist
  try {
    await mkdir(claudeDir, { recursive: true });
  } catch {
    // Directory already exists
  }

  // Copy template contents (recursive)
  await cp(join(TEMPLATE_DIR, '.claude'), claudeDir, {
    recursive: true,
    force: false, // Don't overwrite existing files
  });

  console.log('  → Copying .agents/ directory...');
  const agentsDir = join(projectPath, '.agents');

  try {
    await mkdir(agentsDir, { recursive: true });
  } catch {
    // Directory already exists
  }

  // Copy .agents structure
  await cp(join(TEMPLATE_DIR, '.agents'), agentsDir, {
    recursive: true,
    force: false,
  });

  console.log('  ✓ Template structure copied');
}

/**
 * Create customized CLAUDE.md for project
 */
async function createClaudeMd(project: ProjectInfo): Promise<void> {
  const templatePath = join(TEMPLATE_DIR, 'CLAUDE.md');
  const targetPath = join(project.path, 'CLAUDE.md');

  // Check if CLAUDE.md already exists
  try {
    await access(targetPath);
    console.log('  ℹ CLAUDE.md already exists, skipping');
    return;
  } catch {
    // File doesn't exist, create it
  }

  console.log('  → Creating CLAUDE.md...');

  // Read template
  const template = await readFile(templatePath, 'utf-8');

  // Substitute placeholders
  const customized = template
    .replace(/\{\{PROJECT_NAME\}\}/g, project.name)
    .replace(/\{\{GITHUB_URL\}\}/g, project.githubUrl || 'Not configured')
    .replace(/\{\{ARCHON_PROJECT_ID\}\}/g, project.archonProjectId || 'Not configured')
    .replace(/\{\{WORKSPACE_PATH\}\}/g, project.path)
    .replace(/\{\{PROJECT_DESCRIPTION\}\}/g, project.description || 'No description available.')
    .replace(/\{\{CUSTOM_NOTES\}\}/g, 'Add project-specific notes here.');

  await writeFile(targetPath, customized, 'utf-8');
  console.log('  ✓ CLAUDE.md created');
}

/**
 * Get Archon project ID for a project by name
 */
async function getArchonProjectId(projectName: string): Promise<string | null> {
  try {
    // Use Archon MCP to find project
    // For now, return null - can be added manually later
    return null;
  } catch {
    return null;
  }
}

/**
 * Retrofit a single project
 */
async function retrofitProject(project: ProjectInfo): Promise<void> {
  console.log(`\n[Retrofit] Processing: ${project.name}`);
  console.log(`           Path: ${project.path}`);

  try {
    // 1. Copy template structure
    await copyTemplate(project.path);

    // 2. Create customized CLAUDE.md
    await createClaudeMd(project);

    console.log(`\n✅ ${project.name} retrofit complete!\n`);
  } catch (error) {
    console.error(`\n❌ Failed to retrofit ${project.name}:`, error);
  }
}

async function main(): Promise<void> {
  console.log('🚀 Retrofitting existing projects with template structure...\n');
  console.log(`Template: ${TEMPLATE_DIR}`);
  console.log(`Workspace: ${WORKSPACE}\n`);

  // Get all codebases from database
  const result = await pool.query(
    'SELECT name, repository_url, default_cwd FROM remote_agent_codebases ORDER BY name'
  );

  const projects: ProjectInfo[] = result.rows.map(row => ({
    name: row.name,
    path: row.default_cwd,
    githubUrl: row.repository_url,
    archonProjectId: null, // Will be looked up
  }));

  console.log(`Found ${String(projects.length)} projects to retrofit:\n`);
  for (const p of projects) {
    console.log(`  - ${p.name} (${p.path})`);
  }
  console.log('');

  // Retrofit each project
  for (const project of projects) {
    // Get Archon project ID if exists
    project.archonProjectId = await getArchonProjectId(project.name);

    await retrofitProject(project);
  }

  console.log('✨ All projects retrofitted!\n');
  await pool.end();
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
