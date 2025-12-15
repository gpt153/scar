# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add sync-template-to-projects.ts script to update existing workspace projects with complete template structure

### Changed

- Switch Archon MCP integration from stdio-based (uvx command) to HTTP-based (Docker service on port 8051) for improved reliability and simpler setup

### Fixed

- Fix /new-topic to copy all command directories (core_piv_loop, github_bug_fix, validation) and preserve folder structure - was only copying 17 of 32 commands
- Fix test assertions to match updated function signatures (handleCommand bot parameter, Telegram sendMessage options)
- Fix ESLint configuration to properly ignore client projects and root-level utility scripts
- Apply Prettier formatting across codebase for consistent code style

## [0.1.0] - 2025-12-08

Initial release of the Remote Agentic Coding Platform.

### Added

- **Platform Adapters**
  - Telegram adapter with streaming support and markdown formatting
  - Slack adapter with Socket Mode for real-time messaging (#73)
  - Discord adapter with thread support
  - GitHub adapter with webhook integration for issues and PRs (#43)
  - Test adapter for HTTP-based integration testing

- **AI Assistant Clients**
  - Claude Code SDK integration with session persistence
  - Codex SDK integration as alternative AI assistant

- **Core Features**
  - PostgreSQL persistence for conversations, codebases, and sessions
  - Generic command system with user-defined markdown commands
  - Variable substitution ($1, $2, $ARGUMENTS, $PLAN)
  - Worktree isolation per conversation for parallel development (#43)
  - Session resume capability across restarts

- **Workflow Commands** (exp-piv-loop)
  - `/plan` - Deep implementation planning with codebase analysis
  - `/implement` - Execute implementation plans
  - `/commit` - Quick commits with natural language targeting
  - `/create-pr` - Create PRs from current branch
  - `/merge-pr` - Merge PRs with rebase handling
  - `/review-pr` - Comprehensive PR code review
  - `/rca` - Root cause analysis for issues
  - `/fix-rca` - Implement fixes from RCA reports
  - `/prd` - Product requirements documents
  - `/worktree` - Parallel branch development
  - `/worktree-cleanup` - Clean up merged worktrees
  - `/router` - Natural language intent detection (#59)

- **Platform Features**
  - Configurable streaming modes (stream/batch) per platform
  - Platform-specific authorization (whitelist users)
  - Configurable GitHub bot mention via environment variable (#66)

- **Developer Experience**
  - ESLint 9 with flat config and Prettier integration
  - Jest test framework with mocks
  - Docker Compose for local development
  - Builtin command templates (configurable via LOAD_BUILTIN_COMMANDS)

### Fixed

- Shared worktree cleanup preventing duplicate removal errors (#72)
- Case-sensitive bot mention detection in GitHub adapter
- PR review to checkout actual PR branch instead of creating new branch (#48)
- Template commands treated as documentation (#35, #63)
- Auto-load commands in /clone like /repo does (#55)
- /status and /repos codebase active state inconsistency (#60)
- WORKSPACE_PATH configuration to avoid nested repos (#37, #54)
- Shorten displayed paths in worktree and status messages (#33, #45)
- Create worktrees retroactively for legacy conversations (#56)

### Security

- Use commit SHA for reproducible PR reviews (#52, #75)
- Add retry logic to GitHub API calls for transient network failures (#64)
