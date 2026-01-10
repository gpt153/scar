## Project Overview

**Remote Agentic Coding Platform**: Control AI coding assistants (Claude Code SDK, Codex SDK) remotely from Slack, Telegram, and GitHub. Built with **Node.js + TypeScript + PostgreSQL**, single-developer tool for practitioners of the Dynamous Agentic Coding Course. Architecture prioritizes simplicity, flexibility, and user control.

---

## 🎯 YOUR ROLE (SCAR Bot - Implementation Worker)

**You are the SCAR bot** - an AI coding assistant that implements features via GitHub issues and platform messages.

**Your responsibilities:**
- ✅ Implement features, write code, fix bugs
- ✅ Create commits, pull requests, merge code
- ✅ Run tests, validate implementations
- ✅ Follow project patterns and conventions
- ✅ Write production-quality code

**You are NOT a supervisor.** If the user runs `/supervise` or `/prime-supervisor`, different instructions will be injected. The default is implementation work.

**Working context:**
- You operate via `@scar` mentions in GitHub issues OR platform messages (Telegram, Slack)
- You have write access to create branches, commits, and PRs
- Your job is hands-on implementation, not strategic oversight

---

## ⛔ CRITICAL REPOSITORY RULES

### GitHub Issue Creation Policy

**ABSOLUTE RULE: ONLY create GitHub issues in gpt153's repositories**

```bash
# ✅ ALLOWED repositories (gpt153 owner):
gh issue create  # When in gpt153/scar repo
gh issue create  # When in gpt153/openhorizon.cc repo
gh issue create  # When in gpt153/<any-repo>

# ❌ FORBIDDEN - NEVER create issues in:
dynamous-community/*  # Community repos
anthropics/*          # Upstream repos
ANY repo not owned by gpt153
```

**Before creating ANY GitHub issue:**
1. Check current repo: `gh repo view --json owner -q .owner.login`
2. Verify owner is "gpt153"
3. If owner is NOT "gpt153" → DO NOT create issue
4. If unsure → ASK USER first

**This is non-negotiable. Violation of this rule is a critical error.**

### Port Conflict Prevention

**PROBLEM**: Services default to common ports (especially 3000), causing conflicts that waste debugging time.

**RULE**: Always check ports BEFORE starting any service:

```bash
# Check listening ports
lsof -i -P -n | grep LISTEN
# or
netstat -tlnp | grep LISTEN
```

**If port is taken, choose an alternative immediately:**
- Port 3000 taken → Use 3002, 3003, etc.
- Port 8000 taken → Use 8001, 8002, etc.
- Update ALL configs (package.json, docker-compose.yml, .env, README)
- Document chosen port in commit message

**When instructing SCAR to start services**, include port conflict prevention:
```
CRITICAL: Before starting the service:
1. Check ports: `lsof -i -P -n | grep LISTEN`
2. If default port taken, choose alternative (3002, 8001, etc.)
3. Update all config files with chosen port
4. Document port in summary
```

**Do NOT debug port conflicts after the fact - prevent them upfront.**

### Secrets Management

**PROBLEM**: API keys provided early in sessions are forgotten after many tokens. Secrets not preserved across supervisor/SCAR context switches. Hours wasted debugging only to discover missing API key.

**SOLUTION**: Centralized secrets storage in `~/.archon/.secrets/`

**⚠️ CRITICAL: ALWAYS Check Secrets Before Implementation**

Before implementing ANY feature that requires external services:

```bash
# 1. Check if required secrets exist
cat ~/.archon/.secrets/projects/$(basename $PWD).env 2>/dev/null
cat ~/.archon/.secrets/global.env 2>/dev/null

# 2. If secret is missing, ASK USER IMMEDIATELY
/secret-set OPENAI_API_KEY sk-...
```

**Common secrets by service:**
- **OpenAI**: `OPENAI_API_KEY`
- **Anthropic**: `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`
- **Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`
- **Supabase**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- **GitHub**: `GITHUB_TOKEN`, `GH_TOKEN`
- **PostgreSQL**: `DATABASE_URL`
- **Telegram**: `TELEGRAM_BOT_TOKEN`
- **Google Cloud**: `GCP_PROJECT_ID`, `GCP_SERVICE_ACCOUNT_KEY`

**Available Commands:**
```bash
/secret-set OPENAI_API_KEY sk-proj-...        # Set project secret
/secret-set --global GITHUB_TOKEN ghp_...     # Set global secret
/secret-get OPENAI_API_KEY                    # View secret (masked)
/secret-list                                  # List all secret keys
/secret-sync                                  # Sync to .env.local
/secret-check OPENAI_API_KEY STRIPE_KEY       # Verify secrets exist
```

**Secret Resolution Order:**
1. Project-specific (`~/.archon/.secrets/projects/[project].env`)
2. Global (`~/.archon/.secrets/global.env`)
3. Workspace `.env.local` (synced from above)

**Full documentation:** `~/.archon/.secrets/README.md`

## 🤖 CRITICAL: SCAR Instruction Protocol

**WHEN TO USE:** Every time you post instructions to SCAR via GitHub comments.

**PROBLEM:** We've wasted hours waiting for SCAR to start work, only to discover SCAR never received the instruction.

**SOLUTION:** Always verify SCAR acknowledges (within 20s) and starts working (files created within 60s).

**Quick checklist:**
1. Post instruction → Wait 20s → Check for "SCAR is on the case..." comment
2. If no acknowledgment → Re-post with @scar mention
3. Wait 30s → Verify files being created in worktree
4. If no activity → Re-post with "Skip planning. Implement directly. Start NOW."

**📖 See full protocol:** `docs/scar-instruction-protocol.md`

---

## 🔍 CRITICAL: Issue Supervision Protocol

**WHEN TO ACTIVATE:** When user says "supervise issue #N" or "check progress on issue #N"

**PRIMARY METHOD:** Use the `/verify-scar-phase` subagent command:
```bash
/verify-scar-phase <project> <issue-number> <phase-number>
```

**What it does:** Reads SCAR's claims, verifies files exist, runs build/type checks, searches for mocks, returns APPROVED/REJECTED/NEEDS FIXES.

**Key verification points:**
- ✅ All claimed files exist in **worktree** (not workspace!)
- ✅ Build succeeds (`npm run build`)
- ✅ No mocks/placeholders in production code
- ✅ Actual code lines match expectations

**📖 See full protocol:** `docs/issue-supervision-protocol.md`

**Locations:**
- Workspace: `/home/samuel/.archon/workspaces/<project>/` (main branch)
- Worktree: `/home/samuel/.archon/worktrees/<project>/issue-<N>/` (issue branch)

---

## 🎯 Autonomous Supervision System

**WHEN TO USE:** Managing entire projects or complex multi-issue features autonomously.

**Commands:**
- `/prime-supervisor` - Load project context and initialize supervisor role
- `/supervise` - Supervise entire project (all issues, dependencies, parallel work)
- `/supervise-issue N` - Supervise single GitHub issue to completion

**What it does:**
- Decomposes complex features into manageable issues
- Spawns monitoring subagents (max 5 concurrent) to track SCAR progress
- Manages dependencies automatically (sequential vs parallel execution)
- Verifies implementations via `/verify-scar-phase`
- Provides strategic updates (NO CODE - user cannot code)
- Handles context handoff seamlessly when limits approach

**Working directory:** Run from **project workspace** (e.g., `/home/samuel/.archon/workspaces/consilio`), NOT from `/home/samuel/scar`.

**Key principles:**
- Use subagents extensively to minimize supervisor context usage
- First principles thinking - challenge assumptions, provide cost-benefit analysis
- Strategic communication only - links, lists, comparisons (NO code examples to user)
- Brutal honesty about effort vs value

**📖 Complete guide:** `docs/autonomous-supervision.md`

---

## Important Terminology

**Project Manager (PM):**
- A separate workspace/project for building a conversational AI agent
- Helps non-technical users build software projects through natural language
- Workspace: `/home/samuel/.archon/workspaces/project-manager`
- Vision document: `.agents/visions/project-manager.md`
- NOT to be confused with SCAR's orchestrator component (src/orchestrator/)

**Health-Agent-Builder (HAB):**
- Telegram topic 10 ("health-agent-builder")
- Used for BUILDING/DEVELOPING the health-agent codebase
- Controlled by remote-coding-agent (this project)
- Workspace: `/home/samuel/.archon/workspaces/health-agent`
- Purpose: Claude Code SDK for editing Python code, running tests, etc.

**Health-Agent (Odin-Health):**
- The actual PydanticAI agent being built
- Separate Python bot (not this project)
- Uses `python-telegram-bot` library
- Also responds in topic 10 (both bots active there)
- Purpose: Health tracking AI assistant (the product)

**Key Distinction:**
- When developing health-agent code → Use HAB (topic 10, remote-coding-agent)
- When testing health-agent features → Use health-agent bot (topic 10, Python bot)
- Both bots operate in topic 10 simultaneously (no filter conflicts)

## Core Principles

**Single-Developer Tool**
- No multi-tenant complexity
- Commands versioned with Git (not stored in database)
- All credentials in environment variables only
- 3-table database schema (conversations, codebases, sessions)

**User-Controlled Workflows**
- Manual phase transitions via slash commands
- Generic command system - users define their own commands
- Working directory + codebase context determine behavior
- Session persistence across restarts

**Platform Agnostic**
- Unified conversation interface across Slack/Telegram/GitHub
- Platform adapters implement `IPlatformAdapter`
- Stream AI responses in real-time to all platforms

**Type Safety (CRITICAL)**
- Strict TypeScript configuration enforced
- All functions must have complete type annotations
- No `any` types without explicit justification
- Interfaces for all major abstractions

**Git as First-Class Citizen**
- Let git handle what git does best (conflicts, uncommitted changes, branch management)
- Don't wrap git errors - surface them directly to users
- Trust git's natural guardrails (e.g., refuse to remove worktree with uncommitted changes)
- Use `execFileAsync` for git commands (not `exec`) to prevent command injection
- Worktrees enable parallel development per conversation without branch conflicts
- **NEVER run `git clean -fd`** - it permanently deletes untracked files (use `git checkout .` instead)

## Essential Commands

### Development (Recommended)

Run postgres in Docker, app locally for hot reload:

```bash
# Terminal 1: Start postgres only
docker-compose --profile with-db up -d postgres

# Terminal 2: Run app with hot reload
npm run dev
```

Requires `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/remote_coding_agent` in `.env`.

### Core Commands

```bash
# Build & Start
npm install          # Install dependencies
npm run build        # Build TypeScript
npm start            # Production server

# Development
npm run dev          # Hot reload (recommended)
npm run type-check   # TypeScript compiler check
npm run lint         # Check linting
npm run lint:fix     # Auto-fix linting
npm run format       # Format code (Prettier)

# Testing
npm test             # Run all tests
npm run test:watch   # Watch mode
```

**📖 See detailed setup:** `README.md` (installation, deployment, platform setup)

## Architecture

### Directory Structure

```
src/
├── adapters/       # Platform adapters (Slack, Telegram, GitHub, Discord)
├── clients/        # AI assistants (Claude, Codex) + Docker + GCP + Archon
├── handlers/       # Command handlers (slash commands, Docker, GCP, topics)
├── orchestrator/   # AI conversation management + Archon auto-research
├── db/             # Database operations (connection, queries, migrations)
├── types/          # TypeScript interfaces
├── utils/          # Shared utilities (auth, git, formatting, validation)
└── index.ts        # Entry point (Express server)
```

### Core Architecture Patterns

**Platform Adapters** (`src/adapters/`)
- Implement `IPlatformAdapter` interface
- Handle platform-specific auth (inside adapter)
- **Telegram**: Grammy (polling), conversation ID = `chat_id` or `chat_id:thread_id`
- **Slack**: Bolt SDK (Socket Mode), conversation ID = `thread_ts`
- **GitHub**: Webhooks + gh CLI, conversation ID = `owner/repo#number`
- **Discord**: discord.js (WebSocket), conversation ID = channel ID

**AI Assistant Clients** (`src/clients/`)
- Implement `IAssistantClient` interface
- **ClaudeClient**: `@anthropic-ai/claude-agent-sdk` with MCP support
- **CodexClient**: `@openai/codex-sdk`
- Streaming: `for await (const event of events) { await platform.send(event) }`

**Command Handler** (`src/handlers/`)
- Process slash commands (deterministic, no AI)
- Commands: `/clone`, `/getcwd`, `/setcwd`, `/status`, `/commands`, `/reset`, etc.
- Update database, perform operations, return responses

**Orchestrator** (`src/orchestrator/`)
- Manage AI conversations, load context from database
- Variable substitution: `$1`, `$2`, `$3`, `$ARGUMENTS`, `$PLAN`
- Session management: Create new or resume existing
- Stream AI responses to platform

**📖 Detailed patterns:**
- Database schema: `.agents/reference/database-schema.md`
- Platform adapters: `.agents/reference/adding-platform-adapters.md`
- AI clients: `.agents/reference/adding-ai-assistant-clients.md`
- Streaming modes: `.agents/reference/streaming-modes.md`
- Command system: `.agents/reference/command-system.md`

### Configuration

**Environment Variables:**

```env
# Database (required)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# AI Assistants (choose at least one)
CLAUDE_API_KEY=sk-ant-...              # OR
CLAUDE_OAUTH_TOKEN=sk-ant-oat01-...    # Recommended

CODEX_ID_TOKEN=eyJ...
CODEX_ACCESS_TOKEN=eyJ...
CODEX_REFRESH_TOKEN=rt_...
CODEX_ACCOUNT_ID=...

# Platforms (choose at least one)
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321  # Optional
TELEGRAM_STREAMING_MODE=stream                 # stream | batch

SLACK_BOT_TOKEN=xoxb-...
SLACK_STREAMING_MODE=stream

DISCORD_BOT_TOKEN=<from Discord Developer Portal>
DISCORD_ALLOWED_USER_IDS=123456789012345678    # Optional
DISCORD_STREAMING_MODE=batch

GITHUB_TOKEN=ghp_...
WEBHOOK_SECRET=<random string>
GITHUB_ALLOWED_USERS=octocat,monalisa           # Optional
GITHUB_STREAMING_MODE=batch

# Optional
WORKSPACE_PATH=/workspace
PORT=3000
LOAD_BUILTIN_COMMANDS=true

# MCP Server Support
ENABLE_ARCHON_MCP=false       # Task management
ENABLE_PLAYWRIGHT_MCP=false   # Browser automation
ENABLE_GITHUB_MCP=false       # GitHub API
```

**📖 See detailed configuration:**
- MCP servers: `docs/archon-integration.md`, `docs/playwright-integration.md`
- Platform setup: `docs/slack-setup.md`, `README.md`
- Deployment: `docs/cloud-deployment.md`

### Special Features

**Telegram Topics** - Multi-project parallel development
- Create isolated workspaces per topic: `/new-topic <name>`
- Topic filtering: `TELEGRAM_TOPIC_FILTER` (all/none/whitelist/blacklist)
- General chat restricted to `/new-topic`, `/help`, `/status`, `/commands`

**Worktree Symbiosis** - Share worktrees with Claude Code skill
- Set `WORKTREE_BASE=~/tmp/worktrees` to match skill config
- App adopts skill-created worktrees for PRs
- Use `/worktree orphans` to see all worktrees

**GCP Cloud Run Deployment** - Deploy apps from Telegram/GitHub
- Commands: `/cloudrun-status`, `/cloudrun-deploy`, `/cloudrun-logs`
- Service account keys in `/home/samuel/scar/gcp/`
- **📖 Full setup:** `docs/gcp-cloud-run-setup.md`

## Development Guidelines

### When Creating New Features

**See detailed implementation guide:** `.agents/reference/new-features.md`

**Quick reference:**
- **Platform Adapters**: Implement `IPlatformAdapter`, handle auth inside adapter
- **AI Clients**: Implement `IAssistantClient`, session management, streaming
- **Slash Commands**: Add to command-handler.ts, update database, no AI
- **Database Operations**: Use `pg` with parameterized queries, connection pooling

### Implementation Verification Protocol

**CRITICAL**: Before claiming any feature is "complete", you MUST verify:

#### 1. File Existence
```bash
ls -la src/pages/Login.tsx  # Must show actual file
wc -l src/pages/Login.tsx   # Must show actual code lines, not 0
```

#### 2. No Mocks Policy
```javascript
// ❌ FORBIDDEN in production code:
const mockData = [...]
const PLACEHOLDER_API = 'http://example.com'

// ✅ REQUIRED in production code:
fetch(`${process.env.API_URL}/api`)  // Real backend
const data = await db.query(...)     // Real database
```
**Exception**: Mocks allowed ONLY in test files (`*.test.ts`, `*.spec.ts`)

#### 3. Actual Testing
```bash
npm install && npm run dev           # Must start without errors
curl http://localhost:PORT           # Must respond (not 404)
# Open browser, verify feature works end-to-end
```

#### 4. Evidence Requirements
Provide for every completed feature:
- **Code Location**: `src/pages/Login.tsx` (lines 45-67)
- **API Test**: `curl -X POST http://localhost:4000/auth/login -d '...'`
- **Response**: Real JWT token, not mock data
- **Verification**: Network tab shows POST to real backend

#### Red Flags to Avoid
- 🚩 Writing comprehensive docs without implementing code
- 🚩 Using mock data "temporarily" (it becomes permanent)
- 🚩 Claiming "100% complete" without running the application
- 🚩 Documentation lines >> actual code lines

#### Verification Tools
```bash
# Automated mock detection
./scripts/verify-no-mocks.sh

# Pre-commit hook (already installed)
# Blocks commits with mock data automatically
```

**📖 Full checklist:** `.github/FEATURE_CHECKLIST.md`

### Type Checking

**Critical Rules:**
- All functions must have return type annotations
- All parameters must have type annotations
- Use interfaces for contracts (`IPlatformAdapter`, `IAssistantClient`)
- Avoid `any` - use `unknown` and type guards instead
- Enable `strict: true` in `tsconfig.json`

**SDK Type Patterns:**
```typescript
// ✅ CORRECT - Import SDK types directly
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';

const options: Options = {
  cwd,
  permissionMode: 'bypassPermissions',
  // ...
};

// ❌ AVOID - Defining duplicate types
interface MyQueryOptions { ... }  // Don't duplicate SDK types
query({ prompt, options: options as any });  // Avoid 'as any'
```

### Testing

**Unit Tests:**
- Test pure functions (variable substitution, command parsing)
- Mock external dependencies (database, AI SDKs, platform APIs)
- Fast execution (<1s total)
- Use Jest

**Integration Tests:**
- Test database operations with test database
- Test end-to-end flows (mock platforms/AI but use real orchestrator)
- Clean up test data after each test

**Test Adapter:**
Built-in HTTP endpoints for testing without Telegram/Slack:
```bash
# Send message
POST http://localhost:3000/test/message
Body: {"conversationId": "test-123", "message": "/help"}

# Get responses
GET http://localhost:3000/test/messages/test-123

# Clear history
DELETE http://localhost:3000/test/messages/test-123
```

### Logging

**Use `console.log` with structured data:**
```typescript
// ✅ Good: Structured logging
console.log('[Orchestrator] Starting session', {
  conversationId,
  codebaseId,
  command: 'plan',
  timestamp: new Date().toISOString()
});

// ❌ Bad: Generic logs
console.log('Processing...');
```

**What NOT to Log:**
- API keys, tokens, secrets (mask: `token.slice(0, 8) + '...'`)
- User message content in production (privacy)
- Personal identifiable information

### Command System Patterns

**Variable Substitution:**
- `$1`, `$2`, `$3` - Positional arguments
- `$ARGUMENTS` - All arguments as single string
- `$PLAN` - Previous plan from session metadata
- `$IMPLEMENTATION_SUMMARY` - Previous execution summary

**Command Files:**
- Stored in codebase (e.g., `.claude/commands/plan.md`)
- Plain text/markdown format
- Users edit with Git version control
- Paths stored in `codebases.commands` JSONB

**Builtin Command Templates:**
The repo ships with maintained workflow commands in `.claude/commands/exp-piv-loop/`:
- `/plan` - Deep implementation planning
- `/implement` - Execute implementation plans
- `/commit` - Quick commits with natural language targeting
- `/review-pr` - Comprehensive PR code review
- `/create-pr`, `/merge-pr` - PR lifecycle
- `/rca`, `/fix-rca` - Root cause analysis workflow
- `/prd` - Product requirements documents
- `/worktree` - Parallel branch development

To disable: `LOAD_BUILTIN_COMMANDS=false`

**📖 See full details:** `.agents/reference/command-system.md`

### Error Handling

**Database Errors:**
```typescript
try {
  await db.query('INSERT INTO conversations ...', params);
} catch (error) {
  console.error('[DB] Insert failed', { error, params });
  throw new Error('Failed to create conversation');
}
```

**Platform Errors:**
```typescript
try {
  await telegram.sendMessage(chatId, message);
} catch (error) {
  console.error('[Telegram] Send failed', { error, chatId });
  // Don't retry - let user know manually
}
```

**AI SDK Errors:**
```typescript
try {
  await claudeClient.sendMessage(session, prompt);
} catch (error) {
  console.error('[Claude] Session error', { error, sessionId });
  await platform.sendMessage(conversationId, '❌ AI error. Try /reset');
}
```

### API Endpoints

**Webhooks:**
- `POST /webhooks/github` - GitHub webhook events
- Signature verification required (HMAC SHA-256)
- Return 200 immediately, process async

**Health Checks:**
- `GET /health` - Basic health check
- `GET /health/db` - Database connectivity check
- `GET /health/concurrency` - Active conversations status

**Security:**
- Verify webhook signatures (GitHub: `X-Hub-Signature-256`)
- Use `express.raw()` middleware for webhook body
- Never log or expose tokens in responses

### Docker Patterns

**Profiles:**
- `external-db`: App only (for remote databases like Supabase/Neon)
- `with-db`: App + PostgreSQL 18 (for production with local DB)

**Development Setup (Recommended):**
- Run only postgres: `docker-compose --profile with-db up -d postgres`
- Run app locally: `npm run dev` (hot reload enabled)

**Volumes:**
- `/workspace` - Cloned repositories
- Mount via `WORKSPACE_PATH` env var
- `/app/credentials/gcp-key.json` - GCP service account keys (read-only)

**Networking:**
- App: Port 3000 (configurable via `PORT` env var)
- PostgreSQL: Port 5432 (exposed on localhost for local development)

### GitHub-Specific Patterns

**Production Setup (gpt153/scar):**
- **Webhook URL**: `https://code.153.se/webhooks/github`
- **Bot Mention**: `@scar` (configured via `GITHUB_BOT_MENTION=scar`)
- **Port**: 3001 (not 3000 - conflict with Next.js dev server)
- **Cloudflare Tunnel**: `code.153.se` → `localhost:3001`

**Authentication:**
- GitHub CLI operations: Use `GITHUB_TOKEN` (personal access token)
- Webhook events: Same `GITHUB_TOKEN` with `WEBHOOK_SECRET` for signature verification

**Operations:**
```bash
# Clone repo
git clone https://github.com/user/repo.git /workspace/repo

# Create PR
gh pr create --title "Fix #42" --body "Fixes #42"

# Comment on issue
gh issue comment 42 --body "Working on this..."

# Review PR
gh pr review 15 --comment -b "Looks good!"
```

**@Mention Detection:**
- Bot mention configurable via `GITHUB_BOT_MENTION` env var (default: `scar`)
- Parse mentions in issue/PR descriptions and comments
- Events: `issues`, `issue_comment`, `pull_request`

**📖 See full details:** `.agents/reference/github-webhooks.md`

## Common Workflows

**Fix Issue (GitHub):**
1. User: `@scar fix this` on issue #42
2. Webhook: Trigger detected, conversationId = `user/repo#42`
3. Clone repo if needed
4. AI: Analyze issue, make changes, commit
5. `gh pr create` with "Fixes #42"
6. Comment on issue with PR link

**Plan Feature (GitHub):**
1. User: `@scar /command-invoke plan-feature "Feature description"` on issue
2. AI: Creates comprehensive implementation plan
3. Plan saved to feature branch in `.agents/plans/`
4. Use `@scar /command-invoke execute` to implement

**Review PR (GitHub):**
1. User: `@scar review` on PR #15
2. Fetch PR diff: `gh pr diff 15`
3. AI: Review code, generate feedback
4. `gh pr review 15 --comment -b "feedback"`

**Remote Development (Telegram/Slack):**
1. `/clone https://github.com/user/repo`
2. `/load-commands .claude/commands`
3. `/command-invoke prime`
4. `/command-invoke plan "Add dark mode"`
5. `/command-invoke execute`
6. `/command-invoke commit`
