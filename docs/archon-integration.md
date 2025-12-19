# Archon Crawl API Integration for SCAR

## Overview

This document outlines how SCAR can integrate with Archon's knowledge base and web crawling capabilities to enable persistent, cross-project research and documentation indexing.

## Current Archon Status

- **Server**: Running at `http://localhost:8181`
- **Health**: ✅ Healthy
- **Credentials**: ✅ Loaded
- **MCP Server**: Running at `http://localhost:8051`

## Architecture

### Archon Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend UI   │    │  Server (API)   │    │   MCP Server    │
│   Port 3737     │◄──►│   Port 8181     │◄──►│   Port 8051     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │
                       ┌─────────────────┐               │
                       │    Supabase     │◄──────────────┘
                       │   PostgreSQL    │
                       │    PGVector     │
                       └─────────────────┘
```

### SCAR + Archon Integration

```
┌─────────────────────────────────────────────────────────┐
│                    SCAR Orchestrator                    │
│   (Telegram, Slack, Discord, GitHub Adapters)           │
└──────────────────────┬──────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
┌────────────┐  ┌────────────┐  ┌──────────────┐
│   Command  │  │     AI     │  │   Archon     │
│   Handler  │  │  Assistant │  │   Client     │
│  (Slash)   │  │  (Claude)  │  │  (New!)      │
└────────────┘  └────────────┘  └──────┬───────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ Archon REST API │
                              │   Port 8181     │
                              └─────────────────┘
                                       │
                              ┌─────────────────┐
                              │  Knowledge Base │
                              │   (Persistent)  │
                              └─────────────────┘
```

## API Reference

### 1. Crawl Endpoint

**Endpoint**: `POST http://localhost:8181/api/knowledge-items/crawl`

**Request Body**:
```typescript
interface CrawlRequest {
  url: string;                    // URL to crawl
  knowledge_type: string;         // "general" | "technical"
  tags: string[];                 // Tags for organization
  update_frequency: number;       // Days between updates (default: 7)
  max_depth: number;              // Crawl depth 1-5 (default: 2)
  extract_code_examples: boolean; // Extract code snippets (default: true)
}
```

**Example Request**:
```json
{
  "url": "https://docs.anthropic.com",
  "knowledge_type": "technical",
  "tags": ["anthropic", "claude-api", "scar-research"],
  "update_frequency": 7,
  "max_depth": 2,
  "extract_code_examples": true
}
```

**Response**:
```typescript
interface CrawlStartResponse {
  success: boolean;
  progressId: string;            // UUID for progress tracking
  message: string;               // "Crawling started"
  estimatedDuration: string;     // "3-5 minutes"
}
```

### 2. Progress Tracking Endpoint

**Endpoint**: `GET http://localhost:8181/api/crawl-progress/{progressId}`

**Response**:
```typescript
interface CrawlProgress {
  status: "starting" | "in_progress" | "completed" | "error" | "cancelled";
  progress: number;              // 0-100
  totalPages: number;            // Total pages discovered
  processedPages: number;        // Pages processed so far
  currentUrl: string;            // Currently processing URL
  log: string;                   // Latest log message
  crawlType: "normal" | "sitemap" | "llms-txt" | "text_file";
}
```

**Example Response**:
```json
{
  "status": "in_progress",
  "progress": 65,
  "totalPages": 127,
  "processedPages": 83,
  "currentUrl": "https://docs.anthropic.com/claude/reference",
  "log": "Processing API reference documentation...",
  "crawlType": "normal"
}
```

### 3. Knowledge Search Endpoint (via MCP)

**Available MCP Tools**:

- `rag_search_knowledge_base(query, source_id?, match_count)` - Search indexed content
- `rag_get_available_sources()` - List all crawled sources
- `rag_search_code_examples(query, source_id?, match_count)` - Find code snippets

**Note**: Direct crawl triggering is NOT exposed via MCP, only via REST API.

## Integration Options

### Option 1: SCAR Command Integration (Recommended for MVP)

Add explicit commands for users to trigger crawls and searches.

**Implementation Location**: `src/handlers/command-handler.ts`

**New Commands**:
- `/crawl <url>` - Crawl and index a URL
- `/research <topic>` - Search Archon knowledge base
- `/knowledge-sources` - List all indexed sources

**Code Example**:
```typescript
// src/handlers/command-handler.ts
case 'crawl':
  const url = args[0];
  if (!url) {
    return "Usage: /crawl <url>";
  }

  const archonClient = new ArchonClient('http://localhost:8181');
  const { progressId } = await archonClient.startCrawl({
    url,
    knowledge_type: 'technical',
    tags: [codebase.name, 'scar-research'],
    max_depth: 2,
    extract_code_examples: true
  });

  await platform.sendMessage(conversationId,
    `🔍 Started crawling ${url}\nProgress ID: ${progressId}`);

  // Poll for completion
  const result = await archonClient.pollProgress(progressId);

  if (result.status === 'completed') {
    await platform.sendMessage(conversationId,
      `✅ Crawled ${result.totalPages} pages from ${url}\n` +
      `Indexed ${result.chunksCreated} chunks\n` +
      `Knowledge available for all future conversations`);
  }
  break;

case 'research':
  const query = args.join(' ');
  const archonClient = new ArchonClient('http://localhost:8181');
  const results = await archonClient.searchKnowledge({
    query,
    match_count: 5
  });

  await platform.sendMessage(conversationId,
    `📚 Found ${results.length} relevant chunks:\n\n` +
    results.map(r => `• ${r.title}: ${r.snippet}`).join('\n'));
  break;
```

### Option 2: Orchestrator Auto-Detection (Automatic/Intelligent)

Automatically detect when AI needs external documentation and trigger crawls.

**Implementation Location**: `src/orchestrator/orchestrator.ts`

**Detection Strategy**:
1. Analyze user prompt for external dependencies (React, Supabase, etc.)
2. Check if documentation is already in Archon
3. If not, trigger background crawl
4. Optionally wait for completion before proceeding

**Code Example**:
```typescript
// src/orchestrator/orchestrator.ts
// Add before AI conversation starts

import { ArchonClient } from '../clients/archon';
import { detectExternalDependencies } from '../utils/dependency-detector';

async function ensureKnowledgeAvailable(prompt: string, codebase: Codebase) {
  const archonClient = new ArchonClient('http://localhost:8181');

  // Detect mentions of external tools/frameworks
  const dependencies = detectExternalDependencies(prompt);

  for (const dep of dependencies) {
    // Check if we already have this in Archon
    const sources = await archonClient.getSources();
    const exists = sources.some(s => s.title.includes(dep.name));

    if (!exists && dep.docsUrl) {
      console.log(`[Orchestrator] Auto-crawling ${dep.name} docs`);

      // Trigger crawl (don't wait for completion)
      await archonClient.startCrawl({
        url: dep.docsUrl,
        knowledge_type: 'technical',
        tags: [dep.name, 'auto-crawled'],
        max_depth: 2,
        extract_code_examples: true
      });
    }
  }
}

// In handleMessage function, before AI call:
if (shouldAutoResearch) {
  await ensureKnowledgeAvailable(prompt, codebase);
}
```

### Option 3: Subagent Enhancement (Most Powerful)

Integrate Archon search into existing PIV loop subagents.

**Implementation Locations**:
- `.claude/commands/exp-piv-loop/prime.md`
- `.claude/commands/exp-piv-loop/plan.md`
- `.claude/commands/exp-piv-loop/execute.md`

**Enhanced Prime Command**:
```markdown
# Prime Command (Enhanced with Archon)

You are analyzing the codebase to load full project context.

## Step 1: Check Archon Knowledge Base

Before exploring the codebase, search Archon for existing knowledge:

1. Get available sources: `rag_get_available_sources()`
2. Search for project name: `rag_search_knowledge_base(query="${PROJECT_NAME}")`
3. Search for dependencies: `rag_search_knowledge_base(query="${DEPENDENCY_NAME}")`

## Step 2: Analyze Codebase Structure

[... existing prime logic ...]

## Step 3: Identify Knowledge Gaps

If critical dependencies lack documentation in Archon:
- Recommend user run `/crawl <docs-url>` for those dependencies
- Or trigger auto-crawl if enabled
```

**Enhanced Plan Command**:
```markdown
# Plan Command (Enhanced with Archon)

You are creating a detailed implementation plan.

## Step 1: Research Best Practices

Search Archon for relevant patterns and examples:

1. `rag_search_knowledge_base(query="[feature type] best practices")`
2. `rag_search_code_examples(query="[similar implementation]")`

## Step 2: Create Implementation Plan

[... existing plan logic ...]

Include references to Archon knowledge in the plan:
- "See: [Source Name] - [Chunk Title]"
```

## Implementation Files

### 1. Archon API Client

**File**: `src/clients/archon.ts`

```typescript
/**
 * Archon API Client for SCAR
 *
 * Provides interface to Archon's knowledge base and crawling capabilities.
 */

import fetch from 'node-fetch';

export interface CrawlRequest {
  url: string;
  knowledge_type: 'general' | 'technical';
  tags: string[];
  update_frequency?: number;
  max_depth?: number;
  extract_code_examples?: boolean;
}

export interface CrawlProgress {
  status: 'starting' | 'in_progress' | 'completed' | 'error' | 'cancelled';
  progress: number;
  totalPages: number;
  processedPages: number;
  currentUrl: string;
  log: string;
  crawlType: string;
}

export interface KnowledgeSearchRequest {
  query: string;
  source_id?: string;
  match_count?: number;
}

export class ArchonClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8181') {
    this.baseUrl = baseUrl;
  }

  /**
   * Start a web crawl operation
   */
  async startCrawl(request: CrawlRequest): Promise<{ progressId: string }> {
    const response = await fetch(`${this.baseUrl}/api/knowledge-items/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Crawl failed: ${response.statusText}`);
    }

    const data = await response.json();
    return { progressId: data.progressId };
  }

  /**
   * Get crawl progress
   */
  async getProgress(progressId: string): Promise<CrawlProgress> {
    const response = await fetch(
      `${this.baseUrl}/api/crawl-progress/${progressId}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get progress: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Poll for crawl completion
   */
  async pollProgress(
    progressId: string,
    onProgress?: (progress: CrawlProgress) => void,
    maxWaitMs: number = 300000 // 5 minutes
  ): Promise<CrawlProgress> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const progress = await this.getProgress(progressId);

      if (onProgress) {
        onProgress(progress);
      }

      if (['completed', 'error', 'cancelled'].includes(progress.status)) {
        return progress;
      }

      // Poll every 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Crawl timed out');
  }

  /**
   * Search knowledge base
   * Note: This requires MCP integration or direct DB access
   */
  async searchKnowledge(request: KnowledgeSearchRequest): Promise<any[]> {
    // TODO: Implement via MCP or direct API
    throw new Error('Not implemented - use MCP tools instead');
  }

  /**
   * Get available sources
   */
  async getSources(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/knowledge-items/sources`);

    if (!response.ok) {
      throw new Error(`Failed to get sources: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Check health
   */
  async health(): Promise<{ status: string; ready: boolean }> {
    const response = await fetch(`${this.baseUrl}/health`);
    return await response.json();
  }
}
```

### 2. Dependency Detection Utility

**File**: `src/utils/dependency-detector.ts`

```typescript
/**
 * Detect external dependencies mentioned in prompts
 */

export interface Dependency {
  name: string;
  docsUrl?: string;
  category: 'framework' | 'library' | 'service' | 'tool';
}

const KNOWN_DEPENDENCIES: Record<string, Dependency> = {
  'react': {
    name: 'React',
    docsUrl: 'https://react.dev',
    category: 'framework',
  },
  'nextjs': {
    name: 'Next.js',
    docsUrl: 'https://nextjs.org/docs',
    category: 'framework',
  },
  'supabase': {
    name: 'Supabase',
    docsUrl: 'https://supabase.com/docs',
    category: 'service',
  },
  'anthropic': {
    name: 'Anthropic',
    docsUrl: 'https://docs.anthropic.com',
    category: 'service',
  },
  'fastapi': {
    name: 'FastAPI',
    docsUrl: 'https://fastapi.tiangolo.com',
    category: 'framework',
  },
  'postgresql': {
    name: 'PostgreSQL',
    docsUrl: 'https://www.postgresql.org/docs',
    category: 'service',
  },
  'typescript': {
    name: 'TypeScript',
    docsUrl: 'https://www.typescriptlang.org/docs',
    category: 'language',
  },
};

export function detectExternalDependencies(text: string): Dependency[] {
  const lowerText = text.toLowerCase();
  const detected: Dependency[] = [];

  for (const [key, dep] of Object.entries(KNOWN_DEPENDENCIES)) {
    if (lowerText.includes(key)) {
      detected.push(dep);
    }
  }

  return detected;
}
```

## Usage Examples

### Example 1: Manual Research Workflow

```
User (Telegram): /crawl https://docs.anthropic.com

Bot: 🔍 Started crawling https://docs.anthropic.com
     Progress ID: 550e8400-e29b-41d4-a716-446655440000

Bot: ⏳ Crawling in progress (45%)...

Bot: ✅ Crawled 127 pages from https://docs.anthropic.com
     Indexed 2,341 chunks
     Knowledge available for all future conversations

User: How do I use Claude's streaming API?

Bot: [Searches Archon knowledge base, finds exact docs]
     Based on Anthropic's documentation:

     To use Claude's streaming API, you need to...
     [Detailed answer with code examples from crawled docs]
```

### Example 2: Automatic Research Workflow

```
User (GitHub Issue): Implement authentication using Supabase

Bot: [Router detects "Supabase" is external dependency]
     [Checks Archon - no Supabase docs found]
     [Auto-triggers crawl of docs.supabase.com]

Bot: 🔍 Detected Supabase integration needed
     Crawling Supabase documentation for better context...

Bot: [Waits for crawl to complete]

Bot: ✅ Supabase docs indexed
     Now planning implementation with full documentation context...

Bot: [Creates detailed plan using fresh Supabase docs]
```

### Example 3: Enhanced Prime Workflow

```
User (Telegram): /command-invoke prime

Bot: 🧠 Priming SCAR codebase...

Bot: Step 1: Checking Archon knowledge base
     Found existing knowledge:
     • TypeScript documentation (3,456 chunks)
     • PostgreSQL reference (1,234 chunks)
     • FastAPI guides (891 chunks)

Bot: Step 2: Analyzing codebase structure
     - Detected: Node.js, TypeScript, PostgreSQL
     - Architecture: Microservices
     - Entry point: src/index.ts

Bot: Step 3: Identifying knowledge gaps
     Missing documentation for:
     • Grammy (Telegram bot framework)

     Recommendation: Run `/crawl https://grammy.dev/guide/`

Bot: ✅ Priming complete with enhanced Archon context
     Ready for planning and implementation!
```

## Benefits

### Cross-Project Learning
- **Research once, use everywhere**: Crawled docs available to all projects
- **Knowledge accumulation**: System gets smarter over time
- **Shared context**: Multiple projects benefit from same research

### Performance & Quality
- **Faster responses**: Pre-indexed docs vs. real-time web searches
- **Better accuracy**: Full documentation vs. truncated web results
- **Code examples**: Automatically extracted and searchable
- **Offline capability**: Cached docs available when internet is down

### Cost Efficiency
- **Reduced API costs**: Less repeated research across conversations
- **Fewer web requests**: Batch crawling vs. per-query fetches
- **Persistent storage**: Research survives SCAR restarts

## Implementation Phases

### Phase 1: Basic Integration (MVP)
**Goal**: Manual crawl and search commands

**Tasks**:
1. Create `src/clients/archon.ts` - API client
2. Add `/crawl <url>` command to command handler
3. Add `/research <topic>` command (if MCP available)
4. Test with common doc sites (React, Supabase, Anthropic)

**Estimated Effort**: 4-6 hours

### Phase 2: Automatic Detection
**Goal**: Auto-crawl when AI needs external docs

**Tasks**:
1. Create `src/utils/dependency-detector.ts`
2. Modify orchestrator to detect dependencies
3. Auto-trigger crawls for missing docs
4. Add caching to avoid duplicate crawls

**Estimated Effort**: 6-8 hours

### Phase 3: Subagent Enhancement
**Goal**: Deep integration with PIV loop

**Tasks**:
1. Enhance `prime.md` to search Archon first
2. Enhance `plan.md` to use Archon code examples
3. Enhance `execute.md` to reference Archon docs
4. Add workflow intelligence for Archon usage

**Estimated Effort**: 8-10 hours

## Testing Strategy

### Unit Tests
- Test `ArchonClient` methods
- Test dependency detection logic
- Test progress polling with mocked responses

### Integration Tests
- Test actual crawl → poll → complete flow
- Test knowledge search via MCP (if available)
- Test command handler with Archon client

### End-to-End Tests
- Test full workflow: `/crawl` → wait → `/research`
- Test auto-detection with real prompts
- Test enhanced prime command

## Configuration

### Environment Variables

Add to `.env.example`:
```bash
# Archon Integration
ARCHON_URL=http://localhost:8181
ARCHON_MCP_URL=http://localhost:8051
ARCHON_AUTO_CRAWL=false  # Enable automatic crawling
ARCHON_CRAWL_DEPTH=2     # Default crawl depth (1-5)
```

### Feature Flags

Add to `src/config/features.ts`:
```typescript
export const FEATURES = {
  archon: {
    enabled: process.env.ARCHON_URL !== undefined,
    autoCrawl: process.env.ARCHON_AUTO_CRAWL === 'true',
    defaultDepth: parseInt(process.env.ARCHON_CRAWL_DEPTH || '2'),
  },
};
```

## Migration Strategy

### For Existing SCAR Installations

1. **Optional dependency**: Archon integration should be opt-in
2. **Graceful degradation**: SCAR works without Archon if not configured
3. **Feature detection**: Check Archon health before using features

### For New SCAR Installations

1. **Recommended setup**: Include Archon in default docker-compose
2. **Guided setup**: Setup script offers to configure Archon
3. **Documentation**: Update README with Archon integration benefits

## Future Enhancements

### Advanced Features
- **Incremental updates**: Re-crawl docs on schedule
- **Semantic search**: Vector similarity for better matches
- **Code generation**: Generate code from examples in knowledge base
- **Multi-source synthesis**: Combine knowledge from multiple sources

### UI Enhancements
- **Web dashboard**: View crawled sources via SCAR web UI
- **Progress streaming**: Real-time crawl progress in chat
- **Source attribution**: Show which docs were used in responses

### Intelligence Improvements
- **Smart crawling**: Detect when docs are outdated
- **Relevance scoring**: Rank sources by project relevance
- **Knowledge graphs**: Build relationships between concepts

## Conclusion

Integrating Archon with SCAR creates a powerful synergy:
- **SCAR** provides the multi-platform orchestration and workflow intelligence
- **Archon** provides the persistent knowledge base and research capabilities

Together, they enable truly intelligent, context-aware AI coding assistance that learns and improves over time across all projects.

---

**Next Steps**:
1. Review this plan
2. Decide on implementation phase (1, 2, or 3)
3. Create GitHub issue for tracking
4. Begin implementation in isolated worktree
