

# Autonomous Supervision System

**Last Updated**: 2026-01-08
**Version**: 1.0

Complete guide to SCAR's autonomous supervision system for managing GitHub issues, delegating work to SCAR, and tracking implementation progress.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Commands](#commands)
4. [Workflows](#workflows)
5. [Communication Principles](#communication-principles)
6. [File Structure](#file-structure)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### What Is Autonomous Supervision?

A system where Claude Code acts as an **autonomous project supervisor**, managing issue decomposition, SCAR delegation, progress monitoring, and verification - all while you focus on strategic decisions.

### Key Features

✅ **Project-Level Oversight** - Monitor entire project, not just one issue
✅ **Issue Decomposition** - Breaks complex features into manageable issues
✅ **SCAR Delegation** - Automatically instructs and monitors SCAR
✅ **Dependency Management** - Respects prerequisites, enables parallel work
✅ **Automatic Verification** - Validates implementations via `/verify-scar-phase`
✅ **Design Discussions** - Facilitates human input for complex decisions
✅ **Context Handoff** - Seamlessly transitions between supervisor instances
✅ **First Principles Thinking** - Challenges assumptions, provides honest cost-benefit analysis

### How It Works

```
You: /supervise
    ↓
Supervisor loads project context
    ↓
Analyzes all open issues → Creates meta-plan
    ↓
Spawns monitor subagents (max 5 concurrent)
    ↓
Each monitor:
  - Posts @scar instruction
  - Polls every 2min
  - Detects completion
  - Runs verification
  - Reports back
    ↓
Supervisor:
  - Aggregates progress
  - Manages dependencies
  - Handles blockers
  - Updates you every 10min
    ↓
Continues until all issues complete
```

---

## Quick Start

### Prerequisites

**Required**:
- Working directory: Project workspace (not `/home/samuel/scar`)
- SCAR configured: Webhook and bot active on GitHub
- Issues exist: At least one open issue to supervise

**Recommended**:
- Have `/prime-supervisor` available (via builtin commands)
- PRD exists: `.agents/PRD.md` helps with context
- Plans exist: `.agents/plans/*.md` for features

### First Time Setup

**1. Navigate to project workspace:**
```bash
cd /home/samuel/.archon/workspaces/consilio
# NOT: cd /home/samuel/scar
```

**2. Start Claude Code:**
```bash
claude
```

**3. Prime supervisor:**
```
/prime-supervisor
```

**4. Start supervision:**

**Option A**: Supervise entire project
```
/supervise
```

**Option B**: Supervise single issue
```
/supervise-issue 42
```

### What Happens Next

**Supervisor will:**
1. Load all open issues
2. Create execution plan with dependencies
3. Start monitoring active issues
4. Post updates every 10min
5. Alert you when issues complete or need input
6. Continue until all work done

**You will:**
1. Receive strategic progress updates (NO CODE)
2. Make design decisions when needed
3. Approve/reject recommendations
4. That's it - supervisor handles the rest

---

## Commands

### `/prime-supervisor`

**Load project context and setup supervisor role.**

**Usage:**
```
/prime-supervisor
```

**What it does:**
- Reads CLAUDE.md, PRD, README
- Analyzes project structure and tech stack
- Checks for existing supervision state
- Surveys open issues and PRs
- Provides project snapshot

**When to use:**
- First time supervising a project
- Resuming after context handoff
- Want fresh project overview

**Output:**
- Strategic project summary
- Current phase and progress
- Available actions

---

### `/supervise`

**Supervise entire project - all issues, all dependencies.**

**Usage:**
```
/supervise
```

**What it does:**
- Creates meta-plan from all open issues
- Spawns monitors for ready issues (max 5 concurrent)
- Manages dependencies automatically
- Provides progress updates every 10min
- Runs until all issues complete

**When to use:**
- Want autonomous project management
- Have multiple issues to track
- Want dependency coordination
- Building complex feature with many parts

**Runs:**
- Indefinitely until stopped or context limit
- Hands off seamlessly if context fills

---

### `/supervise-issue N`

**Supervise single GitHub issue.**

**Usage:**
```
/supervise-issue 42
```

**Arguments:**
- `N`: Issue number (e.g., 42)

**What it does:**
- Assesses issue complexity
- Builds SCAR instruction
- Posts @scar mention
- Monitors progress every 2min
- Verifies implementation
- Reports completion

**When to use:**
- Want to focus on one issue
- Testing supervision system
- Quick fix or small feature
- Don't need multi-issue coordination

**Duration:**
- Until issue complete or blocked

---

## Workflows

### Workflow 1: Simple Bug Fix

**Scenario:** Fix issue #42 (bug)

```
You: /supervise-issue 42

Supervisor:
1. Reads issue #42
2. Determines it's a bug
3. Posts: @scar /command-invoke fix-issue 42
4. Waits 20s → confirms "SCAR is on the case..."
5. Polls every 2min for updates
6. After 30min: SCAR posts "PR created at {url}"
7. Runs: /verify-scar-phase consilio 42 1
8. Result: APPROVED ✅
9. Reports: Issue #42 complete, PR ready for review

Total time: 35min (fully autonomous)
```

---

### Workflow 2: New Feature (Single Issue)

**Scenario:** Add real-time notifications (issue #43)

```
You: /supervise-issue 43

Supervisor:
1. Reads issue #43 (feature request)
2. Determines needs planning first
3. Posts: @scar /command-invoke plan-feature-github "Issue #43: Add notifications..."
4. Monitors planning (30-60min)
5. SCAR creates plan at .agents/plans/notifications.md
6. Supervisor posts: @scar /command-invoke execute-github .agents/plans/notifications.md feature-notifications
7. Monitors implementation (2-3h)
8. SCAR completes → creates PR
9. Verification: APPROVED ✅
10. Reports: Feature complete

Total time: 3-4h (fully autonomous)
```

---

### Workflow 3: Complex Feature (Multi-Issue)

**Scenario:** Build analytics dashboard (needs decomposition)

```
You: Tell supervisor "Build analytics dashboard"

Supervisor:
1. Analyzes requirement
2. Decomposes into issues:
   - #50: Plan analytics architecture
   - #51: Build data aggregation service
   - #52: Create dashboard UI
   - #53: Add E2E tests
3. Creates dependency graph: 50 → (51, 52) → 53
4. Starts #50 (planning)

You: /supervise

Supervisor:
5. Monitors #50 (planning completes)
6. Spawns monitors for #51 and #52 (parallel)
7. Both complete
8. Spawns monitor for #53 (testing)
9. All complete
10. Reports: Analytics dashboard complete (4 issues, 3 PRs)

Total time: 6-8h (fully autonomous except decomposition approval)
```

---

### Workflow 4: Design Discussion Needed

**Scenario:** Issue #44 needs architectural decision

```
You: /supervise-issue 44

Supervisor:
1. Reads issue #44
2. Assesses: Complex, needs design decision
3. Creates: .agents/discussions/2024-01-08-streaming-approach.md (prefilled)
4. Notifies you:
   "⚠️ Issue #44 needs design input
   Discussion doc: .agents/discussions/2024-01-08-streaming-approach.md
   Please discuss and update doc status to Complete"
5. Pauses monitoring

You:
6. Open new terminal: cd /home/samuel/.archon/workspaces/consilio && claude
7. Say: "Read .agents/discussions/2024-01-08-streaming-approach.md"
8. Discuss with Claude, make decisions
9. Update doc with decisions
10. Reply in issue #44: "Design discussion complete"

Supervisor:
11. Reads discussion results
12. Recommends actions: "Create 3 new issues based on decisions?"
13. You: "approve"
14. Creates issues #45, #46, #47
15. Spawns monitors for all three
16. Continues supervision

Total time: Design discussion (1h) + implementation (3-4h)
```

---

### Workflow 5: Context Handoff

**Scenario:** Supervision running for 6 hours, context filling up

```
Supervisor:
1. Detects context at ~140k/200k tokens
2. Creates handoff doc: .agents/supervision/session-1704672000/handoff.md
3. Saves complete state
4. Notifies you:
   "⚠️ Context limit approaching
   Handoff doc ready
   Start new session: cd {project} && claude && /prime-supervisor && /supervise"
5. Exits cleanly

You:
6. Start new Claude session
7. Run: /prime-supervisor (reads handoff doc automatically)
8. Run: /supervise (resumes from handoff state)

New Supervisor:
9. Loads all context from handoff
10. Reconnects to active monitors
11. Continues supervision seamlessly

Result: Zero downtime, continuous supervision
```

---

## Communication Principles

### CRITICAL: No Code to User

**You cannot code. Code examples waste context and provide no value.**

**Rules:**
- ✅ Strategic summaries and decisions
- ✅ Links to documentation
- ✅ File references (no contents)
- ✅ Comparisons and metrics
- ❌ Code snippets or examples
- ❌ Implementation details
- ❌ Line-by-line explanations

### First Principles Thinking REQUIRED

**Supervisor provides TRUTH, not COMFORT.**

**Always:**
- Think from first principles
- Challenge assumptions
- Provide cost-benefit analysis
- Assess actual effort vs perceived effort
- Recommend alternatives
- Be brutally honest

### Examples

**✅ GOOD Communication:**

```markdown
## Issue #42 Analysis

**Request**: Add profile picture upload

**Reality Check**:
- Sounds simple, actually involves 8 separate components
- Estimated effort: 2-3 days (not 2-3 hours)
- Complexity: Medium-High

**What it requires**:
- Image storage solution (Supabase Storage)
- Upload UI with progress indicators
- Image processing (resize, thumbnails)
- Security validation
- Database schema changes
- Error handling for edge cases

**Realistic effort**: 3-4 hours with SCAR (not 2-3 days)
**Simpler alternative**: Gravatar integration (30 minutes)

**Question**: Is custom upload critical to core value,
or is this nice-to-have polish that can wait?

**Recommendation**: Defer until core features proven,
use Gravatar as interim solution.

**📖 See realistic time estimates:** `docs/realistic-time-estimates.md`
```

**❌ BAD Communication:**

```markdown
Great idea! Profile pictures are essential for modern apps!

Here's how to implement it:

```python
def upload_avatar(file):
    # Validate file
    if not file.content_type.startswith('image/'):
        raise ValidationError()
    ...
```

Let's add this right away!
```

*(Ignored: actual effort, alternatives, priority. Showed code despite user can't code. Placated instead of challenged.)*

---

### Update Frequency

**Project-level supervision** (`/supervise`):
- Progress updates: Every 10 minutes
- Significant events: Immediately (completion, blocker, error)
- Session summary: Every hour
- Final report: When all issues complete

**Issue-level supervision** (`/supervise-issue N`):
- Progress updates: Every 10 minutes
- Completion: Immediately
- Blockers: Immediately

---

## File Structure

### Supervision State

```
.agents/supervision/
├── project-state.json           # Current supervision state
├── session-{timestamp}/         # Active session
│   ├── meta-plan.md            # High-level roadmap
│   ├── issues.json             # All issues snapshot
│   ├── progress-log.md         # Detailed activity log
│   └── handoff.md              # Context handoff doc (if needed)
└── archives/                    # Completed sessions
    └── session-{old}/
```

### Discussion Documents

```
.agents/discussions/
├── 2024-01-08-streaming-api.md
├── 2024-01-08-streaming-api-issue-51.md  # Renamed when issue created
└── 2024-01-07-auth-refactor-issue-42.md
```

**Naming**: `{YYYY-MM-DD}-{feature-name}-issue-{N}.md`

### Plans

```
.agents/plans/
├── streaming-api.md
├── notifications.md
└── analytics-dashboard.md
```

**Created by**: SCAR's `/command-invoke plan-feature-github`

---

## Troubleshooting

### SCAR Not Responding

**Symptom**: Posted @scar instruction but no "SCAR is on the case..." after 2min

**Causes**:
- SCAR webhook not configured for this repo
- SCAR server down
- GitHub webhook delivery issues

**Solutions**:
1. Check SCAR status: https://code.153.se/health
2. Check webhook deliveries: Repo Settings → Webhooks → Recent Deliveries
3. Verify @scar mention format correct
4. Manual fallback: Post @scar comment directly

**Supervisor behavior**:
- Retries 3 times (20s, 40s, 60s delays)
- After 3 failures: Reports to you
- Continues monitoring other issues

---

### Issue Blocked on Another Issue

**Symptom**: Supervisor says "Issue #52 blocked by #51"

**Causes**:
- Dependency not complete yet
- Explicit "depends on" label
- Sequential requirement

**Solutions**:
- **Wait** (recommended): Let #51 finish, #52 will auto-start
- **Remove dependency**: If actually independent, update issue
- **Manual start**: Force start with `/supervise-issue 52` (risky)

**Supervisor behavior**:
- Holds #52 in pending queue
- Monitors #51
- When #51 completes, auto-starts #52

---

### Verification Failed

**Symptom**: SCAR completed but `/verify-scar-phase` rejected

**Causes**:
- Build errors (TypeScript, linting)
- Mock data in production code
- Missing files SCAR claimed to create
- Tests failing

**Solutions**:
Supervisor automatically:
1. Posts verification failures to issue
2. Tags @scar to fix
3. Waits for fixes
4. Re-verifies
5. Repeats up to 3 times

Manual intervention needed if:
- 3 verification attempts all fail
- Issue is complex requiring design discussion

---

### Context Limit Approaching

**Symptom**: Supervisor says "Context limit approaching - handoff in 5min"

**Causes**:
- Long-running supervision session (4-6 hours)
- Many issues processed
- Large project with extensive context

**Solutions**:
Supervisor automatically:
1. Creates handoff doc
2. Saves complete state
3. Notifies you
4. Exits cleanly

You:
1. Start new Claude session
2. Run `/prime-supervisor` (auto-loads handoff)
3. Run `/supervise` (resumes seamlessly)

**Result**: Zero downtime, continuous supervision

---

### Multiple Issues Need Discussion

**Symptom**: Supervisor created 3 discussion docs, all need input

**Solutions**:
- **Prioritize**: Which decision is most critical?
- **Sequential**: Tackle one at a time
- **Parallel**: Open multiple terminals if decisions are independent
- **Defer**: Some discussions can wait until later

**Supervisor behavior**:
- Pauses affected issues
- Continues unrelated issues
- Tracks which discussions are pending
- Resumes when you mark discussion complete

---

## Advanced Topics

### Custom SCAR Commands

Supervisor uses these standard commands by default:
- `/command-invoke plan-feature-github`
- `/command-invoke execute-github`
- `/command-invoke fix-issue`
- `/command-invoke rca`

To use custom commands:
1. Create command in `.claude/commands/`
2. Tell supervisor: "Use /command-invoke custom-feature for issue #N"
3. Supervisor will use your command instead

### Multi-Repo Supervision

To supervise multiple projects:
- Each project needs its own supervisor instance
- Run in separate terminals
- Each terminal: `cd {project} && claude && /supervise`

**Don't** try to supervise multiple repos from one instance (context chaos).

### Integration with Other Tools

Supervisor works with:
- ✅ Archon MCP (task management)
- ✅ Playwright MCP (E2E testing via SCAR)
- ✅ GitHub CLI (all git operations)
- ✅ Any tools available to SCAR

### Stopping Supervision

To stop gracefully:
- Say: "Stop supervision"
- Supervisor will:
  - Save current state
  - Keep monitors running (they're in GitHub)
  - Exit cleanly
  - Can resume later with `/supervise`

To emergency stop:
- Ctrl+C (terminal interrupt)
- State may not save
- Resume with `/prime-supervisor` then `/supervise`

---

## Best Practices

### DO:
✅ Run from project workspace
✅ Use `/prime-supervisor` before first supervision
✅ Let supervisor handle decomposition
✅ Provide design input when asked
✅ Trust verification results
✅ Review PRs before merging (supervisor doesn't auto-merge)

### DON'T:
❌ Run from `/home/samuel/scar` directory
❌ Skip `/prime-supervisor` (supervisor lacks context)
❌ Manually post @scar commands while supervisor active
❌ Merge PRs without reviewing
❌ Interrupt supervisor frequently (let it work)

---

## FAQ

**Q: Can I supervise issue #X while it's already being worked on?**
A: Yes, but verify no duplicate @scar commands exist. Supervisor will monitor existing work.

**Q: What if I disagree with supervisor's recommendation?**
A: Always say so. Supervisor provides analysis, YOU make decisions. Reply: "I want to proceed differently because..."

**Q: Can supervisor create new issues automatically?**
A: No. Supervisor recommends issue creation, you approve/reject.

**Q: How do I know supervision is working?**
A: Updates every 10min. No update for 15min = something wrong (check logs/GitHub).

**Q: Can I run multiple supervisors on same project?**
A: No. One supervisor instance per project. Multiple = chaos.

**Q: Does supervisor auto-merge PRs?**
A: No. Supervisor verifies, reports ready, but YOU review and merge.

**Q: What happens if SCAR makes a mistake?**
A: Verification catches most mistakes. If approved but wrong, manual fix needed (supervisor doesn't roll back automatically).

---

## Getting Help

**Issues with supervision system:**
- Create issue in /home/samuel/scar repo
- Tag: "supervision"
- Describe: What you expected vs what happened

**Issues with SCAR:**
- Check SCAR logs: https://code.153.se/health
- Check GitHub webhook deliveries
- Verify @scar mention format

**General questions:**
- Read this doc thoroughly first
- Try `/prime-supervisor` for fresh context
- Ask supervisor: "Explain your reasoning for..."

---

**Last Updated**: 2026-01-08
**Maintained By**: SCAR Development Team
**Version**: 1.0

