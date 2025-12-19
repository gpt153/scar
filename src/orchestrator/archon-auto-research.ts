/**
 * Archon Auto-Research Integration
 *
 * Automatically detects dependencies in user prompts and prepares
 * instructions for Claude to check Archon knowledge base and crawl if needed.
 */

import { detectDependencies, DetectedDependency } from '../utils/dependency-detector';
import { isWorthIndexing } from '../utils/knowledge-evaluator';

export interface CrawlStrategy {
  mode: 'background' | 'blocking' | 'suggest' | 'disabled';
  maxWaitMs: number;
}

/**
 * Gets crawl strategy from environment configuration
 */
export function getCrawlStrategy(): CrawlStrategy {
  const enabled = process.env.ARCHON_AUTO_CRAWL === 'true';

  if (!enabled) {
    return { mode: 'disabled', maxWaitMs: 0 };
  }

  const mode = (process.env.ARCHON_CRAWL_STRATEGY ?? 'background') as CrawlStrategy['mode'];
  const maxWaitMs = parseInt(process.env.ARCHON_CRAWL_MAX_WAIT ?? '60000', 10);

  return { mode, maxWaitMs };
}

/**
 * Generates Archon research instructions for Claude
 * This will be prepended to the user prompt to guide Claude to check Archon first
 *
 * @param dependencies - Array of detected dependencies worth indexing
 * @param strategy - Crawl strategy configuration
 * @returns Formatted instructions for Claude, or empty string if no dependencies
 */
export function generateArchonInstructions(
  dependencies: DetectedDependency[],
  strategy: CrawlStrategy
): string {
  if (dependencies.length === 0 || strategy.mode === 'disabled') {
    return '';
  }

  const depList = dependencies.map(d => `- ${d.name} (${d.docsUrl})`).join('\n');

  let instructions = `## 🔍 Archon Auto-Research Detected

The following external dependencies were detected in the user's request:

${depList}

**IMPORTANT: Before proceeding, check Archon knowledge base:**

1. Use \`mcp__archon__rag_get_available_sources()\` to list all indexed documentation sources
2. For each detected dependency:
   - Check if documentation is already indexed
   - If missing AND the dependency is mentioned in the request, inform the user
3. Based on crawl strategy: **${strategy.mode.toUpperCase()}**

`;

  switch (strategy.mode) {
    case 'background':
      instructions += `**Background Mode**: If documentation is missing:
- Inform user: "🔍 Detected [DEP] - indexing documentation in background..."
- Continue with response using available knowledge
- Documentation will be available for future requests

DO NOT block or wait for crawl completion.
`;
      break;

    case 'blocking':
      instructions += `**Blocking Mode**: If documentation is missing:
- Inform user: "🔍 Detected [DEP] - indexing documentation (this may take a moment)..."
- Wait for crawl completion (max ${String(strategy.maxWaitMs)}ms)
- Use freshly indexed documentation in your response
- If timeout, proceed with available knowledge and inform user

Example MCP call sequence:
1. Check sources: \`mcp__archon__rag_get_available_sources()\`
2. If missing, trigger crawl (if MCP tool available)
3. Wait for completion or timeout
4. Respond with indexed knowledge
`;
      break;

    case 'suggest':
      instructions += `**Suggest Mode**: If documentation is missing:
- Inform user: "📚 Would you like me to index [DEP] documentation for better context?"
- Wait for user confirmation
- Only crawl if user approves

Be helpful and explain the benefit of indexing.
`;
      break;
  }

  instructions += '\n---\n\n';

  return instructions;
}

/**
 * Analyzes a user prompt and generates Archon research instructions
 * This is the main entry point for the orchestrator
 *
 * @param prompt - The user's message
 * @returns Archon instructions to prepend to the prompt, or empty string
 */
export function analyzeAndPrepareArchonInstructions(prompt: string): string {
  // Get crawl strategy
  const strategy = getCrawlStrategy();

  if (strategy.mode === 'disabled') {
    return '';
  }

  // Detect dependencies
  const detected = detectDependencies(prompt);

  // Filter to only valuable dependencies
  const worthIndexing = detected.filter(dep => isWorthIndexing(dep));

  if (worthIndexing.length === 0) {
    return '';
  }

  // Generate instructions
  return generateArchonInstructions(worthIndexing, strategy);
}

/**
 * Checks if Archon MCP is enabled
 * Used to determine if auto-research features should be available
 */
export function isArchonMcpEnabled(): boolean {
  return process.env.ENABLE_ARCHON_MCP === 'true';
}
