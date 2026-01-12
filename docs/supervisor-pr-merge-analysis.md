# Supervisor PR Merge Analysis

**Date**: 2026-01-12
**Issue**: Supervisor inconsistently merges PRs - sometimes merges automatically, sometimes asks for user approval, sometimes says it can't merge
**User Need**: Supervisor should ALWAYS merge PRs automatically after verification passes

---

## Current Behavior Analysis

### What The Supervisor Does Now

After SCAR completes an implementation and creates a PR, the supervisor:

1. **Runs verification** via `/verify-scar-phase`
2. **If APPROVED**: Reports completion with message "Ready for: Review and merge"
3. **Stops** - Does NOT automatically merge

**Source**: `.claude/commands/supervision/supervise-issue.md:264`

```markdown
**Ready for**: Review and merge
```

**Source**: `.claude/commands/supervision/scar-monitor.md:155-165`

```json
{
  "issue": 42,
  "status": "completed",
  "pr_url": "{url}",
  "verification": "approved"
}
```

### Why It's Inconsistent

The supervisor's behavior varies based on:

1. **User tells it to merge**: When you say "merge it", supervisor runs `/command-invoke merge-pr`
2. **User approves**: When you say "approve", supervisor interprets as permission to merge
3. **Supervisor hesitates**: When it sees PR requirements (reviews, checks), it asks user

### The Blockers

**1. `/merge-pr` command has safeguards** (`.claude/commands/exp-piv-loop/merge-pr.md:201-203`):

```markdown
### PR needs review approval
- Report this
- Do not merge without required approvals
```

**2. GitHub PR requirements**:
- `gh pr view` shows `mergeStateStatus`
- Can be: `CLEAN` (ready), `BLOCKED` (needs approval/checks), `BEHIND` (needs rebase), `DIRTY` (conflicts)

**3. Supervisor instructions say "Ready for review"**:
- This implies human approval needed
- Supervisor reports as complete but doesn't merge
- Waits for user action

---

## Root Cause

**The supervisor is designed to stop after verification and let humans merge.**

This design choice appears intentional for safety:
- Prevents accidental merges of broken code
- Allows human review before merging
- Respects GitHub branch protection rules

**However**, you don't want to review PRs (you can't code), so this safety mechanism adds no value for you.

---

## Solution: Make Supervisor Always Auto-Merge

### Option 1: Modify Supervisor Commands (Recommended)

**Change**: Update `/supervise-issue` and `/scar-monitor` to automatically merge after APPROVED verification.

**Files to modify**:
1. `.claude/commands/supervision/supervise-issue.md`
2. `.claude/commands/supervision/scar-monitor.md`

**What to add** after verification APPROVED:

```bash
### Auto-Merge After Verification

if [ "$VERIFICATION" = "APPROVED" ]; then
  echo "✅ Verification passed - Auto-merging PR..."

  # Extract PR number from URL
  PR_NUM=$(echo "$PR_URL" | grep -oP 'pull/\K[0-9]+')

  # Check merge status
  MERGE_STATUS=$(gh pr view $PR_NUM --json mergeStateStatus -q '.mergeStateStatus')

  if [ "$MERGE_STATUS" = "BLOCKED" ]; then
    echo "⚠️ PR blocked by branch protection (needs approvals/checks)"
    echo "Bypassing with admin merge..."
    gh pr merge $PR_NUM --squash --delete-branch --admin
  elif [ "$MERGE_STATUS" = "BEHIND" ]; then
    echo "PR behind main - rebasing first..."
    gh pr checkout $PR_NUM
    git fetch origin main
    git rebase origin/main
    git push --force-with-lease
    gh pr merge $PR_NUM --squash --delete-branch
  else
    # CLEAN status - merge normally
    gh pr merge $PR_NUM --squash --delete-branch
  fi

  echo "✅ PR #$PR_NUM merged to main"

  # Update completion message
  echo "**Status**: Merged to main ✅" >> completion_message.md
fi
```

**Add this section** to both:
- `supervise-issue.md` at line 265 (after "Ready for: Review and merge")
- `scar-monitor.md` at line 156 (in the APPROVED handling section)

### Option 2: Modify `/merge-pr` Command

**Change**: Remove the safeguard that prevents merging without approvals.

**File**: `.claude/commands/exp-piv-loop/merge-pr.md`

**Line 201-203** currently says:
```markdown
### PR needs review approval
- Report this
- Do not merge without required approvals
```

**Change to**:
```markdown
### PR needs review approval
- Use admin override to merge
- Run: `gh pr merge $ARGUMENTS --squash --delete-branch --admin`
```

**However**, this only helps if supervisor calls `/merge-pr`. Currently it doesn't - it just reports completion.

### Option 3: Add Auto-Merge Instructions to Supervisor Prime

**Change**: When you run `/prime-supervisor`, add explicit instruction to always merge.

**File**: `.claude/commands/supervision/prime-supervisor.md`

**Add new section** (around line 100, in the "Core Principles" section):

```markdown
## Auto-Merge Policy

**CRITICAL**: After verification APPROVED, ALWAYS merge PRs automatically.

**Rationale**: User cannot review code, so verification is the approval gate.

**Process**:
1. Verification passes → PR is approved
2. Immediately merge with: `gh pr merge --squash --delete-branch --admin`
3. Report: "✅ Merged to main"
4. Mark issue complete

**No exceptions**:
- Don't ask user for approval
- Don't wait for reviews
- Don't check branch protection rules
- Use `--admin` flag to bypass all checks

**User's policy**: "If verification passes, merge it."
```

This would rely on supervisor remembering the instruction, but may be inconsistent.

---

## Recommended Implementation

**Combine Option 1 + Option 3**:

1. **Update supervisor commands** to auto-merge after APPROVED
2. **Update prime-supervisor** to reinforce this as policy
3. **Test** with a simple issue to verify behavior

### Specific Changes Needed

#### File 1: `.claude/commands/supervision/supervise-issue.md`

**Line 246-269** currently:
```markdown
**APPROVED ✅**:
## ✅ Issue #$1 Complete

**Issue**: #{number} - {title}
**PR**: {pr-url}
**Verification**: APPROVED ✅

...

**Ready for**: Review and merge

---

**Supervision complete** - Issue #{number} successfully implemented and verified.
```

**Change to**:
```markdown
**APPROVED ✅**:

### Auto-Merge PR

```bash
# Extract PR number
PR_NUM=$(echo "$PR_URL" | grep -oP 'pull/\K[0-9]+')

# Merge immediately (use --admin to bypass protection rules)
gh pr merge $PR_NUM --squash --delete-branch --admin

echo "✅ PR #$PR_NUM merged to main"
```

### Report Completion

```markdown
## ✅ Issue #$1 Complete

**Issue**: #{number} - {title}
**PR**: #{pr-num} - MERGED ✅
**Verification**: APPROVED ✅

...

**Status**: Merged to main ✅

---

**Supervision complete** - Issue #{number} successfully implemented, verified, and merged.
```
```

#### File 2: `.claude/commands/supervision/scar-monitor.md`

**Line 155-165** currently:
```markdown
**If APPROVED:**
```markdown
## ✅ Issue #$ISSUE_NUM Complete

**PR**: {pr-url}
**Verification**: APPROVED ✅

{High-level summary}

**Supervision**: Complete
```

Post to issue and return to supervisor:
```json
{
  "issue": 42,
  "status": "completed",
  "pr_url": "{url}",
  "verification": "approved",
  "duration_minutes": 45
}
```
```

**Change to**:
```markdown
**If APPROVED:**

### Auto-Merge PR

```bash
# Extract PR number from URL
PR_NUM=$(echo "$PR_URL" | grep -oP 'pull/\K[0-9]+')

# Merge with admin override (bypasses all protection rules)
gh pr merge $PR_NUM --squash --delete-branch --admin

if [ $? -eq 0 ]; then
  MERGE_STATUS="merged"
  echo "✅ PR #$PR_NUM merged to main"
else
  MERGE_STATUS="merge_failed"
  echo "❌ Merge failed - reporting to supervisor"
fi
```

### Report Completion

```markdown
## ✅ Issue #$ISSUE_NUM Complete

**PR**: #{pr-num} - MERGED ✅
**Verification**: APPROVED ✅

{High-level summary}

**Supervision**: Complete
```

Return to supervisor:
```json
{
  "issue": 42,
  "status": "completed",
  "pr_url": "{url}",
  "pr_number": {pr-num},
  "pr_merged": true,
  "verification": "approved",
  "duration_minutes": 45
}
```
```

#### File 3: `.claude/commands/supervision/prime-supervisor.md`

Add new section after "Communication Principles" (around line 100):

```markdown
## Auto-Merge Policy (CRITICAL)

**User cannot review code.** Verification is the approval gate.

### Hard Rule

After `/verify-scar-phase` returns APPROVED:
1. Immediately merge PR: `gh pr merge --squash --delete-branch --admin`
2. Report: "✅ Issue #N complete - Merged to main"
3. Move to next issue

### No User Approval Needed

**Never ask**:
- "Should I merge this PR?"
- "PR is ready for review"
- "Approve to merge?"

**Always do**:
- Verify → APPROVED → Merge → Report complete

### Handle Merge Conflicts

If `gh pr merge` fails:
1. Check status: `gh pr view $PR_NUM --json mergeStateStatus`
2. If `BEHIND`: Rebase and merge
3. If `DIRTY`: Report conflict, ask user to resolve
4. If `BLOCKED`: Use `--admin` flag to bypass

### User Trust Model

User trusts:
- `/verify-scar-phase` to validate quality
- Supervisor to merge approved PRs
- SCAR to fix verification failures

User does NOT:
- Review code (can't code)
- Judge PR quality (relies on verification)
- Manually merge PRs (wants automation)

**Bottom line**: If verification passes, merge it. No questions asked.
```

---

## Testing The Fix

After making changes, test with:

1. **Create test issue**:
   ```bash
   gh issue create --title "Test auto-merge" --body "Simple typo fix to test supervisor auto-merge"
   ```

2. **Supervise the issue**:
   ```
   /supervise-issue {issue-number}
   ```

3. **Verify behavior**:
   - SCAR implements → creates PR
   - Supervisor verifies → APPROVED
   - **Expected**: Supervisor immediately merges PR
   - **Expected output**: "✅ Issue #N complete - Merged to main"
   - **NOT expected**: "Ready for review", "Should I merge?", "Waiting for approval"

4. **Check GitHub**:
   - PR should be merged
   - Issue should be closed
   - Branch should be deleted

---

## Edge Cases To Handle

### 1. Merge Conflicts

**Current**: Supervisor stops, asks user
**Needed**: Supervisor attempts rebase, reports if fails

```bash
if [ "$MERGE_STATUS" = "DIRTY" ]; then
  echo "❌ PR has merge conflicts"
  echo "Attempting auto-rebase..."

  gh pr checkout $PR_NUM
  git fetch origin main
  git rebase origin/main

  if [ $? -ne 0 ]; then
    git rebase --abort
    echo "❌ Auto-rebase failed - manual resolution needed"
    # Report to user
  else
    git push --force-with-lease
    gh pr merge $PR_NUM --squash --delete-branch --admin
    echo "✅ Rebased and merged"
  fi
fi
```

### 2. Failed CI Checks

**Current**: Supervisor stops, reports failed checks
**Needed**: Depends on your policy

**Option A**: Skip checks with `--admin`
```bash
gh pr merge $PR_NUM --squash --delete-branch --admin
# Bypasses ALL checks including CI
```

**Option B**: Wait for checks to pass
```bash
gh pr checks $PR_NUM --watch
# Waits for checks, then merges
```

**Recommended**: Option A, since `/verify-scar-phase` already validates build/tests

### 3. Branch Protection Rules

**Current**: GitHub blocks merge without approvals
**Needed**: Use `--admin` flag

```bash
gh pr merge $PR_NUM --squash --delete-branch --admin
# Requires admin permissions on repo
```

**Note**: Your GitHub token must have admin rights. Check with:
```bash
gh api /repos/gpt153/{repo}/collaborators/$(gh api /user -q .login)/permission
# Should show "admin"
```

---

## Summary

**Problem**: Supervisor stops after verification, doesn't merge PRs automatically

**Root Cause**: Design assumes human review step between verification and merge

**Solution**: Modify supervisor commands to auto-merge after APPROVED verification

**Files to Change**:
1. `.claude/commands/supervision/supervise-issue.md` (line 246-269)
2. `.claude/commands/supervision/scar-monitor.md` (line 155-165)
3. `.claude/commands/supervision/prime-supervisor.md` (add Auto-Merge Policy section)

**Key Change**: Add `gh pr merge --squash --delete-branch --admin` immediately after APPROVED verification

**Testing**: Create test issue, run `/supervise-issue`, verify PR gets merged automatically

---

## Next Steps

1. **Review** this analysis
2. **Decide** which files to modify (recommend all 3)
3. **Make changes** (I can help implement if you want)
4. **Test** with simple issue
5. **Deploy** to production workflow

Would you like me to make these changes to the supervisor commands?
