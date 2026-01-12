# Supervisor Merge Decision Architecture

**Date**: 2026-01-12
**Principle**: Supervisor makes merge decisions with full project context, not isolated subagents

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Supervisor (/supervise)                                │
│  - Has full project context                             │
│  - Knows all active issues & dependencies               │
│  - Makes strategic merge decisions                      │
└──────────┬──────────────────────────────────────────────┘
           │ spawns
           ↓
    ┌──────────────────┐
    │ Monitor (Issue 42)│
    │ - Isolated scope  │
    │ - Verifies ONLY   │
    │ - Reports back    │
    └──────┬───────────┘
           │ reports APPROVED
           ↓
┌─────────────────────────────────────────────────────────┐
│  Supervisor (receives report)                           │
│  1. Check project state                                 │
│  2. Assess merge safety                                 │
│  3. Make decision: MERGE or HOLD                        │
│  4. Execute merge if safe                               │
└─────────────────────────────────────────────────────────┘
```

---

## Current Flow (Broken)

**What happens now:**

1. Monitor detects SCAR completion
2. Monitor runs `/verify-scar-phase` → APPROVED ✅
3. Monitor reports: "Ready for review and merge"
4. Monitor **stops** - doesn't merge
5. Supervisor receives report but **also doesn't merge**
6. User has to manually approve/merge

**Why it's broken**: Neither monitor nor supervisor merges. Both wait for user.

---

## Correct Flow (What Should Happen)

**What should happen:**

1. Monitor detects SCAR completion
2. Monitor runs `/verify-scar-phase` → APPROVED ✅
3. Monitor **reports back to supervisor** with:
   ```json
   {
     "issue": 42,
     "status": "verified_approved",
     "pr_url": "https://github.com/user/repo/pull/52",
     "pr_number": 52,
     "verification": "approved",
     "files_changed": 5,
     "tests_added": 12
   }
   ```
4. Monitor **waits** for supervisor decision
5. **Supervisor receives report** (Phase 3.2: Handle Completions)
6. **Supervisor assesses project context**:
   - Are other PRs waiting to merge?
   - Would this merge conflict with in-progress work?
   - Are dependencies satisfied?
   - Is main branch stable?
7. **Supervisor makes decision**:
   - **MERGE NOW**: Safe to merge immediately
   - **HOLD**: Wait for other issues to complete first
   - **REJECT**: Issues found, don't merge
8. **Supervisor executes merge** (if MERGE NOW)
9. **Supervisor updates all monitors** about new main state

---

## Implementation: Modify Supervisor Only

### Key Insight

**Don't modify monitor commands** - they should stay focused on verification.

**Only modify supervisor** - add merge decision logic to Phase 3.2.

### File to Modify

**File**: `.claude/commands/supervision/supervise.md`

**Section**: Phase 3.2: Handle Completions (line 200-208)

---

## Current Phase 3.2 (Lines 200-208)

```markdown
### 3.2 Handle Completions

When issue completes:
1. Verify with `/verify-scar-phase`
2. **Check for UI deployment** (see 3.3)
3. Move to completed_issues
4. Check if dependent issues can now start
5. Spawn new monitors for unblocked issues
6. Update meta-plan
```

---

## New Phase 3.2 (With Merge Logic)

```markdown
### 3.2 Handle Completions

When monitor reports issue VERIFIED_APPROVED:

#### Step 1: Receive Verification Report

Monitor has already run `/verify-scar-phase` and reports:
```json
{
  "issue": 42,
  "status": "verified_approved",
  "pr_number": 52,
  "pr_url": "https://github.com/user/repo/pull/52",
  "verification": "approved"
}
```

#### Step 2: Assess Merge Safety (Strategic Decision)

**Context you have**:
- All active issues and their PRs
- Dependency graph
- Main branch state
- Other pending merges

**Questions to evaluate**:

1. **Dependency check**: Does any in-progress issue depend on current main?
   - If YES → merging might break their work
   - If NO → safe from dependency perspective

2. **Conflict check**: Are other approved PRs waiting to merge?
   - If YES → check merge order (which should go first?)
   - If NO → safe to merge immediately

3. **Stability check**: Is main branch currently stable?
   - Check recent CI status
   - If broken → hold until fixed
   - If stable → safe to merge

4. **UI deployment check**: Is this a UI feature?
   - If YES → UI testing must complete first (see 3.3)
   - If NO → can merge after verification

**Decision Matrix**:

| Scenario | Action | Reason |
|----------|--------|--------|
| No conflicts, stable main | **MERGE NOW** | Safe |
| Other PR approved first | **HOLD** | Merge order matters |
| Dependent issue in progress | **HOLD** | Prevent breaking changes |
| Main broken | **HOLD** | Wait for stability |
| UI feature, tests pending | **HOLD** | Wait for UI tests (3.3) |
| Verification failed | **REJECT** | Don't merge |

#### Step 3: Execute Decision

**If MERGE NOW**:

```bash
PR_NUM=52  # From monitor report

# Get current PR status
MERGE_STATUS=$(gh pr view $PR_NUM --json mergeStateStatus -q '.mergeStateStatus')

echo "🔍 Merge assessment for PR #$PR_NUM:"
echo "  - Verification: APPROVED ✅"
echo "  - Dependencies: None blocking"
echo "  - Main status: Stable"
echo "  - Decision: MERGE NOW"

# Execute merge
if [ "$MERGE_STATUS" = "BEHIND" ]; then
  echo "PR behind main - rebasing..."
  gh pr checkout $PR_NUM
  git fetch origin main
  git rebase origin/main
  git push --force-with-lease
fi

# Merge with admin override (bypasses branch protection)
gh pr merge $PR_NUM --squash --delete-branch --admin

if [ $? -eq 0 ]; then
  echo "✅ PR #$PR_NUM merged to main"

  # Update project state
  jq '.monitors."42".status = "merged"' project-state.json > tmp.json
  mv tmp.json project-state.json

  # Move to completed
  # (Step 4 below)
else
  echo "❌ Merge failed - investigating..."
  gh pr view $PR_NUM --json mergeStateStatus
fi
```

**If HOLD**:

```bash
echo "⏸️ Holding PR #$PR_NUM - merge later"
echo "Reason: {dependency/conflict/stability reason}"

# Update state to pending_merge
jq '.monitors."42".status = "pending_merge"' project-state.json > tmp.json
mv tmp.json project-state.json

# Check again in next polling cycle
```

**If REJECT**:

```bash
echo "❌ Not merging PR #$PR_NUM"
echo "Reason: {verification/quality reason}"

# Post to issue
gh issue comment 42 --body "Merge rejected. Reason: {details}"
```

#### Step 4: Post-Merge Actions

After successful merge:

1. **Update main** - All monitors need to know main changed
   ```bash
   # Fetch latest main
   git checkout main
   git pull origin main

   # Update all active monitors
   for issue in "${!monitors[@]}"; do
     echo "Notifying monitor for issue #$issue about main update"
   done
   ```

2. **Check UI deployment** (if applicable) - See 3.3

3. **Move to completed_issues**
   ```bash
   # Update project state
   COMPLETED=$(jq '.completed_issues += [42]' project-state.json)
   echo "$COMPLETED" > project-state.json
   ```

4. **Check dependent issues**
   ```bash
   # Are any pending issues now unblocked?
   # Example: Issue #43 was waiting for #42
   for pending in $PENDING_ISSUES; do
     if dependencies_satisfied "$pending"; then
       spawn_monitor "$pending"
     fi
   done
   ```

5. **Spawn new monitors** for unblocked issues

6. **Update meta-plan**
   ```markdown
   ## Project Progress

   **Phase 1: Foundation** - 4/5 complete (80%)
   - Issue #42: ✅ Merged
   - Issue #43: In Progress

   **Next**: Issue #44 now unblocked, starting monitor
   ```

#### Step 5: Report to User (Strategic Summary)

```markdown
## 📊 Supervision Update

**Issue #42**: Real-time notifications - ✅ **MERGED**
  - Verification: APPROVED
  - Merge decision: Safe (no conflicts)
  - PR #52 merged to main at {timestamp}
  - Files changed: 5
  - Tests added: 12

**Next**: Starting Issue #44 (now unblocked)

**Active**: 3 issues in progress
**Pending**: 2 issues waiting on dependencies
```

---

## Decision-Making Examples

### Example 1: Simple Merge (Safe)

**Context**:
- Issue #42 verified APPROVED
- No other active PRs
- Main is stable
- No dependencies

**Decision**: MERGE NOW ✅

**Rationale**: Nothing blocking, safe to merge immediately

---

### Example 2: Sequential Dependencies (Hold)

**Context**:
- Issue #42 verified APPROVED (database schema)
- Issue #43 in progress (uses new schema)
- Issue #43's PR not ready yet

**Decision**: HOLD ⏸️

**Rationale**: Issue #43 is building on current main. If we merge #42 now, it might break #43's work-in-progress. Better to wait until #43 is also ready, then merge both in order.

**Alternative Strategy**: Merge #42 now, notify monitor for #43 to rebase on new main immediately.

---

### Example 3: Multiple Approved PRs (Order Matters)

**Context**:
- Issue #42 verified APPROVED (API changes)
- Issue #44 verified APPROVED (frontend using API)
- Both ready to merge

**Decision**:
1. MERGE #42 (API first) ✅
2. Then MERGE #44 (frontend) ✅

**Rationale**: API must be in main before frontend can work. Merge order: backend → frontend.

---

### Example 4: Main Branch Broken (Hold All)

**Context**:
- Issue #42 verified APPROVED
- Main branch: CI failing (unrelated issue)
- Tests red

**Decision**: HOLD ⏸️

**Rationale**: Don't merge into broken main. Wait for main to stabilize first, then merge all approved PRs.

---

### Example 5: UI Feature (Wait for Tests)

**Context**:
- Issue #42 verified APPROVED (React dashboard)
- UI testing in progress (phase 3.3)
- 15/20 features tested so far

**Decision**: HOLD ⏸️ (wait for UI tests)

**Rationale**: UI features need comprehensive testing before merge (see phase 3.3). Hold until all UI tests pass.

---

## Benefits of This Architecture

### 1. Strategic Oversight

Supervisor has full context:
- ✅ Knows all active work
- ✅ Understands dependencies
- ✅ Can optimize merge order
- ✅ Prevents conflicts

### 2. Isolation of Concerns

Monitors stay focused:
- ✅ Monitor = verify implementation quality
- ✅ Supervisor = strategic merge decisions
- ✅ Clear separation of responsibilities

### 3. Safety

Multiple checks:
- ✅ Verification gate (monitors)
- ✅ Strategic gate (supervisor)
- ✅ Prevents breaking changes
- ✅ Maintains main stability

### 4. User Trust

You can trust the system because:
- ✅ Verification ensures quality
- ✅ Supervisor ensures strategy
- ✅ Merge only when truly safe
- ✅ No blind auto-merging

---

## What Monitors Should NOT Do

Monitors should **NOT**:
- ❌ Make merge decisions
- ❌ Execute merges
- ❌ Consider project context
- ❌ Know about other issues

Monitors should **ONLY**:
- ✅ Verify implementation quality
- ✅ Report results to supervisor
- ✅ Wait for supervisor decisions

---

## Implementation Steps

### 1. Modify Supervisor Command

**File**: `.claude/commands/supervision/supervise.md`

**Section**: Phase 3.2 (lines 200-208)

**Replace with**: New Phase 3.2 from above (with merge decision logic)

### 2. Leave Monitor Commands Unchanged

**Files**:
- `.claude/commands/supervision/scar-monitor.md` - NO CHANGES
- `.claude/commands/supervision/supervise-issue.md` - NO CHANGES

**Why**: Monitors just verify and report. Supervisor decides and merges.

### 3. Update Prime-Supervisor

**File**: `.claude/commands/supervision/prime-supervisor.md`

**Add section** (after Communication Principles):

```markdown
## Merge Decision Authority

**You are the merge authority.** Monitors verify quality, you decide strategy.

### When Monitor Reports VERIFIED_APPROVED

1. **Assess context**: Check all active work, dependencies, main status
2. **Make decision**: MERGE NOW, HOLD, or REJECT
3. **Execute**: If MERGE NOW, merge immediately with `gh pr merge --admin`
4. **Update all**: Notify all monitors about new main state

### Decision Criteria

**MERGE NOW when**:
- ✅ No dependency conflicts
- ✅ No other PRs waiting
- ✅ Main is stable
- ✅ No UI tests pending

**HOLD when**:
- ⏸️ Dependent work in progress
- ⏸️ Other PR should merge first
- ⏸️ Main is broken/unstable
- ⏸️ UI testing not complete

**REJECT when**:
- ❌ Verification actually failed
- ❌ Quality concerns found
- ❌ Doesn't fit project direction

### Trust Your Judgment

You have the full picture. Make the call.

User trusts you to:
- Merge when safe
- Hold when risky
- Maintain project health
```

---

## Testing the Implementation

### Test Scenario 1: Single Issue (Simple)

1. Start supervision: `/supervise-issue 42`
2. Monitor verifies → APPROVED
3. Supervisor receives report
4. Supervisor checks: No conflicts, stable main
5. **Expected**: Supervisor merges immediately
6. **Expected output**: "✅ Issue #42 merged to main"

### Test Scenario 2: Multiple Issues (Dependencies)

1. Start supervision: `/supervise` (issues #42, #43, #44)
2. Issue #42 verified APPROVED (database)
3. Issue #43 still in progress (uses database)
4. Supervisor receives #42 report
5. Supervisor checks: #43 depends on old main
6. **Expected**: Supervisor holds #42, waits for #43
7. When #43 also APPROVED:
8. **Expected**: Supervisor merges #42, then #43

### Test Scenario 3: Broken Main

1. Main branch has failing tests
2. Issue #42 verified APPROVED
3. Supervisor receives report
4. Supervisor checks: Main unstable
5. **Expected**: Supervisor holds all merges
6. **Expected message**: "Holding merges - main broken, fixing..."
7. After main fixed:
8. **Expected**: Supervisor merges all held PRs

---

## Summary

**Architecture**: Supervisor makes merge decisions with full project context

**Files to modify**: Only `.claude/commands/supervision/supervise.md` (Phase 3.2)

**Monitor behavior**: Unchanged - verify and report only

**Supervisor behavior**: Assess context → Make decision → Execute merge

**Benefits**: Strategic oversight, safety, user trust

**Next step**: Implement new Phase 3.2 in supervise.md
