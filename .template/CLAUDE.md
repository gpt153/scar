# {{PROJECT_NAME}}

**Repository:** {{GITHUB_URL}}
**Archon Project:** {{ARCHON_PROJECT_ID}}
**Workspace:** {{WORKSPACE_PATH}}

## Project Overview

{{PROJECT_DESCRIPTION}}

## Development Workflow

This project is configured with the Remote Coding Agent and includes:
- **Archon MCP** - Task management and project tracking
- **exp-piv-loop Commands** - Proven development workflows from Cole Medin

### Available Commands

- `/plan <feature>` - Deep implementation planning with codebase analysis
- `/implement <plan-file>` - Execute implementation plans
- `/commit [target]` - Quick commits with natural language targeting
- `/create-pr [base]` - Create pull request from current branch
- `/review-pr <pr-number>` - Comprehensive PR code review
- `/merge-pr [pr-number]` - Merge PR after validation
- `/rca <issue>` - Root cause analysis for bugs
- `/fix-rca <rca-file>` - Implement fixes from RCA report
- `/prd [filename]` - Create Product Requirements Document
- `/worktree <branch>` - Create git worktrees for parallel development
- `/changelog-entry <description>` - Add CHANGELOG entry
- `/changelog-release [version]` - Promote changelog to release
- `/release <version>` - Create GitHub release with tag

**Autonomous Supervision Commands:**
- `/prime-supervisor` - Load project context and initialize supervisor role
- `/supervise` - Supervise entire project (all issues, dependencies, parallel work)
- `/supervise-issue N` - Supervise single GitHub issue to completion

See `docs/autonomous-supervision.md` for complete guide.

### Using Archon

Task management is handled by Archon MCP. Common operations:

```bash
# List all tasks
list_tasks()

# Search tasks
list_tasks(query="authentication")

# Create task
manage_task("create", project_id="...", title="Fix bug", description="...")

# Update task status
manage_task("update", task_id="...", status="doing")

# Get project info
list_projects(project_id="...")
```

### Using Playwright for E2E Testing

If this project has Playwright configured, validate UI/UX functionality:

```bash
# Run all E2E tests
npx playwright test

# Run in UI mode (interactive)
npx playwright test --ui

# Run specific test file
npx playwright test e2e/feature.spec.ts

# Debug mode (step through tests)
npx playwright test --debug
```

E2E tests validate actual user experience, not just code compilation.

## Project-Specific Notes

{{CUSTOM_NOTES}}
