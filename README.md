# Remote Coding Agent - MVP (Telegram + Claude)

Control Claude Code remotely from Telegram with persistent sessions, codebase management, and streaming responses.

## Features

- **Telegram Integration**: Control Claude from anywhere via Telegram
- **Claude Agent SDK**: Full access to Claude's coding capabilities
- **Persistent Sessions**: Sessions survive container restarts
- **Codebase Management**: Clone and work with GitHub repositories
- **Streaming Responses**: Real-time or batch message delivery
- **Docker Ready**: Simple deployment with Docker Compose

## Prerequisites

- **Node.js 20+** (for local development)
- **Docker & Docker Compose** (for containerized deployment)
- **PostgreSQL 18** (managed remotely or via Docker)
- **GitHub Token** (for cloning repositories)
- **Telegram Bot Token** (from [@BotFather](https://t.me/BotFather))
- **Claude API Key** or OAuth Token

## Quick Start

### 1. Create Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow prompts
3. Save the bot token (looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### 2. Get Claude Authentication

**Preferred Method: OAuth Token (for Claude Pro/Max subscribers)**

If you have a Claude Pro or Max subscription:

```bash
# Run this command to generate an OAuth token
claude setup-token

# Copy the generated token - it starts with sk-ant-oat01-...
```

This generates a `CLAUDE_CODE_OAUTH_TOKEN` that works with your subscription and is ideal for containerized environments.

**Alternative: API Key**

If you don't have a subscription or prefer using API credits:

- Visit [console.anthropic.com](https://console.anthropic.com/)
- Navigate to API Keys
- Create a new key (starts with `sk-ant-`)
- Use this as `CLAUDE_API_KEY`

### 3. Environment Setup

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

Required variables in `.env`:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/remote_coding_agent

# Claude - Preferred: OAuth token from `claude setup-token`
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
# OR use API key (if no subscription)
# CLAUDE_API_KEY=sk-ant-...

# GitHub (for /clone command)
GH_TOKEN=ghp_...

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_STREAMING_MODE=stream  # stream | batch

# Optional
WORKSPACE_PATH=./workspace
PORT=3000
```

### 4. Setup Database Tables

Run the migration script to create the required tables:

```bash
# If using Docker Compose with-db profile (local PostgreSQL)
docker-compose --profile with-db up -d postgres
docker-compose exec postgres psql -U postgres -d remote_coding_agent -f /docker-entrypoint-initdb.d/001_initial_schema.sql

# If using remote PostgreSQL
psql $DATABASE_URL -f migrations/001_initial_schema.sql
```

This creates 3 tables with the `remote_agent_` prefix:
- `remote_agent_codebases` - Repository metadata
- `remote_agent_conversations` - Platform conversation tracking
- `remote_agent_sessions` - AI session management

### 5. Start with Docker Compose

**Option A: With local PostgreSQL** (recommended for getting started)

```bash
docker-compose --profile with-db up -d --build
```

**Option B: With remote PostgreSQL**

```bash
# Set DATABASE_URL to your remote Postgres instance
docker-compose up -d --build
```


## Docker Profiles

### `with-db` Profile

Starts **both** the app and PostgreSQL container.

```bash
docker-compose --profile with-db up -d
```

Use when:
- Getting started / testing locally
- Don't have remote PostgreSQL
- Want isolated environment

### Default Profile (no profile flag)

Starts **only** the app container.

```bash
docker-compose up -d
```

Use when:
- Have remote PostgreSQL (Supabase, Neon, RDS, etc.)
- Production deployment
- Want to manage database separately

## Telegram Commands

Once your bot is running, message it on Telegram:

| Command | Description | Example |
|---------|-------------|---------|
| `/help` | Show available commands | `/help` |
| `/clone <url>` | Clone a GitHub repository | `/clone https://github.com/user/repo` |
| `/status` | Show conversation state | `/status` |
| `/getcwd` | Show current working directory | `/getcwd` |
| `/setcwd <path>` | Change working directory | `/setcwd /workspace/repo` |
| `/reset` | Clear active session | `/reset` |

## GitHub Integration

### Prerequisites

- GitHub repository with issues enabled
- GitHub personal access token with `repo` scope
- Public endpoint for webhooks (ngrok for development, or deployed server)

### Setup

**1. Create GitHub Personal Access Token**

Visit [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens)
- Click "Generate new token (classic)"
- Select scopes: `repo` (full control of private repositories)
- Copy token (starts with `ghp_...`)

**2. Expose Local Server (for local development)**

If running locally, start ngrok first to get your public URL:

```bash
# Install ngrok (https://ngrok.com/download)
# Or: choco install ngrok (Windows)
# Or: brew install ngrok (Mac)

# Create a tunnel
ngrok http 3000

# You'll get a URL like: https://abc123.ngrok.io
# Keep this terminal open and note the URL for step 3
```

**Note**: Free ngrok URLs change on restart. For persistent URLs, consider ngrok's paid plan or alternatives like Cloudflare Tunnel.

**3. Configure GitHub Webhook**

**For a single repository:**
- Go to Repository Settings > Webhooks > Add webhook
- **Note**: For multiple personal repositories, you'll need to add the webhook to each repo individually
- **Tip**: You can use the same `WEBHOOK_SECRET` for all repositories

**For all repositories in an organization:**
- Go to Organization Settings > Webhooks > Add webhook
- This webhook will apply to all current and future repos in the org (one-time setup!)

**Webhook configuration:**
- **Payload URL**:
  - **Local dev**: `https://abc123.ngrok.io/webhooks/github` (your ngrok URL from step 2)
  - **Production**: `https://your-domain.com/webhooks/github`
- **Content type**: `application/json`
- **Secret**: Generate a random secret string (e.g., `openssl rand -hex 32`)
- **Events**: Select "Let me select individual events"
  - ✓ Issues
  - ✓ Issue comments
  - ✓ Pull requests
- Click "Add webhook"
- **Save the secret you entered** - you'll need it for step 4

**4. Configure Environment Variables**

```env
# .env
GITHUB_TOKEN=ghp_your_token_here
WEBHOOK_SECRET=your_secret_from_step_3
```

**Important**: The `WEBHOOK_SECRET` must match exactly what you entered in GitHub's webhook configuration.

**5. Start the Application**

```bash
docker-compose up -d
```

### Usage

**Interact with AI by @mentioning in issues or PRs:**

```
@remote-agent can you analyze this bug?
@remote-agent /status
@remote-agent review this implementation
```

**First mention in an issue/PR**:
- Automatically clones repository
- Detects and loads commands from `.claude/commands` or `.agents/commands`
- Injects issue/PR context for Claude

**Subsequent mentions**:
- Resumes conversation
- No context re-injection

**Response Mode**: Batch (single comment, no streaming)

## Usage Example

```
You: /help
Bot: Available Commands:
     /help - Show this help message
     ...

You: /clone https://github.com/anthropics/anthropic-sdk-typescript
Bot: Repository cloned successfully!
     Codebase: anthropic-sdk-typescript
     Path: /workspace/anthropic-sdk-typescript

     You can now start asking questions about the code.

You: What files are in this repo?
Bot: (Claude streams response analyzing the repository structure)

You: How does error handling work?
Bot: (Claude analyzes and explains error handling patterns)

You: /status
Bot: Platform: telegram
     AI Assistant: claude

     Codebase: anthropic-sdk-typescript
     Repository: https://github.com/anthropics/anthropic-sdk-typescript

     Current Working Directory: /workspace/anthropic-sdk-typescript
     Active Session: a1b2c3d4...

You: /reset
Bot: Session cleared. Starting fresh on next message.
     Codebase configuration preserved.
```

## Health Checks

The application exposes two health check endpoints:

```bash
# Basic health check
curl http://localhost:3000/health
# Expected: {"status":"ok"}

# Database connectivity check
curl http://localhost:3000/health/db
# Expected: {"status":"ok","database":"connected"}

# View application logs
docker-compose logs -f app
```

Use these endpoints for:
- Docker healthcheck configuration
- Load balancer health checks
- Monitoring systems

## Streaming Modes

### Stream Mode (Default)

Messages are sent immediately as Claude generates them.

```env
TELEGRAM_STREAMING_MODE=stream
```

**Pros:**
- Real-time feedback
- Feels more interactive
- See progress on long tasks

**Cons:**
- More Telegram API calls
- Might hit rate limits with very long responses

### Batch Mode

Messages are accumulated and sent as a single final response.

```env
TELEGRAM_STREAMING_MODE=batch
```

**Pros:**
- Fewer API calls
- Single coherent message
- Better for short Q&A

**Cons:**
- No progress indication
- Longer wait for first message

## Architecture

```
Telegram Bot (Polling)
      ↓
Orchestrator
      ↓
   ┌──┴──┐
   │     │
Slash   AI
Commands Messages
   │     │
   │     ↓
   │  Claude SDK
   │     ↓
   └──→ PostgreSQL
         (3 tables)
```

### Database Schema

**3 Tables:**
- `remote_agent_codebases` - Repository metadata
- `remote_agent_conversations` - Platform conversation tracking
- `remote_agent_sessions` - AI session management with resume capability

### Key Files

```
src/
├── index.ts              # Entry point
├── types/index.ts        # TypeScript interfaces
├── adapters/
│   └── telegram.ts       # Telegram SDK wrapper
├── clients/
│   └── claude.ts         # Claude SDK wrapper
├── db/
│   ├── connection.ts     # PostgreSQL pool
│   ├── conversations.ts  # Conversation queries
│   ├── codebases.ts      # Codebase queries
│   └── sessions.ts       # Session queries
├── handlers/
│   └── command-handler.ts # Slash command processing
└── orchestrator/
    └── orchestrator.ts   # Main message router
```

## Troubleshooting

### Bot Not Responding

```bash
# Check if app is running
docker-compose ps

# Check app logs
docker-compose logs -f app

# Verify bot token
echo $TELEGRAM_BOT_TOKEN
```

### Database Connection Errors

```bash
# Check database health
curl http://localhost:3000/health/db

# Check PostgreSQL logs
docker-compose logs -f postgres

# Verify DATABASE_URL
echo $DATABASE_URL

# Test database directly
docker-compose exec postgres psql -U postgres -c "SELECT 1"
```

### Clone Command Fails

```bash
# Verify GitHub token
echo $GH_TOKEN

# Check workspace permissions
docker-compose exec app ls -la /workspace

# Try manual clone
docker-compose exec app git clone https://github.com/user/repo /workspace/repo
```

### TypeScript Compilation Errors

```bash
# Clean build
rm -rf dist node_modules
npm install
npm run build

# Check for type errors
npm run type-check
```

### Container Won't Start

```bash
# Check logs for errors
docker-compose logs app

# Verify environment variables
docker-compose config

# Rebuild without cache
docker-compose build --no-cache
docker-compose up -d
```
