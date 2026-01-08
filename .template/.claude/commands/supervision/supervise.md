---
description: Supervise entire project - monitor all issues, manage dependencies, track progress
argument-hint: none
---

# Supervise: Project-Level Autonomous Supervision

## Mission

Maintain continuous oversight of the entire project, managing issue decomposition, SCAR delegation, dependency tracking, and progress reporting.

**Duration**: Runs indefinitely until stopped or context limit reached.

**Scope**: All open issues, not just one.

## Prerequisites

Must have run `/prime-supervisor` first to load context.

## Phase 1: Initialize Supervision

### 1.1 Create Session Directory

```bash
# Create timestamp-based session directory
SESSION_TIME=$(date +%s)
mkdir -p .agents/supervision/session-$SESSION_TIME

# Initialize project state
cat > .agents/supervision/project-state.json <<EOF
{
  "status": "active",
  "started": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "last_update": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "session_id": "session-$SESSION_TIME",
  "phase": "initializing",
  "active_issues": [],
  "completed_issues": [],
  "pending_issues": [],
  "monitors": {},
  "context_usage": 0
}
EOF
```

### 1.2 Load All Open Issues

```bash
gh issue list --state open --json number,title,labels,state --limit 50 > .agents/supervision/session-$SESSION_TIME/issues.json
```

### 1.3 Build Meta-Plan

Analyze all issues and create high-level roadmap:

**Group by labels/milestones:**
- Foundation issues (dependencies, setup, architecture)
- Core feature issues (main functionality)
- Polish issues (UI/UX improvements, edge cases)
- Testing issues (validation, E2E tests)

**Identify dependencies:**
- Which issues must complete before others can start?
- Which issues can run in parallel?
- What's the critical path?

**Create phase structure:**
```markdown
## Project Phases

**Phase 1: Foundation** (Issues #1-#5)
- Status: {Completed/In Progress/Pending}
- Blockers: {None/List}

**Phase 2: Core Features** (Issues #6-#15)
- Status: {Completed/In Progress/Pending}
- Dependencies: Phase 1 complete
- Blockers: {None/List}

**Phase 3: Integration** (Issues #16-#20)
- Status: {Completed/In Progress/Pending}
- Dependencies: Phase 2 complete
- Blockers: {None/List}
```

Save to: `.agents/supervision/session-$SESSION_TIME/meta-plan.md`

## Phase 2: Spawn Issue Monitors

### 2.1 Determine Which Issues to Start

**Rules**:
- Max 5 concurrent issues (VM limit)
- Respect dependencies (don't start blocked issues)
- Prioritize by labels (high priority first)
- Balance parallel work when possible

**Decision logic**:
```markdown
For each open issue:
1. Check dependencies - are prerequisites complete?
2. Check priority - high priority issues first
3. Check concurrency - under 5 active monitors?
4. If all YES → spawn monitor
5. If NO → add to pending queue
```

### 2.2 Spawn Monitors

For each issue to monitor:

```bash
# Use Task tool to spawn scar-monitor subagent
# (Example - actual invocation via Claude Code Task tool)
```

Spawn with:
- Issue number
- SCAR command to execute
- Monitor frequency (2min polling)

Track in state:
```json
{
  "monitors": {
    "42": {
      "subagent_id": "agent-abc123",
      "status": "waiting_start",
      "started": "2024-01-08T10:00:00Z",
      "command": "/command-invoke plan-feature-github 'Add notifications'",
      "retries": 0
    }
  }
}
```

## Phase 3: Monitor and Coordinate

### 3.1 Poll Monitor States

**Every 2 minutes**:
- Check each subagent's progress
- Update project-state.json
- Detect completions, blockers, errors

### 3.2 Handle Completions

When issue completes:
1. Verify with `/verify-scar-phase`
2. Move to completed_issues
3. Check if dependent issues can now start
4. Spawn new monitors for unblocked issues
5. Update meta-plan

### 3.3 Handle Blockers

When issue gets blocked:
- Pause monitoring
- Assess blocker type:
  - Needs design discussion? → Create discussion doc, notify user
  - Dependency not ready? → Wait for prerequisite
  - SCAR error? → Retry with different approach
  - Unclear requirement? → Ask user for clarification

### 3.4 Manage Dependencies

**Dependency graph tracking**:
```markdown
Issue #8: Coach agent (BLOCKED - needs #7)
  ↑ depends on
Issue #7: Streaming API (IN PROGRESS - 70% done)
  ↑ depends on
Issue #6: Database schema (COMPLETED ✅)
```

**When dependency completes**:
- Automatically start dependent issues
- Update all affected monitors
- Recalculate critical path

## Phase 4: Progress Reporting

### 4.1 Status Updates

**Every 10 minutes OR on significant events**:

Post update (NO CODE):
```markdown
## 📊 Supervision Update

**Time**: {HH:MM}
**Phase**: {current phase}
**Progress**: {X/Y issues complete}

**Active Work**:
- Issue #{N}: {title} - {status} ({progress}%)
- Issue #{N}: {title} - {status} ({progress}%)

**Completed Since Last Update**:
- Issue #{N}: {title} ✅

**Next Up**:
- Issue #{N}: {title} (starts after #{N})

**Blockers**: {None / List}

**ETA**: {estimated time to phase completion}
```

### 4.2 Session Summary

**Every hour OR on phase completion**:

```markdown
## 📈 Session Summary

**Session Duration**: {hours}h {minutes}m
**Issues Completed**: {count}
**Issues Active**: {count}
**Issues Pending**: {count}

**Velocity**: {issues per hour}

**Phase Progress**:
{Bar chart or percentage}

**Critical Path Status**:
{On track / Delayed by {X} / Ahead by {X}}

**Recommendations**:
{Strategic adjustments if needed}
```

## Phase 5: Context Management

### 5.1 Monitor Token Usage

Track approximate context usage:
- Every response ~2-5k tokens
- At ~150k tokens → prepare handoff

### 5.2 Context Handoff Protocol

**When approaching limit**:

1. **Save complete state**:
```bash
# Write comprehensive handoff document
cat > .agents/supervision/session-$SESSION_TIME/handoff.md <<EOF
# Supervision Handoff

**Session**: session-$SESSION_TIME
**Handoff Time**: $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Reason**: Context limit approaching

## Current State
{Full state dump}

## Active Monitors
{All active subagents with their states}

## Pending Actions
{What needs to happen next}

## Instructions for Next Instance
1. Run /prime-supervisor
2. Read this handoff doc
3. Resume monitoring from current state
4. Continue supervision
EOF
```

2. **Notify user**:
```markdown
⚠️ **Context Limit Approaching**

This supervision session has been running for {duration}.
Context usage: ~{percentage}%

**Handoff prepared**: `.agents/supervision/session-{ID}/handoff.md`

**To resume supervision**:
1. Start new Claude session
2. Run `/prime-supervisor`
3. Run `/supervise` (will auto-resume from handoff)

**Current work will continue** - all SCAR monitors remain active in GitHub.
This is just the supervisor instance transitioning.

Handing off in 5 minutes...
```

3. **Clean exit**:
- Update project-state.json with handoff info
- Close gracefully
- Next instance will resume seamlessly

## Phase 6: Completion

**When all issues complete**:

```markdown
🎉 **Project Supervision Complete**

**Session**: {session-id}
**Duration**: {total time}
**Issues Completed**: {count}

**Summary**:
{List all completed issues with PRs}

**Metrics**:
- Average time per issue: {X}h
- Total PRs created: {count}
- Total lines changed: {count} (from git)
- Build passing: ✅
- All tests: ✅

**Final State**: All open issues resolved

**Next Steps**:
{Suggest next phase of development or maintenance mode}

---

**Supervision session ended** ✅
```

## Emergency Procedures

### SCAR Unresponsive
If SCAR doesn't respond after 3 retries:
1. Report to user immediately
2. Don't block other issues
3. Suggest manual intervention
4. Continue monitoring other issues

### Critical Blocker
If blocker affects multiple issues:
1. Pause affected monitors
2. Escalate to user immediately
3. Recommend design discussion
4. Don't make major decisions autonomously

### Build Breakage
If PR merges break main:
1. Alert immediately
2. Identify culprit PR
3. Recommend revert or hotfix
4. Pause new work until fixed

## Communication Rules (CRITICAL)

**To User** (Strategic only):
- High-level status updates
- Completion reports
- Blocker alerts
- Recommendations

**NO CODE to user** - see communication principles in `/prime-supervisor`

**To SCAR** (Technical allowed):
- Detailed instructions in GitHub comments
- Code examples if needed for clarity
- Technical specifications

## File Structure

```
.agents/supervision/
├── project-state.json          # Current state (updated continuously)
├── session-{timestamp}/        # Session-specific data
│   ├── issues.json             # All issues snapshot
│   ├── meta-plan.md            # High-level roadmap
│   ├── progress-log.md         # Detailed log
│   └── handoff.md              # Handoff doc (if needed)
└── archives/                   # Completed sessions
    └── session-{old-timestamp}/
```

## Success Criteria

- ✅ All issues monitored continuously
- ✅ Dependencies respected and managed
- ✅ User receives regular updates
- ✅ Blockers identified and escalated quickly
- ✅ Context handoff works seamlessly
- ✅ No SCAR work duplicated or missed

---

**Begin supervision** - this command runs until all issues complete or you stop it.
