# Archon Automatic Research Workflow

## Overview

The Archon Automatic Research Workflow (Phase 2 & 3) provides intelligent, zero-touch documentation access by automatically detecting dependencies in user prompts and leveraging Archon's knowledge base.

This feature extends the manual `/crawl` commands (Phase 1) with:
- **Phase 2**: Automatic dependency detection and documentation indexing
- **Phase 3**: PIV loop integration for knowledge-first workflows

## Architecture

### Phase 2: Orchestrator Auto-Detection

```
User Message: "Implement Supabase real-time subscriptions"
         ↓
Dependency Detector: Detects "Supabase"
         ↓
Knowledge Evaluator: Checks if worth indexing (YES)
         ↓
Orchestrator: Generates Archon instructions
         ↓
Claude Instance: Receives prompt with auto-research instructions
         ↓
Claude: Checks Archon MCP, auto-crawls if missing
         ↓
User: Receives response with fresh documentation
```

### Components

#### 1. Dependency Detector (`src/utils/dependency-detector.ts`)

Parses user prompts for external dependencies and maps them to documentation URLs.

**Features:**
- Database of 30+ known frameworks, libraries, services
- Pattern matching with word boundaries (avoids false positives)
- Category classification (framework, library, service, database, platform)
- Case-insensitive detection

**Example:**
```typescript
import { detectDependencies } from './utils/dependency-detector';

const deps = detectDependencies("Build a Next.js app with Supabase and Stripe");
// Returns: [
//   { name: "Next.js", docsUrl: "https://nextjs.org/docs", category: "framework" },
//   { name: "Supabase", docsUrl: "https://supabase.com/docs", category: "service" },
//   { name: "Stripe", docsUrl: "https://stripe.com/docs", category: "service" }
// ]
```

#### 2. Knowledge Evaluator (`src/utils/knowledge-evaluator.ts`)

Determines if a detected dependency should be indexed based on popularity, stability, and value.

**Evaluation Criteria:**
- ✅ Not deprecated (blocks AngularJS, Backbone, etc.)
- ✅ Not low-value (blocks Lodash, jQuery, etc.)
- ✅ Has valid documentation URL
- ✅ Valuable category (framework, library, service, database, platform)

**Example:**
```typescript
import { isWorthIndexing } from './utils/knowledge-evaluator';

const react = { name: "React", docsUrl: "https://react.dev", category: "framework" };
isWorthIndexing(react); // true

const lodash = { name: "Lodash", docsUrl: "https://lodash.com", category: "library" };
isWorthIndexing(lodash); // false (low-value)
```

#### 3. Archon Auto-Research (`src/orchestrator/archon-auto-research.ts`)

Orchestrates the automatic research workflow by generating instructions for Claude instances.

**Three Crawl Strategies:**

1. **Background Mode** (Default, Recommended)
   - Triggers crawl but doesn't wait
   - Responds immediately with available knowledge
   - Documentation available for future requests
   - Best for: Production use, responsive UX

2. **Blocking Mode**
   - Waits for crawl completion (with timeout)
   - Uses freshly indexed documentation in response
   - Best for: Critical accuracy, first-time setup

3. **Suggest Mode**
   - Asks user for permission before crawling
   - Best for: User control, bandwidth-conscious environments

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Enable Archon MCP (required for auto-research)
ENABLE_ARCHON_MCP=true
ARCHON_MCP_URL=http://localhost:8051/mcp
ARCHON_TOKEN=  # Optional

# Enable Auto-Research
ARCHON_AUTO_CRAWL=true

# Choose crawl strategy
ARCHON_CRAWL_STRATEGY=background  # background | blocking | suggest

# Blocking mode timeout (milliseconds)
ARCHON_CRAWL_MAX_WAIT=60000  # 60 seconds
```

### Supported Strategies

| Strategy | Behavior | Latency | Use Case |
|----------|----------|---------|----------|
| `background` | Crawl async, respond immediately | ~0ms | Production (default) |
| `blocking` | Wait for crawl, timeout after N ms | Up to N ms | Critical accuracy |
| `suggest` | Ask user permission | Varies | User control |
| `disabled` | No auto-crawl | 0ms | Disable feature |

## Phase 3: PIV Loop Integration

The PIV (Prime-Investigate-Validate) loop commands now prioritize Archon knowledge base:

### Enhanced `/prime` Command

**New Step 0: Check Archon Knowledge Base**

```markdown
📚 Archon Knowledge Base Status:
✅ Indexed: React (v18 docs, 3,456 chunks), PostgreSQL (Official docs, 2,134 chunks)
❌ Missing: Express.js, Jest
💡 Recommend: /crawl https://expressjs.com for Express documentation
```

Reports:
- Which dependencies already have docs indexed
- Which are missing
- Crawl recommendations for gaps

### Enhanced `/plan` Command

**New Phase 2.0: Check Archon Before Web Search**

1. Queries Archon knowledge base first
2. Searches for code examples
3. Falls back to web search only if not found
4. Includes Archon citations in plan:
   - `[Source: React Docs (Archon) - Hooks Section]`

### Enhanced `/implement` Command

**New Step 3.1: Research During Implementation**

Priority order:
1. ✅ Check Archon FIRST (if MCP available)
2. ⬇️ Fall back to WebSearch (if not found)

Benefits:
- Faster than web search (no parsing)
- Indexed docs are vetted and version-specific
- Consistent with plan's research

## Usage Examples

### Example 1: Background Mode (Default)

```
User: "Add Stripe payment integration"

Bot: "🔍 Detected Stripe dependency - indexing documentation in background...

     To integrate Stripe payments, we'll use the official Stripe SDK...
     [implementation details]"

[Crawl happens in background, docs ready for next request]
```

### Example 2: Blocking Mode

```
User: "How do I use Supabase real-time?"

Bot: "🔍 Detected Supabase - indexing documentation (this may take a moment)...

     [Waits up to 60 seconds for crawl completion]

     Based on the official Supabase docs (just indexed):

     Supabase real-time subscriptions work by...
     [detailed answer using fresh docs]"
```

### Example 3: Suggest Mode

```
User: "Build a Discord bot"

Bot: "📚 Would you like me to index Discord.js documentation for better context?

     Indexing the official Discord.js docs will help me provide more accurate
     code examples and up-to-date API references. This will take ~30 seconds.

     Reply 'yes' to index, or I can proceed with general knowledge."

User: "yes"

Bot: "🔍 Indexing Discord.js documentation...
     ✅ Discord.js docs indexed (1,234 pages)

     Now, for building a Discord bot...
     [detailed answer using indexed docs]"
```

### Example 4: PIV Loop with Archon

```
User: /command-invoke prime

Bot: "📚 Archon Knowledge Base Status:
     ✅ Indexed: React (v18 docs), PostgreSQL (v15 docs), Express (v4 docs)
     ❌ Missing: Jest (testing framework)
     💡 Recommend: Run /crawl https://jestjs.io/docs to index Jest docs

     📋 Project Overview:
     - Type: Full-stack web application
     - Technologies: React, Express, PostgreSQL
     [... rest of prime output ...]"

User: /command-invoke plan "Add unit tests"

Bot: "[Checks Archon for Jest docs]

     Note: Jest documentation not found in Archon. Using web search as fallback.

     ## Implementation Plan: Add Unit Tests

     ### External Research
     - [Jest Docs](https://jestjs.io/docs) - Official documentation (via WebSearch)
     [... plan continues ...]

     Recommendation: Consider running /crawl https://jestjs.io/docs for future reference"
```

## Dependency Database

### Currently Supported (30+ dependencies)

**Frontend Frameworks:**
- React, Vue, Angular, Svelte, Next.js

**Backend Frameworks:**
- Express, FastAPI, Django, Flask, NestJS

**Services:**
- Supabase, Firebase, Stripe, Vercel, AWS

**Databases:**
- PostgreSQL, MongoDB, Redis, MySQL

**Libraries:**
- Discord.js, Telegraf, Grammy, Socket.io, Prisma, TypeORM, Zod, Tailwind CSS, GraphQL, Axios, Jest, Vitest

### Adding New Dependencies

Edit `src/utils/dependency-detector.ts`:

```typescript
const KNOWN_DEPENDENCIES: DetectedDependency[] = [
  // ... existing deps ...
  {
    name: 'YourFramework',
    docsUrl: 'https://yourframework.dev/docs',
    category: 'framework', // or 'library', 'service', 'database', 'platform'
    keywords: ['yourframework', 'your-framework'], // lowercase variations
  },
];
```

### Blocklist (Won't Index)

**Deprecated:**
- AngularJS, Backbone, Knockout

**Low-Value:**
- Lodash, jQuery, Moment.js

**Internal:**
- Add your company-specific tools to blocklist in `src/utils/knowledge-evaluator.ts`

## Testing

### Unit Tests

```bash
# Test dependency detection
npm test -- src/utils/dependency-detector.test.ts

# Test knowledge evaluation
npm test -- src/utils/knowledge-evaluator.test.ts

# Test auto-research orchestration
npm test -- src/orchestrator/archon-auto-research.test.ts
```

### Integration Testing

1. **Enable Archon MCP and Auto-Crawl:**
   ```bash
   ENABLE_ARCHON_MCP=true
   ARCHON_AUTO_CRAWL=true
   ARCHON_CRAWL_STRATEGY=blocking
   ```

2. **Test auto-detection:**
   ```
   User: "How do I use Supabase authentication?"
   Expected: Bot detects Supabase, checks Archon, crawls if missing
   ```

3. **Test prime command:**
   ```
   User: /command-invoke prime
   Expected: Reports Archon knowledge base status
   ```

4. **Test plan command:**
   ```
   User: /command-invoke plan "Add real-time features"
   Expected: Checks Archon before web search
   ```

## Performance

### Latency Impact

| Mode | Added Latency | Notes |
|------|---------------|-------|
| Background | ~5-50ms | Dependency detection + instruction generation |
| Blocking | Up to timeout | Default 60s, configurable |
| Suggest | 0ms (until user confirms) | No impact until user approves |
| Disabled | 0ms | Feature off |

### Optimization Tips

1. **Use Background Mode** for production (default)
2. **Increase `ARCHON_CRAWL_MAX_WAIT`** if crawls timeout frequently
3. **Pre-index common docs** using manual `/crawl` commands
4. **Monitor Archon knowledge base** via `mcp__archon__rag_get_available_sources()`

## Troubleshooting

### Auto-Research Not Working

**Check 1: Is Archon MCP enabled?**
```bash
# In .env
ENABLE_ARCHON_MCP=true
```

**Check 2: Is auto-crawl enabled?**
```bash
# In .env
ARCHON_AUTO_CRAWL=true
```

**Check 3: Is Archon running?**
```bash
curl http://localhost:8051/mcp
# Should return MCP server info
```

**Check 4: Check orchestrator logs:**
```
[Orchestrator] Injected Archon auto-research instructions
```

### Dependency Not Detected

**Reason 1: Not in database**
- Add to `KNOWN_DEPENDENCIES` in `src/utils/dependency-detector.ts`

**Reason 2: Keyword mismatch**
- Add keyword variations to existing entry

**Reason 3: Blocked or low-value**
- Check `knowledge-evaluator.ts` blocklist

### Crawl Not Triggered

**Reason 1: Dependency already indexed**
- Check Archon: `mcp__archon__rag_get_available_sources()`

**Reason 2: Crawl strategy is 'suggest'**
- User must approve first

**Reason 3: Dependency filtered out**
- Check if blocklisted or low-value

## Future Enhancements

### Planned Features

1. **Automatic Re-Crawling**
   - Detect stale documentation (>30 days old)
   - Auto-refresh on version updates

2. **Dependency Version Detection**
   - Parse package.json/requirements.txt for versions
   - Crawl version-specific docs

3. **Usage Analytics**
   - Track which dependencies are most requested
   - Prioritize indexing based on usage

4. **Custom Dependency Lists**
   - Per-project dependency databases
   - User-defined blocklists

5. **Smart Chunking**
   - Optimize chunk sizes for better RAG performance
   - Prioritize high-value sections

## Related Documentation

- [Archon Integration Guide](../README.md#archon-integration)
- [MCP Server Configuration](./.env.example)
- [PIV Loop Commands](./.claude/commands/exp-piv-loop/)
- [Archon Rules](./.agents/reference/archon-rules.md)

## Credits

- **Phase 1**: Manual crawl commands (foundation)
- **Phase 2**: Automatic dependency detection and orchestrator integration
- **Phase 3**: PIV loop enhancements for knowledge-first workflows
