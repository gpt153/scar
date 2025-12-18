# Feature: Archon REST API Client Integration

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types and models. Import from the right files etc.

## Feature Description

Integrate Archon's REST API crawling capabilities into SCAR to enable persistent, cross-project knowledge base management. Add slash commands for manual web crawling and progress tracking, creating a new `ArchonClient` API wrapper that follows existing client patterns (ClaudeClient, CodexClient).

This is **Phase 1** of the Archon integration roadmap (Basic Integration/MVP), focused on manual crawl and progress tracking commands.

## User Story

As a SCAR user
I want to crawl and index documentation websites via Archon
So that I can build a persistent knowledge base that improves AI responses across all my projects

## Problem Statement

SCAR currently relies on real-time web searches and AI-generated responses without access to comprehensive, pre-indexed documentation. This leads to:
- Repeated research across conversations and projects
- Inconsistent or incomplete documentation references
- Higher API costs from redundant web fetches
- No knowledge accumulation over time

Archon provides a persistent knowledge base with web crawling and semantic search capabilities, but SCAR has no integration to leverage it.

## Solution Statement

Create an `ArchonClient` that wraps Archon's REST API endpoints for web crawling and progress tracking. Add `/crawl` and `/crawl-status` slash commands to the command handler, allowing users to manually trigger documentation indexing and monitor progress. This establishes the foundation for future automatic knowledge retrieval and PIV loop enhancements.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: Command Handler, New API Client
**Dependencies**:
- Archon server running on `http://localhost:8181` (external)
- `node-fetch` library (already available via dependencies)

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/handlers/command-handler.ts` (lines 79-150) - Why: Command parsing and handling pattern to follow
- `src/handlers/command-handler.ts` (lines 300-450) - Why: `/clone` command shows async operation with progress feedback pattern
- `src/clients/claude.ts` - Why: Client implementation pattern, interface adherence, type safety
- `src/clients/codex.ts` - Why: Alternative client example, error handling patterns
- `src/clients/factory.ts` - Why: Shows how clients are registered and created
- `src/types/index.ts` (lines 0-100) - Why: Core type definitions and interface patterns
- `.env.example` (lines 120-140) - Why: MCP server configuration pattern for Archon
- `src/adapters/test.ts` - Why: Testing pattern for API-based features

### New Files to Create

- `src/clients/archon.ts` - REST API client for Archon crawling and progress tracking
- `src/clients/archon.test.ts` - Unit tests for ArchonClient following test patterns

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- `docs/archon-integration.md` - Complete Archon API reference with request/response types
  - Lines 62-98: Crawl endpoint structure
  - Lines 100-128: Progress tracking endpoint
  - Lines 307-444: Complete TypeScript client implementation example
  - Lines 445-511: Dependency detection utility (future use)
- `CLAUDE.md` (lines 44-56) - Type Safety requirements (critical for client implementation)
- `.agents/reference/new-features.md` (lines 65-98) - AI Assistant Client interface pattern

### Patterns to Follow

**Client Implementation Pattern** (from `src/clients/claude.ts`):
```typescript
export class ClientName implements IAssistantClient { // Or custom interface
  constructor(baseUrl?: string) {
    // Initialize with environment variables
    this.baseUrl = baseUrl || process.env.CLIENT_URL || 'default';
  }

  async methodName(params: ParamType): Promise<ReturnType> {
    // Type-safe implementation with explicit types
    try {
      // Implementation
    } catch (error) {
      console.error('[ClientName] Operation failed:', error);
      throw error; // Surface errors, don't wrap unnecessarily
    }
  }

  getType(): string {
    return 'client-identifier';
  }
}
```

**Command Handler Pattern** (from `src/handlers/command-handler.ts:150-250`):
```typescript
case 'command-name':
  // 1. Validate arguments
  if (!args[0]) {
    return { success: false, message: 'Usage: /command-name <arg>' };
  }

  // 2. Check prerequisites (env vars, running services)
  if (!process.env.REQUIRED_VAR) {
    return {
      success: false,
      message: 'Feature not enabled. Set REQUIRED_VAR in .env'
    };
  }

  // 3. Perform operation with try-catch
  try {
    const client = new Client();
    const result = await client.operation(args[0]);

    // 4. Return detailed success message
    return {
      success: true,
      message: `Operation completed!\n\nDetails: ${result.summary}`,
    };
  } catch (error) {
    // 5. Return user-friendly error
    return {
      success: false,
      message: `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
```

**Test Pattern** (from `src/clients/claude.test.ts`):
```typescript
// Mock external dependencies BEFORE importing
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

import { ClientName } from './client-name';

describe('ClientName', () => {
  let client: ClientName;

  beforeEach(() => {
    client = new ClientName();
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    test('handles success case', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'value' }),
      });

      const result = await client.methodName('param');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('endpoint'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(result).toEqual({ data: 'value' });
    });

    test('throws on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
      });

      await expect(client.methodName('param')).rejects.toThrow('Bad Request');
    });
  });
});
```

**Error Handling Pattern** (from CLAUDE.md):
- Surface git errors directly to users (don't wrap)
- Log errors with context: `console.error('[Component] Operation failed', { context })`
- Return user-friendly messages in CommandResult
- Never log secrets or tokens

**Type Safety Requirements** (from CLAUDE.md:44-56):
- All functions must have return type annotations
- All parameters must have type annotations
- Avoid `any` - use `unknown` and type guards
- Prefer importing SDK types directly (see `src/clients/claude.ts:11-12`)

---

## IMPLEMENTATION PLAN

### Phase 1: ArchonClient Foundation

Create the core API client that wraps Archon's crawl and progress endpoints with full type safety.

**Tasks:**
- Define TypeScript interfaces for Archon API types
- Implement `ArchonClient` class with core methods
- Add environment variable configuration
- Handle authentication headers (optional token)

### Phase 2: Slash Commands Integration

Add user-facing commands to command-handler.ts for triggering crawls and checking progress.

**Tasks:**
- Add `/crawl <url>` command with progress polling
- Add `/crawl-status <progressId>` command for manual checks
- Update `/help` command documentation
- Add feature detection (check if Archon URL is configured)

### Phase 3: Testing & Validation

Ensure reliability with comprehensive unit tests and manual validation.

**Tasks:**
- Write unit tests for ArchonClient methods
- Write integration tests for slash commands
- Test with live Archon instance
- Validate error handling and edge cases

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### CREATE src/clients/archon.ts

- **IMPLEMENT**: Complete ArchonClient class with crawl and progress methods
- **PATTERN**: Follow `src/clients/claude.ts` structure and type safety patterns
- **IMPORTS**: `node-fetch` (already in dependencies via express)
- **TYPES**: Define interfaces inline following TypeScript strict mode
- **EXPORTS**: Export interfaces and client class
- **GOTCHA**: Handle optional `ARCHON_TOKEN` header (only add if present)
- **GOTCHA**: Use `process.env.ARCHON_URL || 'http://localhost:8181'` for default
- **VALIDATE**: `npm run type-check` - Must pass with 0 errors

**Implementation details:**
```typescript
/**
 * Archon API Client for web crawling and knowledge base management
 *
 * Wraps Archon's REST API for triggering documentation crawls and tracking progress.
 * This client provides the foundation for persistent cross-project knowledge.
 */

// Core interfaces (based on docs/archon-integration.md:62-128)
export interface CrawlRequest {
  url: string;
  knowledge_type: 'general' | 'technical';
  tags: string[];
  update_frequency?: number;
  max_depth?: number;
  extract_code_examples?: boolean;
}

export interface CrawlStartResponse {
  success: boolean;
  progressId: string;
  message: string;
  estimatedDuration: string;
}

export interface CrawlProgress {
  status: 'starting' | 'in_progress' | 'completed' | 'error' | 'cancelled';
  progress: number;
  totalPages: number;
  processedPages: number;
  currentUrl: string;
  log: string;
  crawlType: 'normal' | 'sitemap' | 'llms-txt' | 'text_file';
}

export class ArchonClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.ARCHON_URL || 'http://localhost:8181';
    this.authToken = process.env.ARCHON_TOKEN;
  }

  /**
   * Start a web crawl operation
   */
  async startCrawl(request: CrawlRequest): Promise<CrawlStartResponse> {
    // Implementation with fetch, headers, error handling
  }

  /**
   * Get current crawl progress
   */
  async getProgress(progressId: string): Promise<CrawlProgress> {
    // Implementation with fetch, error handling
  }

  /**
   * Poll for crawl completion with callback for progress updates
   * @param maxWaitMs - Maximum time to wait (default: 300000 = 5 minutes)
   */
  async pollProgress(
    progressId: string,
    onProgress?: (progress: CrawlProgress) => void,
    maxWaitMs: number = 300000
  ): Promise<CrawlProgress> {
    // Implementation: loop with 2-second intervals, check for completion statuses
  }

  /**
   * Check if Archon is healthy and accessible
   */
  async health(): Promise<{ status: string; ready: boolean }> {
    // Implementation: GET /health endpoint
  }
}
```

### CREATE src/clients/archon.test.ts

- **IMPLEMENT**: Unit tests for all ArchonClient methods
- **PATTERN**: Follow `src/clients/claude.test.ts` structure (lines 1-242)
- **IMPORTS**: Mock `node-fetch` before importing ArchonClient
- **TESTS**: startCrawl success/failure, getProgress, pollProgress with timeout, health check
- **VALIDATE**: `npm test src/clients/archon.test.ts` - All tests pass

**Test coverage requirements:**
- `startCrawl()`: Success case, API error (non-200), network error
- `getProgress()`: Success case, invalid progressId, API error
- `pollProgress()`: Completion after N iterations, timeout, error status
- `health()`: Healthy response, unhealthy response, connection failure
- Constructor: Default URL, custom URL, token handling

### UPDATE src/handlers/command-handler.ts

- **ADD**: Import ArchonClient at top of file
- **ADD**: `/crawl` case in handleCommand switch (after `/clone` around line 500)
- **ADD**: `/crawl-status` case for manual progress checks
- **PATTERN**: Follow `/clone` command structure (lines 285-500)
- **IMPORTS**: `import { ArchonClient, type CrawlProgress } from '../clients/archon';`
- **GOTCHA**: Check `process.env.ARCHON_URL` is set before allowing commands
- **GOTCHA**: Use existing `conversation.codebase_id` for tagging crawls
- **VALIDATE**: `npm run type-check` - Must pass
- **VALIDATE**: Test manually via test adapter: `curl -X POST http://localhost:3000/test/message -H "Content-Type: application/json" -d '{"conversationId":"test-123","message":"/crawl https://docs.example.com"}'`

**Implementation details for `/crawl` command:**
```typescript
case 'crawl': {
  const url = args[0];
  if (!url) {
    return {
      success: false,
      message: 'Usage: /crawl <url>\n\nExample: /crawl https://docs.anthropic.com',
    };
  }

  // Feature detection
  if (!process.env.ARCHON_URL) {
    return {
      success: false,
      message: 'Archon integration not configured.\n\nSet ARCHON_URL in .env to enable crawling.\nSee docs/archon-integration.md for setup.',
    };
  }

  try {
    const client = new ArchonClient();

    // Health check first
    const healthStatus = await client.health();
    if (!healthStatus.ready) {
      return {
        success: false,
        message: `Archon server not ready.\n\nStatus: ${healthStatus.status}\n\nEnsure Archon is running: docker compose up -d`,
      };
    }

    // Get codebase name for tagging
    const codebase = conversation.codebase_id
      ? await codebaseDb.getCodebase(conversation.codebase_id)
      : null;
    const tags = codebase ? [codebase.name, 'scar-crawl'] : ['scar-crawl'];

    // Start crawl
    const crawlResponse = await client.startCrawl({
      url,
      knowledge_type: 'technical',
      tags,
      max_depth: 2,
      extract_code_examples: true,
    });

    // Send initial progress message
    await platform.sendMessage(
      conversationId,
      `🔍 Started crawling ${url}\n\nProgress ID: ${crawlResponse.progressId}\nEstimated duration: ${crawlResponse.estimatedDuration}\n\n⏳ Polling for completion...`
    );

    // Poll with progress updates
    const finalProgress = await client.pollProgress(
      crawlResponse.progressId,
      async (progress: CrawlProgress) => {
        // Send progress updates every 10%
        if (progress.progress % 10 === 0 && progress.progress > 0) {
          await platform.sendMessage(
            conversationId,
            `⏳ Progress: ${progress.progress}%\nProcessed: ${progress.processedPages}/${progress.totalPages} pages\nCurrent: ${progress.currentUrl}`
          );
        }
      }
    );

    if (finalProgress.status === 'completed') {
      return {
        success: true,
        message: `✅ Crawl completed!\n\n📊 Summary:\n- Total pages: ${finalProgress.totalPages}\n- Pages processed: ${finalProgress.processedPages}\n- Crawl type: ${finalProgress.crawlType}\n\n💡 Knowledge is now available for all conversations`,
      };
    } else if (finalProgress.status === 'error') {
      return {
        success: false,
        message: `❌ Crawl failed\n\nError: ${finalProgress.log}`,
      };
    } else {
      return {
        success: false,
        message: `⚠️ Crawl status: ${finalProgress.status}\n\nLast update: ${finalProgress.log}`,
      };
    }
  } catch (error) {
    console.error('[Crawl] Command failed:', error);
    return {
      success: false,
      message: `Failed to crawl ${url}\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\nCheck that Archon is running and accessible.`,
    };
  }
}
```

**Implementation details for `/crawl-status` command:**
```typescript
case 'crawl-status': {
  const progressId = args[0];
  if (!progressId) {
    return {
      success: false,
      message: 'Usage: /crawl-status <progressId>\n\nGet the progress ID from /crawl command output.',
    };
  }

  if (!process.env.ARCHON_URL) {
    return {
      success: false,
      message: 'Archon integration not configured. Set ARCHON_URL in .env',
    };
  }

  try {
    const client = new ArchonClient();
    const progress = await client.getProgress(progressId);

    const statusEmoji = {
      starting: '🔄',
      in_progress: '⏳',
      completed: '✅',
      error: '❌',
      cancelled: '⚠️',
    }[progress.status] ?? '❓';

    return {
      success: true,
      message:
        `${statusEmoji} Crawl Status: ${progress.status}\n\n` +
        `Progress: ${progress.progress}%\n` +
        `Pages: ${progress.processedPages}/${progress.totalPages}\n` +
        `Current URL: ${progress.currentUrl}\n\n` +
        `Log: ${progress.log}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get crawl status\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
```

### UPDATE src/handlers/command-handler.ts (Help Text)

- **UPDATE**: `/help` command case to include new crawl commands
- **PATTERN**: Follow existing help text format (lines 600-650)
- **ADD**: New section "Knowledge Base (Archon)" with `/crawl` and `/crawl-status`
- **VALIDATE**: Run `/help` command via test adapter to verify formatting

**Help text addition:**
```typescript
// Add to help message around line 640
responseMessage += '\n\nKnowledge Base (Archon):\n';
responseMessage += '  /crawl <url> - Crawl and index documentation website\n';
responseMessage += '  /crawl-status <progressId> - Check crawl progress\n';
```

### UPDATE .env.example

- **VERIFY**: Lines 120-127 already document ARCHON_URL and ARCHON_TOKEN
- **NO CHANGES NEEDED**: Configuration already documented
- **VALIDATE**: Confirm documentation matches implementation defaults

### MANUAL TESTING (Test Adapter)

- **TEST**: Health check with Archon not running (should fail gracefully)
- **TEST**: Start Archon, then test `/crawl https://example.com` (small site)
- **TEST**: Verify progress updates are sent during crawl
- **TEST**: Test `/crawl-status <progressId>` with valid and invalid IDs
- **TEST**: Test error handling with invalid URL
- **VALIDATE**: All error messages are user-friendly (no stack traces)

**Test sequence:**
```bash
# 1. Test without Archon running (should fail gracefully)
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"test-archon","message":"/crawl https://example.com"}'

# Expected: Error about Archon not configured or not ready

# 2. Start Archon
# (Assuming Archon is set up per docs/archon-integration.md)

# 3. Test successful crawl
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"test-archon","message":"/crawl https://example.com"}'

# Expected: Progress updates, then completion message

# 4. Test crawl-status with invalid ID
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"test-archon","message":"/crawl-status invalid-id-123"}'

# Expected: Error about invalid progress ID

# 5. Test help command
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"test-archon","message":"/help"}'

# Expected: Help text including new /crawl commands

# 6. View all messages
curl http://localhost:3000/test/messages/test-archon | jq

# 7. Clean up
curl -X DELETE http://localhost:3000/test/messages/test-archon
```

---

## TESTING STRATEGY

### Unit Tests

**Scope**: ArchonClient methods in isolation
**Framework**: Jest with mocked `node-fetch`
**Coverage Target**: 100% of ArchonClient methods

Test cases:
- Constructor with default and custom URLs
- startCrawl: Success, API error, network error, missing parameters
- getProgress: Success, invalid ID, API error
- pollProgress: Immediate completion, multi-iteration completion, timeout, error status
- health: Healthy, unhealthy, connection failure

**Pattern**: Follow `src/clients/claude.test.ts` structure exactly

### Integration Tests

**Scope**: Command handler integration with ArchonClient
**Method**: Test adapter HTTP endpoints (manual validation)
**Coverage**: End-to-end command flow

Test scenarios:
- `/crawl` without ARCHON_URL configured → Error message
- `/crawl` with Archon not running → Connection error
- `/crawl` with valid URL → Success with progress updates
- `/crawl-status` with valid progressId → Status display
- `/crawl-status` with invalid progressId → Error handling
- `/help` command → Includes new Archon commands

### Edge Cases

- URL with special characters (spaces, non-ASCII)
- Very long URLs (>500 characters)
- Network timeout during crawl (handled by pollProgress timeout)
- Archon server restart during crawl (should gracefully fail)
- Concurrent crawls from same conversation (should work independently)
- Missing ARCHON_TOKEN when server requires auth (should fail with clear message)

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Style

```bash
# TypeScript type checking
npm run type-check
```
**Expected**: All commands pass with exit code 0, no type errors

### Level 2: Unit Tests

```bash
# Run ArchonClient tests
npm test src/clients/archon.test.ts

# Run all tests to ensure no regressions
npm test

# Check coverage for new file
npm run test:coverage -- src/clients/archon.test.ts
```
**Expected**:
- All tests pass
- ArchonClient coverage: 100% statements, branches, functions, lines
- No regressions in existing tests

### Level 3: Code Quality

```bash
# ESLint (must pass with 0 errors)
npm run lint

# Prettier formatting check
npm run format:check
```
**Expected**: Both pass with exit code 0

### Level 4: Manual Validation (Test Adapter)

```bash
# Start application (assuming Archon is running)
npm run dev

# Run test sequence from MANUAL TESTING section above
# Verify all responses are user-friendly and accurate
```

**Expected**:
- `/crawl` without Archon: Clear error message with setup instructions
- `/crawl` with Archon: Progress updates → Completion message
- `/crawl-status`: Accurate status display
- `/help`: Includes new commands

### Level 5: Live Archon Test (Optional)

```bash
# Prerequisites: Archon running on localhost:8181
# Set ARCHON_URL in .env

# Test with real documentation site (small)
curl -X POST http://localhost:3000/test/message \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"archon-live","message":"/crawl https://example.com"}'

# Wait for completion, verify knowledge indexed
# Check Archon UI at http://localhost:3737 for indexed pages
```

**Expected**:
- Crawl completes successfully
- Pages visible in Archon knowledge base
- Knowledge base count increases

---

## ACCEPTANCE CRITERIA

- [x] ArchonClient class implements all methods from docs/archon-integration.md
- [x] All ArchonClient methods have complete type annotations (strict TypeScript)
- [x] `/crawl` command triggers crawl and polls for completion
- [x] `/crawl-status` command displays current progress
- [x] Progress updates sent to user during long crawls
- [x] All validation commands pass with zero errors
- [x] Unit test coverage: 100% for ArchonClient
- [x] Error messages are user-friendly (no stack traces exposed)
- [x] Feature gracefully disabled when ARCHON_URL not set
- [x] Help command documents new Archon commands
- [x] Manual test sequence completes successfully
- [x] No regressions in existing tests
- [x] Code follows project conventions (error logging, type safety, patterns)

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully:
  - [ ] Level 1: `npm run type-check` (0 errors)
  - [ ] Level 2: `npm test` (all pass), coverage >100% for new file
  - [ ] Level 3: `npm run lint` and `npm run format:check` (0 errors)
  - [ ] Level 4: Manual test sequence (all scenarios pass)
  - [ ] Level 5: Live Archon test (optional, if available)
- [ ] Full test suite passes (unit + integration)
- [ ] No linting errors
- [ ] No formatting errors
- [ ] No type checking errors
- [ ] Build succeeds (`npm run build`)
- [ ] All acceptance criteria met
- [ ] Code reviewed for quality and maintainability
- [ ] Help documentation updated
- [ ] Environment variable documentation verified

---

## NOTES

**Design Decisions:**

1. **Manual Commands Only (Phase 1)**: This implementation focuses on explicit user control via slash commands. Automatic detection and PIV loop integration are deferred to Phase 2 and Phase 3 (see docs/archon-integration.md:605-636).

2. **Progress Polling**: The `/crawl` command polls for completion rather than returning immediately. This provides better UX but blocks the conversation briefly. Alternative: Return progressId immediately and let users poll manually via `/crawl-status`.

3. **Error Surfacing**: Following SCAR's git-first philosophy, errors from Archon API are surfaced directly to users with minimal wrapping. This helps users debug configuration issues.

4. **Default Depth**: Crawls default to `max_depth: 2` as a balance between coverage and speed. Users can't customize this in Phase 1 (could be added as optional argument in future).

5. **Authentication**: ARCHON_TOKEN is optional. The client sends it if present but doesn't fail if missing (Archon may not require auth in local development).

**Trade-offs:**

- **Blocking vs Async**: Current implementation blocks conversation during crawl. Could use background jobs in future, but adds complexity.
- **Progress Granularity**: Updates every 10% progress. More frequent updates would spam chat; less frequent would feel unresponsive.
- **Timeout**: 5-minute default timeout may be too short for large sites. Configurable via `maxWaitMs` parameter but not exposed to users yet.

**Future Enhancements (Out of Scope):**

- Automatic crawl triggering based on dependency detection (Phase 2)
- Integration with PIV loop commands (Phase 3)
- Custom crawl parameters via command arguments (`/crawl <url> --depth 3 --tags api,docs`)
- Background job processing for non-blocking crawls
- Crawl history and re-crawl management
- Search command to query indexed knowledge (`/search <query>`)

**Dependencies:**

- Requires Archon server running and accessible at ARCHON_URL
- Archon setup documented in docs/archon-integration.md (external to this feature)
- Knowledge search via MCP (Phase 3) requires ENABLE_ARCHON_MCP=true in claude.ts (already implemented)

**Testing Notes:**

- Unit tests mock `node-fetch` to avoid external dependencies
- Integration tests use test adapter to avoid platform-specific setup
- Live Archon testing requires manual setup but is optional for validation
- Consider adding `jest.setTimeout(60000)` for tests that poll progress

**Confidence Score**: 8/10 for one-pass success

- High confidence in client implementation (clear API, existing patterns)
- Medium confidence in command integration (polling logic has edge cases)
- Risk areas: Timeout handling, concurrent crawl management, Archon health checks
- Mitigation: Comprehensive error handling, extensive test coverage, manual validation sequence
