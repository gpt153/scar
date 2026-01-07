---
description: Prime agent with current project understanding (CLI: supports project name argument)
---

# Prime Project: Load Current Project Context

## Objective

Build comprehensive understanding of SCAR's capabilities AND the current/specified project, but only summarize the project details to the user.

## Process

### 0. Determine Target Project

**If project name provided as argument (`$1`):**

1. **Search for project in standard locations:**
   ```bash
   # Check workspace
   if [ -d "/home/samuel/.archon/workspaces/$1" ]; then
     PROJECT_PATH="/home/samuel/.archon/workspaces/$1"
   # Check worktrees (find most recent)
   elif [ -d "/home/samuel/.archon/worktrees/$1" ]; then
     PROJECT_PATH=$(find "/home/samuel/.archon/worktrees/$1" -maxdepth 1 -type d | head -1)
   else
     echo "❌ Project '$1' not found in workspaces or worktrees"
     exit 1
   fi
   ```

2. **Change to project directory:**
   ```bash
   cd "$PROJECT_PATH"
   echo "📁 Target Project: $PROJECT_PATH"
   ```

**If no argument provided:**
- Use current working directory (Telegram topic behavior)
- `PROJECT_PATH=$(pwd)`

---

### 1. Prime SCAR Understanding (Silent - Don't Report)

**Read SCAR's global rules to understand available features:**

1. Read `/home/samuel/scar/CLAUDE.md` to understand:
   - SCAR's architecture and capabilities
   - Available commands and workflows
   - Platform integrations (Telegram, GitHub, Slack, Discord)
   - MCP server support (Archon, Playwright, GitHub)
   - Worktree management features
   - GCP Cloud Run deployment capabilities
   - Issue supervision protocol (CRITICAL)
   - SCAR instruction protocol (verification steps)
   - Implementation verification protocol (no-mock policy)

**This knowledge is for context only - DO NOT include SCAR details in the final summary.**

---

### 2. Check Archon Knowledge Base (If Available)

**PRIORITY: If Archon MCP is enabled, check indexed documentation FIRST:**

1. **List available sources**: `mcp__archon__rag_get_available_sources()`
   - Shows all previously indexed documentation
   - Displays: title, URL, creation date

2. **Search for project-related docs**:
   - Identify technologies from package.json/requirements.txt/pyproject.toml
   - Search Archon for each: `mcp__archon__rag_search_knowledge_base(query="[technology]", match_count=3)`
   - Example: If project uses React, search: `mcp__archon__rag_search_knowledge_base(query="React", match_count=3)`

3. **Note findings** (will be included in summary):
   - **Indexed dependencies**: List which technologies already have documentation in Archon
   - **Missing dependencies**: Identify important dependencies not yet indexed
   - **Recommendations**: Suggest which docs to index for better AI assistance

If Archon is not available, skip to Step 3.

---

### 3. Analyze Project Structure

**Determine current working directory:**
```bash
pwd
```

**List all tracked files:**
```bash
git ls-files
```

**Show directory structure:**
```bash
tree -L 3 -I 'node_modules|__pycache__|.git|dist|build' || find . -type d -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' | head -50
```

### 4. Read Project Documentation

**In priority order:**

1. **Read CLAUDE.md** (or similar global rules file in project directory)
   - This contains project-specific conventions, architecture, and AI coding instructions

2. **Read .agents/PRD.md** (if it exists)
   - Product requirements and project goals

3. **Read README.md** files
   - Project root README
   - Major directory READMEs

4. **Read any architecture documentation**
   - docs/architecture.md
   - docs/ARCHITECTURE.md
   - .agents/plans/ files (recent ones)

### 5. Identify and Read Key Files

Based on the structure, identify and read:

**Configuration Files:**
- package.json / pyproject.toml / go.mod / Cargo.toml / requirements.txt
- tsconfig.json / jest.config.js / pytest.ini / vitest.config.ts
- docker-compose.yml / Dockerfile
- .env.example
- vite.config.ts / next.config.js / nuxt.config.ts

**Entry Points:**
- main.py / index.ts / app.py / src/main.ts / cmd/main.go / src/index.tsx
- src/App.tsx / src/app/page.tsx (for React/Next.js)

**Core Models/Schemas:**
- Database models (src/models/, src/db/models.py, prisma/schema.prisma)
- Type definitions (src/types/, types.ts)
- API schemas (src/schemas/)

**Important Service Files:**
- Key business logic files (2-3 representative files)
- Core API endpoints (1-2 examples)
- Main components (for frontend projects)

### 6. Understand Current State

**Check recent activity:**
```bash
git log -10 --oneline
```

**Check current branch and status:**
```bash
git status
```

**Check for uncommitted changes:**
```bash
git diff --stat
```

## Output Report

Provide a concise summary covering ONLY the target project (NOT SCAR):

### Project Overview
- **Name**: Project name
- **Purpose**: What this project does (1-2 sentences)
- **Type**: Web app / API / CLI tool / Library / Bot / Mobile app / etc.
- **Current Version**: From package.json/pyproject.toml/Cargo.toml
- **Working Directory**: Full path to project

### Archon Knowledge Base (If Available)
- **Indexed Dependencies**: ✅ List technologies already documented in Archon
- **Missing Dependencies**: ❌ Key dependencies that should be indexed
- **Recommendations**: 💡 Suggested `/crawl` commands to improve knowledge base
- **Coverage**: X/Y major dependencies covered (percentage)

### Tech Stack
- **Language**: TypeScript 5.x / Python 3.11 / Go 1.21 / Rust 1.75 / etc.
- **Framework**: Express / FastAPI / Gin / React / Next.js / Vue / Nuxt / Svelte / etc.
- **Database**: PostgreSQL / MongoDB / Redis / Supabase / etc.
- **Package Manager**: npm / yarn / pnpm / pip / poetry / go mod / cargo
- **Testing**: Jest / Vitest / pytest / Go testing / etc.
- **Key Libraries**: List 3-5 most important dependencies

### Architecture
- **Structure**: Brief description of how code is organized
- **Patterns**: MVC / Service Layer / Hexagonal / Clean Architecture / Component-based / etc.
- **Key Directories**: List 5-7 most important directories with 1-line descriptions
- **Database**: Schema overview (number of tables/collections, key entities)
- **API Design**: REST / GraphQL / gRPC / tRPC / etc.

### Code Style & Conventions
- **Type Safety**: Strict TypeScript / mypy / etc.
- **Formatting**: Prettier / Black / gofmt / rustfmt settings
- **Linting**: ESLint / ruff / golangci-lint / clippy
- **Testing Approach**: Unit + Integration / TDD / E2E with Playwright / etc.
- **Documentation**: JSDoc / Docstrings / Comments approach

### Current State
- **Active Branch**: Current branch name
- **Recent Focus**: What the last 3-5 commits are about
- **Uncommitted Changes**: Summary of `git status` (if any)
- **Observations**: Any immediate notes about project health, missing docs, deprecated code, etc.

### AI Coding Assistant Instructions Summary
- List the top 5-7 most critical rules from CLAUDE.md
- Highlight any project-specific patterns AI assistants must follow
- Note any special workflows or commands to be aware of
- Call out any no-go areas (files to never modify, deprecated patterns to avoid)

---

**Formatting Guidelines:**
- Use bullet points for easy scanning
- Use emojis sparingly (✅ ❌ 💡 📁 🔧 only when helpful)
- Keep each section concise (3-8 bullet points max)
- Total summary should be 150-300 lines
- Focus on ACTIONABLE information an AI assistant needs to start coding

**Example Emoji Usage:**
- ✅ for indexed dependencies, completed items
- ❌ for missing dependencies, issues
- 💡 for recommendations
- 📁 for directory descriptions
- 🔧 for tools and frameworks

---

**Usage Examples:**

**In CLI (from /scar directory):**
```bash
/prime-proj consilio        # Primes the consilio project
/prime-proj openhorizon.cc  # Primes the openhorizon.cc project
/prime-proj project-manager # Primes the project-manager project
```

**In Telegram topic:**
```bash
/prime-proj                 # Primes current project (topic's codebase)
```

**Argument Reference:**
- `$1` = Project name (optional)
  - If provided: Search in workspaces/worktrees
  - If not provided: Use current directory
