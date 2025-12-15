# Command Reference & Workflow Guide

Complete guide to all available commands, agents, and workflows in the Remote Coding Agent platform.

**Last Updated:** 2025-12-13

---

## Table of Contents

- [Quick Reference](#quick-reference)
- [Command Namespaces](#command-namespaces)
- [Workflow Flowcharts](#workflow-flowcharts)
- [Command Details](#command-details)
- [Agent Types](#agent-types)

---

## Quick Reference

### Essential Commands (Start Here)

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/help` | Show all available commands | First time using the system |
| `/clone <url>` | Clone a GitHub repository | Start working on a new codebase |
| `/status` | Show conversation state | Check current codebase, session, commands |
| `/core_piv_loop:prime` | Analyze and understand codebase | After cloning, before planning features |
| `/core_piv_loop:plan-feature` | Create implementation plan | Before building any new feature |
| `/core_piv_loop:execute` | Implement the plan | After approving the plan |

### Most Common Workflows

```
New Feature:     /prime → /plan-feature → /execute → /commit → /create-pr
Bug Fix:         /fix-issue <number>
Code Review:     /review-pr <number>
Quick Commit:    /commit "description"
```

---

## Command Namespaces

Commands are organized into logical namespaces based on their purpose.

### 🏗️ Core Platform Commands (No Prefix)

**Built into the application** - Basic codebase and conversation management.

| Command | Description |
|---------|-------------|
| `/help` | Display all available commands |
| `/status` | Show conversation state (codebase, session, commands) |
| `/clone <url>` | Clone GitHub repository to workspace |
| `/repos` | List all cloned repositories |
| `/getcwd` | Show current working directory |
| `/setcwd <path>` | Change working directory |
| `/command-set <name> <path>` | Register a custom command file |
| `/load-commands <folder>` | Bulk load all .md commands from folder |
| `/commands` | List all registered commands for current codebase |
| `/reset` | Clear active AI session (start fresh) |

---

### 🎯 core_piv_loop (Core Planning-Implementation-Validation)

**The primary workflow** for feature development with formal planning and execution phases.

| Command | Description | Output |
|---------|-------------|--------|
| `/core_piv_loop:prime` | Deep codebase analysis and context building | Context report with architecture, tech stack, patterns |
| `/core_piv_loop:plan-feature` | Create comprehensive implementation plan | Detailed plan.md with steps, files, tests, risks |
| `/core_piv_loop:execute [plan-file]` | Execute plan with Archon task management | Implemented feature with progress tracking |

**When to use:** Building new features, major refactors, or working on unfamiliar codebases where you want formal planning.

---

### ✅ validation (Quality Assurance)

**Testing and verification** workflows to ensure code quality before deployment.

| Command | Description | Output |
|---------|-------------|--------|
| `/validation:code-review` | Technical code review (pre-commit) | List of bugs, code smells, improvements |
| `/validation:code-review-fix` | Fix bugs from code review | Implemented fixes for review findings |
| `/validation:validate [ngrok-url]` | End-to-end validation with live testing | Test results, screenshots, bug reports |
| `/validation:execution-report` | Generate implementation report | Markdown report of what was built |
| `/validation:system-review` | Compare implementation vs plan | Process improvements, lessons learned |
| `/validation:ultimate_validate_command` | Generate codebase-specific validation | Custom validation script for this project |

**When to use:** Before commits, before PRs, after major implementations, or for continuous quality checks.

---

### 🐛 github_bug_fix (Issue Resolution)

**Structured bug fix workflow** with root cause analysis.

| Command | Description | Output |
|---------|-------------|--------|
| `/github_bug_fix:rca [issue-id]` | Deep root cause analysis | RCA-report.md with diagnosis and fix strategy |
| `/github_bug_fix:implement-fix [issue-id]` | Implement fix from RCA | Code changes, tests, verification |

**When to use:** Complex bugs that need investigation, production issues, or when you want documentation of the fix reasoning.

---

### 🚀 exp_piv_loop (Extended Workflows)

**Production-ready extended commands** for the full development lifecycle.

#### Planning & Implementation

| Command | Description |
|---------|-------------|
| `/exp-piv-loop:plan <description or PRD>` | Deep implementation planning with codebase analysis |
| `/exp-piv-loop:implement <plan.md>` | Execute implementation plan autonomously |
| `/exp-piv-loop:prd [filename]` | Create lean, problem-first PRD |

#### Git & GitHub Operations

| Command | Description |
|---------|-------------|
| `/exp-piv-loop:commit [target]` | Quick commit with natural language file targeting |
| `/exp-piv-loop:create-pr [base-branch]` | Create PR from current branch |
| `/exp-piv-loop:merge-pr [pr-number]` | Merge PR after rebase with main |
| `/exp-piv-loop:review-pr <number> [--approve]` | Comprehensive PR code review with comments |

#### Issue & Bug Management

| Command | Description |
|---------|-------------|
| `/exp-piv-loop:fix-issue <number>` | End-to-end issue resolution (RCA + fix + test) |
| `/exp-piv-loop:rca <issue/error> [quick]` | Root cause analysis for any error |
| `/exp-piv-loop:fix-rca <RCA-report.md>` | Implement fix from RCA document |

#### Release Management

| Command | Description |
|---------|-------------|
| `/exp-piv-loop:changelog-entry [category] <desc>` | Add entry to CHANGELOG.md [Unreleased] |
| `/exp-piv-loop:changelog-release [version]` | Promote unreleased entries to version |
| `/exp-piv-loop:release-notes [version]` | Generate release notes from commits/changelog |
| `/exp-piv-loop:release <version>` | Create GitHub Release with tag and notes |

#### Worktree Management

| Command | Description |
|---------|-------------|
| `/exp-piv-loop:worktree <branch...>` | Create git worktrees for parallel development |
| `/exp-piv-loop:worktree-cleanup <name>` | Clean up worktrees after PR merge |

#### Smart Routing

| Command | Description |
|---------|-------------|
| `/exp-piv-loop:router` | Route natural language to appropriate workflow |

**When to use:** Day-to-day development, PR workflows, release management, or parallel feature development.

---

### 🎬 Standalone Commands

**High-level autonomous workflows** that handle entire processes end-to-end.

| Command | Description | Output |
|---------|-------------|--------|
| `/end-to-end-feature <description>` | Fully autonomous feature development (plan → code → test → commit) | Complete feature with PR |
| `/create-prd [filename]` | Generate PRD from conversation history | PRD.md document |

**When to use:** When you want the AI to handle everything autonomously without supervision.

---

## Workflow Flowcharts

### 🌟 Primary Development Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    NEW FEATURE DEVELOPMENT                   │
└─────────────────────────────────────────────────────────────┘

START: Clone repository
│
├─→ /clone https://github.com/user/repo
│   └─→ Repository cloned to workspace
│
├─→ /core_piv_loop:prime
│   └─→ AI analyzes codebase structure, patterns, tech stack
│       Output: Context report
│
├─→ /core_piv_loop:plan-feature "Add user authentication"
│   └─→ AI creates detailed implementation plan
│       Output: .agents/plans/auth-feature.plan.md
│       Contains: Architecture, files to modify, steps, tests
│
├─→ REVIEW PLAN (human approval)
│   └─→ Adjust plan if needed
│
├─→ /core_piv_loop:execute .agents/plans/auth-feature.plan.md
│   └─→ AI implements feature step-by-step
│       Progress tracked in Archon MCP
│       Output: Working code
│
├─→ /validation:code-review
│   └─→ AI reviews code quality
│       Output: List of issues/improvements
│
├─→ /validation:code-review-fix (if issues found)
│   └─→ AI fixes code review findings
│
├─→ /exp-piv-loop:commit "user authentication"
│   └─→ AI creates git commit
│       Output: Commit with descriptive message
│
├─→ /exp-piv-loop:create-pr main
│   └─→ AI creates pull request
│       Output: PR with summary and test plan
│
└─→ END: Feature complete and ready for review
```

---

### 🐛 Bug Fix Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                      BUG FIX WORKFLOW                        │
└─────────────────────────────────────────────────────────────┘

Option A: QUICK FIX (Simple bugs)
│
└─→ /exp-piv-loop:fix-issue 42
    └─→ AI investigates, fixes, tests, creates PR
        Output: Closed issue with PR link


Option B: COMPLEX FIX (Needs investigation)
│
├─→ /github_bug_fix:rca 42
│   └─→ Deep root cause analysis
│       Output: RCA-report.md with diagnosis
│
├─→ REVIEW RCA (human verification)
│   └─→ Confirm root cause is correct
│
├─→ /github_bug_fix:implement-fix 42
│   └─→ AI implements fix from RCA
│       Output: Code changes + tests
│
├─→ /validation:validate
│   └─→ End-to-end testing
│       Output: Test results
│
├─→ /exp-piv-loop:commit "fix: resolve login timeout"
│   └─→ Git commit
│
└─→ /exp-piv-loop:create-pr main
    └─→ PR creation
```

---

### 🔄 Code Review Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                     CODE REVIEW WORKFLOW                     │
└─────────────────────────────────────────────────────────────┘

Scenario 1: REVIEWING YOUR OWN CODE (Pre-commit)
│
├─→ /validation:code-review
│   └─→ AI reviews uncommitted changes
│       Output: Issues, bugs, code smells
│
├─→ /validation:code-review-fix
│   └─→ AI fixes all findings
│       Output: Improved code
│
└─→ /exp-piv-loop:commit "feature complete"


Scenario 2: REVIEWING SOMEONE'S PR
│
├─→ /exp-piv-loop:review-pr 123
│   └─→ AI performs comprehensive review
│       Output: PR comments on GitHub
│
├─→ Choose action:
│   ├─→ /exp-piv-loop:review-pr 123 --approve
│   │   └─→ Approve and merge
│   │
│   └─→ /exp-piv-loop:review-pr 123 --request-changes
│       └─→ Request changes with comments
│
└─→ (Optional) /exp-piv-loop:merge-pr 123
    └─→ Merge after approval
```

---

### 🚢 Release Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                      RELEASE WORKFLOW                        │
└─────────────────────────────────────────────────────────────┘

THROUGHOUT DEVELOPMENT:
│
└─→ After each feature/fix:
    └─→ /exp-piv-loop:changelog-entry added "New user auth"
        └─→ Adds to CHANGELOG.md [Unreleased] section


WHEN READY TO RELEASE:
│
├─→ /exp-piv-loop:changelog-release 1.2.0
│   └─→ Promotes [Unreleased] → [1.2.0]
│       Output: Updated CHANGELOG.md
│
├─→ /exp-piv-loop:commit "Release 1.2.0"
│   └─→ Commit changelog
│
├─→ /exp-piv-loop:release 1.2.0
│   └─→ Creates GitHub Release
│       Output: Git tag, release notes, assets
│
└─→ END: Release published
```

---

### ⚡ Quick Operations

```
┌─────────────────────────────────────────────────────────────┐
│                     QUICK OPERATIONS                         │
└─────────────────────────────────────────────────────────────┘

QUICK COMMIT:
└─→ /exp-piv-loop:commit "update tests"
    └─→ Commits matching files with smart targeting


QUICK PR:
└─→ /exp-piv-loop:create-pr
    └─→ Creates PR from current branch to main


CHECK STATUS:
└─→ /status
    └─→ Shows codebase, session, commands


PARALLEL DEVELOPMENT:
└─→ /exp-piv-loop:worktree feature-1 feature-2 bugfix-3
    └─→ Creates 3 isolated worktrees
    └─→ Each can be worked on independently


CLEANUP:
└─→ /exp-piv-loop:worktree-cleanup merged
    └─→ Removes all merged worktrees
```

---

### 🤖 Autonomous Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                   AUTONOMOUS DEVELOPMENT                     │
└─────────────────────────────────────────────────────────────┘

For users who want ZERO intervention:
│
└─→ /end-to-end-feature "Add dark mode toggle to settings"
    │
    ├─→ AI primes itself (analyzes codebase)
    ├─→ AI creates plan (architecture decisions)
    ├─→ AI implements (writes code)
    ├─→ AI tests (validates implementation)
    ├─→ AI commits (creates commit message)
    └─→ AI creates PR (with description & test plan)

    Output: Ready-to-merge PR with complete feature
```

---

## Command Details

### Core Platform Commands

#### `/clone <repository-url>`

**Purpose:** Clone a GitHub repository to the workspace.

**What it does:**
- Executes `git clone` to workspace directory
- Creates codebase record in database
- Auto-detects command folders (`.claude/commands/`, `.agents/commands/`)
- Offers to bulk-load detected commands
- Sets default working directory

**Example:**
```bash
/clone https://github.com/anthropics/anthropic-sdk-typescript
```

**Output:**
```
✅ Repository cloned successfully!

📁 Codebase: anthropic-sdk-typescript
📂 Path: /workspace/anthropic-sdk-typescript

🔍 Detected .claude/commands/ folder
Load commands? (Reply /load-commands .claude/commands)
```

---

#### `/status`

**Purpose:** Show current conversation state.

**What it shows:**
- Platform type (telegram, slack, github, discord)
- AI assistant type (claude, codex)
- Active codebase name and ID
- Current working directory
- Active session ID
- Registered commands list

**Example Output:**
```
📊 Conversation Status

🤖 Platform: telegram
🧠 AI Assistant: claude

📦 Codebase: anthropic-sdk-typescript
🔗 Repository: https://github.com/anthropics/anthropic-sdk-typescript
📂 Working Directory: /workspace/anthropic-sdk-typescript

🔄 Active Session: a1b2c3d4-5678-90ab-cdef-1234567890ab

📋 Registered Commands:
  • prime - Research codebase
  • plan - Create implementation plan
  • execute - Implement feature
```

---

#### `/repos`

**Purpose:** List all cloned repositories.

**What it shows:**
- All codebases in database
- Repository URLs
- Default working directories
- Command counts

---

#### `/reset`

**Purpose:** Clear the active AI session and start fresh.

**When to use:**
- AI is stuck or giving unhelpful responses
- Want to start a new context without previous conversation
- Session has grown too large (token limits)

**What it does:**
- Marks current session as inactive in database
- Next message creates a new session
- Preserves codebase configuration

**Note:** Does NOT delete conversation history or codebase data.

---

### core_piv_loop Commands

#### `/core_piv_loop:prime`

**Purpose:** Build comprehensive codebase understanding.

**What it does:**
- Analyzes directory structure
- Reads core documentation (README, CLAUDE.md, PRD)
- Identifies tech stack and dependencies
- Examines architecture patterns
- Reviews recent git history
- Reads key implementation files

**Output:** Context report with:
- Project overview and purpose
- Architecture summary
- Tech stack breakdown
- Core principles and patterns
- Current state and recent changes

**When to use:**
- After cloning a new repository
- Before planning major features
- When onboarding to unfamiliar codebase
- Periodically to refresh AI's understanding

---

#### `/core_piv_loop:plan-feature <description>`

**Purpose:** Create detailed implementation plan for a feature.

**What it does:**
- Researches existing codebase patterns
- Identifies files to modify/create
- Plans step-by-step implementation
- Considers edge cases and testing
- Documents risks and dependencies

**Input:** Feature description (can be detailed or high-level)

**Output:** Markdown plan file containing:
```markdown
# Feature Implementation Plan

## Overview
[Feature description and goals]

## Architecture Analysis
[Relevant patterns and conventions]

## Implementation Steps
1. Step-by-step tasks
2. File modifications
3. Test additions

## Files to Modify
- src/file1.ts - [changes]
- src/file2.ts - [changes]

## Testing Strategy
[How to verify the feature works]

## Risks & Considerations
[Potential issues and mitigations]
```

**Example:**
```bash
/core_piv_loop:plan-feature "Add rate limiting to API endpoints"
```

---

#### `/core_piv_loop:execute [plan-file-path]`

**Purpose:** Implement the feature based on the plan.

**What it does:**
- Reads the plan document
- Integrates with Archon MCP for task tracking
- Implements each step systematically
- Creates/modifies files as planned
- Runs tests during implementation
- Reports progress in real-time

**Input:** Path to plan file (optional - uses most recent plan if omitted)

**Example:**
```bash
/core_piv_loop:execute .agents/plans/rate-limiting.plan.md
```

**Session Behavior:**
- Creates a **NEW session** (fresh context for implementation)
- Plan content is injected into the new session
- This is the ONLY command that creates a new session automatically

---

### validation Commands

#### `/validation:code-review`

**Purpose:** Technical code review for quality and bugs (pre-commit).

**What it checks:**
- Code quality and style violations
- Potential bugs and logic errors
- Security vulnerabilities
- Performance issues
- Test coverage gaps
- Documentation completeness

**Output:** Categorized list of findings:
```
🔴 CRITICAL
- [File:Line] SQL injection vulnerability

🟡 WARNINGS
- [File:Line] Missing error handling
- [File:Line] Unused variable

🔵 SUGGESTIONS
- [File:Line] Consider extracting to helper function
```

**When to use:**
- Before committing changes
- After implementing a feature
- As part of CI/CD pipeline

---

#### `/validation:code-review-fix`

**Purpose:** Automatically fix issues found in code review.

**What it does:**
- Reads previous code review findings
- Fixes all auto-fixable issues
- Reports which issues were fixed
- Lists issues requiring manual intervention

**When to use:**
- After `/validation:code-review` finds issues
- To quickly resolve common code quality problems

---

#### `/validation:validate [ngrok-url]`

**Purpose:** End-to-end validation with live testing.

**What it does:**
- Starts the application
- Runs comprehensive test suite
- Performs manual testing scenarios
- Captures screenshots (if UI)
- Tests all critical flows
- Reports bugs and regressions

**Input:** Optional ngrok URL for testing webhooks/external integrations

**When to use:**
- Before merging a PR
- After major refactors
- Before releases

---

### github_bug_fix Commands

#### `/github_bug_fix:rca [issue-id]`

**Purpose:** Deep root cause analysis for a GitHub issue.

**What it does:**
- Reads GitHub issue description
- Analyzes stack traces and error messages
- Searches codebase for related code
- Traces execution flow
- Identifies root cause
- Proposes fix strategy

**Output:** RCA report document:
```markdown
# Root Cause Analysis: Issue #42

## Issue Summary
[Problem description]

## Root Cause
[Detailed explanation of underlying issue]

## Reproduction Steps
[How to trigger the bug]

## Proposed Fix
[Strategy for resolution]

## Files to Modify
[List of changes needed]
```

**Example:**
```bash
/github_bug_fix:rca 42
```

---

#### `/github_bug_fix:implement-fix [issue-id]`

**Purpose:** Implement fix based on RCA document.

**What it does:**
- Reads RCA report
- Implements proposed fix
- Adds regression tests
- Verifies fix resolves issue
- Creates commit

**Example:**
```bash
/github_bug_fix:implement-fix 42
```

---

### exp_piv_loop Commands

#### `/exp-piv-loop:commit [target-description]`

**Purpose:** Quick commit with natural language file targeting.

**What it does:**
- Analyzes staged and unstaged changes
- Filters files matching target description (if provided)
- Generates descriptive commit message
- Creates commit following conventional commits format

**Examples:**
```bash
/exp-piv-loop:commit
# Commits all changes

/exp-piv-loop:commit "test files"
# Commits only test files

/exp-piv-loop:commit "authentication changes"
# Commits files related to auth
```

**Output:**
```
✅ Committed 3 files

feat: Add JWT authentication to API endpoints

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

#### `/exp-piv-loop:create-pr [base-branch]`

**Purpose:** Create pull request from current branch.

**What it does:**
- Analyzes all commits in current branch
- Generates PR title and description
- Creates test plan checklist
- Opens PR on GitHub

**Input:** Base branch (default: `main`)

**Example:**
```bash
/exp-piv-loop:create-pr
# Creates PR to main

/exp-piv-loop:create-pr develop
# Creates PR to develop
```

**Output:**
```
✅ Pull Request created!

🔗 URL: https://github.com/user/repo/pull/123
📝 Title: Add JWT authentication
🎯 Base: main ← feature/auth
```

---

#### `/exp-piv-loop:review-pr <pr-number> [--approve|--request-changes]`

**Purpose:** Comprehensive PR code review.

**What it does:**
- Fetches PR diff from GitHub
- Analyzes code changes
- Checks for bugs, style issues, security problems
- Posts review comments on GitHub
- Optionally approves or requests changes

**Examples:**
```bash
/exp-piv-loop:review-pr 123
# Review only (no approval)

/exp-piv-loop:review-pr 123 --approve
# Review and approve

/exp-piv-loop:review-pr 123 --request-changes
# Review and request changes
```

---

#### `/exp-piv-loop:fix-issue <issue-number>`

**Purpose:** End-to-end issue resolution.

**What it does:**
- Reads GitHub issue
- Performs quick RCA
- Implements fix
- Adds tests
- Creates commit
- Opens PR
- Links PR to issue

**Example:**
```bash
/exp-piv-loop:fix-issue 42
```

**Output:**
```
✅ Issue #42 fixed!

📊 Analysis: Login timeout due to missing keepalive
🔧 Fixed: Added connection pooling
✅ Tests: Added integration test
🔗 PR: https://github.com/user/repo/pull/124
```

---

#### `/exp-piv-loop:worktree <branch-1> [branch-2] [branch-3]`

**Purpose:** Create isolated git worktrees for parallel development.

**What it does:**
- Creates separate worktrees for each branch
- Validates branch names
- Sets up directory structure
- Reports worktree paths

**Example:**
```bash
/exp-piv-loop:worktree feature-auth feature-api bugfix-login
```

**Output:**
```
✅ Created 3 worktrees:

📁 feature-auth
   Path: /workspace/my-app/worktrees/feature-auth

📁 feature-api
   Path: /workspace/my-app/worktrees/feature-api

📁 bugfix-login
   Path: /workspace/my-app/worktrees/bugfix-login
```

**Use case:** Work on multiple features simultaneously without branch switching.

---

#### `/exp-piv-loop:changelog-entry [category] <description>`

**Purpose:** Add entry to CHANGELOG.md [Unreleased] section.

**Categories:**
- `added` - New features
- `changed` - Changes to existing functionality
- `deprecated` - Soon-to-be removed features
- `removed` - Removed features
- `fixed` - Bug fixes
- `security` - Security fixes

**Examples:**
```bash
/exp-piv-loop:changelog-entry added "JWT authentication for API endpoints"

/exp-piv-loop:changelog-entry fixed "Login timeout on slow networks"

/exp-piv-loop:changelog-entry "New user dashboard"
# Category auto-detected
```

---

#### `/exp-piv-loop:release <version>`

**Purpose:** Create GitHub Release with tag and notes.

**What it does:**
- Creates git tag
- Generates release notes from changelog
- Creates GitHub Release
- Attaches release assets (if configured)

**Example:**
```bash
/exp-piv-loop:release 1.2.0
```

**Output:**
```
✅ Release 1.2.0 created!

🏷️  Tag: v1.2.0
🔗 Release: https://github.com/user/repo/releases/tag/v1.2.0
📝 Notes: Generated from CHANGELOG.md
```

---

### Standalone Commands

#### `/end-to-end-feature <feature-description>`

**Purpose:** Fully autonomous feature development from start to finish.

**What it does (no human intervention required):**
1. Primes itself on codebase
2. Creates implementation plan
3. Implements feature
4. Writes tests
5. Runs validation
6. Creates commit
7. Opens pull request

**Example:**
```bash
/end-to-end-feature "Add dark mode toggle to user settings"
```

**Output:** Complete PR ready for review.

**When to use:**
- Trust the AI completely
- Simple, well-defined features
- Want to minimize interaction

**Warning:** Review the PR carefully before merging!

---

#### `/create-prd [output-filename]`

**Purpose:** Generate Product Requirements Document from conversation.

**What it does:**
- Analyzes conversation history
- Extracts requirements and decisions
- Structures into PRD format
- Writes to file

**Output:** PRD.md with:
- Problem statement
- Goals and success metrics
- User stories
- Technical requirements
- Out of scope items

**Example:**
```bash
/create-prd feature-auth-prd.md
```

---

## Agent Types

The system uses specialized agents internally for different tasks:

### general-purpose
**Purpose:** Researching complex questions, searching code, multi-step tasks
**Tools Available:** All tools
**When Used:** Open-ended exploration, keyword searches, codebase discovery

### Explore
**Purpose:** Fast codebase exploration
**Tools Available:** Glob, Grep, Read
**Thoroughness Levels:** quick, medium, very thorough
**When Used:** Finding files by patterns, searching for keywords, answering codebase questions

### Plan
**Purpose:** Software architecture and implementation design
**Tools Available:** All tools
**When Used:** Creating implementation plans, identifying critical files, considering trade-offs

### statusline-setup
**Purpose:** Configure Claude Code status line
**Tools Available:** Read, Edit
**When Used:** System configuration tasks

### claude-code-guide
**Purpose:** Answer questions about Claude Code, SDK, API
**Tools Available:** Glob, Grep, Read, WebFetch, WebSearch
**When Used:** Documentation lookup, feature questions, API usage help

---

## Command Decision Tree

```
┌─────────────────────────────────────────────────────────────┐
│              WHICH COMMAND SHOULD I USE?                    │
└─────────────────────────────────────────────────────────────┘

Are you starting with a new codebase?
├─ YES → /clone <url>
│        └─ Then → /core_piv_loop:prime
│
└─ NO → Do you want to build a new feature?
   ├─ YES → Do you want to plan first?
   │  ├─ YES → /core_piv_loop:plan-feature "description"
   │  │         └─ Then → /core_piv_loop:execute plan.md
   │  │
   │  └─ NO → Just describe what you want (natural conversation)
   │           OR use /end-to-end-feature "description"
   │
   └─ NO → Are you fixing a bug?
      ├─ YES → Is it a GitHub issue?
      │  ├─ YES → /exp-piv-loop:fix-issue <number>
      │  │        OR /github_bug_fix:rca <number> (if complex)
      │  │
      │  └─ NO → Describe the bug (natural conversation)
      │
      └─ NO → What do you need?
         ├─ Check current state → /status
         ├─ Review code → /validation:code-review
         ├─ Review PR → /exp-piv-loop:review-pr <number>
         ├─ Commit changes → /exp-piv-loop:commit
         ├─ Create PR → /exp-piv-loop:create-pr
         ├─ Release → /exp-piv-loop:release <version>
         └─ Other → Tell me what you need!
```

---

## Tips & Best Practices

### 🎯 When to Use Structured Commands vs Natural Conversation

**Use Commands When:**
- Working on unfamiliar codebases (always prime first)
- Building complex features (plan → execute workflow)
- Want formal documentation (PRDs, RCAs, plans)
- Need reproducible processes (releases, reviews)
- Working on production code (validation workflows)

**Use Natural Conversation When:**
- Quick questions or small changes
- Iterating rapidly on code
- Exploring ideas
- Learning the codebase

### 🔄 Command Chaining

Many commands work well in sequence:

```bash
# Feature development chain
/prime → /plan-feature → /execute → /code-review → /commit → /create-pr

# Bug fix chain
/rca → /implement-fix → /validate → /commit

# Release chain
/changelog-entry (repeated) → /changelog-release → /release
```

### 📊 Understanding Sessions

- **Session persists** across messages (maintains context)
- **Only `/reset` clears** the session
- **Plan→Execute transition** creates a NEW session automatically
- **Session IDs** shown in `/status` command

### 🌳 Worktree Best Practices

- Use for parallel feature development
- One worktree = one feature branch
- Clean up after merging: `/worktree-cleanup merged`
- Symbiosis with Claude Code skill (share `WORKTREE_BASE`)

---

## Quick Command Lookup

**I want to...**

| Goal | Command |
|------|---------|
| Start working on a repo | `/clone <url>` |
| Understand the codebase | `/core_piv_loop:prime` |
| Build a new feature | `/core_piv_loop:plan-feature` then `/execute` |
| Fix a bug quickly | `/exp-piv-loop:fix-issue <number>` |
| Review my code | `/validation:code-review` |
| Review someone's PR | `/exp-piv-loop:review-pr <number>` |
| Make a commit | `/exp-piv-loop:commit` |
| Create a pull request | `/exp-piv-loop:create-pr` |
| Work on multiple features | `/exp-piv-loop:worktree branch1 branch2` |
| See what's happening | `/status` |
| Start fresh | `/reset` |
| Do everything autonomously | `/end-to-end-feature "description"` |

---

## Getting Help

- **In-app help:** `/help` - Shows available commands
- **Stuck?** Use `/reset` to clear session and start fresh
- **Questions about commands?** Just ask! Natural conversation is always available alongside structured commands.

---

**Last Updated:** 2025-12-13
**Version:** 1.0.0
