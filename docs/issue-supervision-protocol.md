# Issue Supervision Protocol

**WHEN TO ACTIVATE:** When user says "supervise issue #N" or "check progress on issue #N"

This protocol ensures SCAR (the remote AI agent) actually implements features correctly without using mock data or making false claims.

---

## Verification Method: Use the Subagent

**PRIMARY METHOD:** Use the `/verify-scar-phase` subagent command to keep context clean.

**When user says:** "check progress on issue 43" or "verify phase 2"

**You should run:**
```bash
/verify-scar-phase <project> <issue-number> <phase-number>
```

**Example:**
```bash
/verify-scar-phase openhorizon.cc 43 1  # Verify Phase 1 complete
/verify-scar-phase openhorizon.cc 43 2  # Verify Phase 2 complete
```

**What the subagent does:**
1. Reads SCAR's latest GitHub comment
2. Verifies all claimed files exist in worktree
3. Runs build and type checks
4. Searches for mocks/placeholders
5. Counts code lines
6. Compares to implementation plan
7. Returns concise verdict: APPROVED/REJECTED/NEEDS FIXES

**After subagent completes:**
- If APPROVED: Post approval comment on GitHub, direct SCAR to next phase
- If REJECTED: Post issues to fix on GitHub
- If NEEDS FIXES: Post specific fixes needed on GitHub

**Manual verification (fallback):** Only use the detailed manual steps below if the subagent command fails or is unavailable.

---

## Understanding Workspace vs Worktree Locations

**Workspace (Main Branch):**
- Location: `/home/samuel/.archon/workspaces/<project-name>/`
- Branch: Usually `main`
- Purpose: Stable codebase, merged work
- Check with: `cd /home/samuel/.archon/workspaces/<project-name> && git status`

**Worktree (Issue Branch):**
- Location: `/home/samuel/.archon/worktrees/<project-name>/issue-<number>/`
- Branch: `issue-<number>` (e.g., `issue-43`)
- Purpose: Active development for specific issue
- Check with: `cd /home/samuel/.archon/worktrees/<project-name>/issue-<number> && git status`

**CRITICAL: Always check BOTH locations when supervising!**

---

## Issue Supervision Checklist

When user requests supervision of an issue, IMMEDIATELY do:

### 1. Identify Project and Issue
```bash
# User says: "supervise issue #43 in openhorizon.cc"
PROJECT="openhorizon.cc"
ISSUE="43"
WORKSPACE="/home/samuel/.archon/workspaces/$PROJECT"
WORKTREE="/home/samuel/.archon/worktrees/$PROJECT/issue-$ISSUE"
```

### 2. Verify Locations Exist
```bash
# Check workspace exists
ls -la "$WORKSPACE" 2>/dev/null || echo "Workspace not found"

# Check worktree exists
ls -la "$WORKTREE" 2>/dev/null || echo "Worktree not found"

# List worktrees
cd "$WORKSPACE" && git worktree list
```

### 3. Read Issue from GitHub
```bash
# Get issue details
gh issue view $ISSUE --repo gpt153/$PROJECT --json title,body,state,comments

# Get latest SCAR comment
gh issue view $ISSUE --repo gpt153/$PROJECT --comments --json comments \
  --jq '.comments[-1].body' | head -100
```

### 4. Verify SCAR's Claims Against Reality

**For EACH claim SCAR makes, verify:**

**Claim: "Created file X"**
```bash
# Verify file exists in worktree (NOT workspace!)
ls -lh "$WORKTREE/path/to/file"

# Count lines if it's code
wc -l "$WORKTREE/path/to/file"

# Read first 50 lines to verify content
head -50 "$WORKTREE/path/to/file"
```

**Claim: "Build succeeds"**
```bash
cd "$WORKTREE"
npm run build 2>&1 | tail -50
# OR
npm run type-check 2>&1 | tail -50
```

**Claim: "Tests pass"**
```bash
cd "$WORKTREE"
npm test 2>&1 | tail -50
```

**Claim: "Phase N complete"**
- Verify ALL files for that phase exist
- Verify build succeeds
- Verify no TypeScript errors
- Check for mocks: `grep -r "mock\|placeholder\|TODO" "$WORKTREE/src"`

### 5. Compare Workspace vs Worktree
```bash
# See what changed in worktree
cd "$WORKSPACE"
git diff main issue-$ISSUE --stat

# See commits in worktree not in main
git log main..issue-$ISSUE --oneline
```

---

## Phase-by-Phase Supervision Protocol

**For each phase:**

### Phase Start
1. Read phase requirements from plan (usually in worktree root)
2. Note expected files to be created
3. Note verification criteria

### During Phase (When SCAR Posts Update)
1. **Verify files exist:**
   ```bash
   cd "$WORKTREE"
   for file in src/pages/Dashboard.tsx src/components/Header.tsx; do
     [ -f "$file" ] && echo "✅ $file" || echo "❌ MISSING: $file"
   done
   ```

2. **Verify build works:**
   ```bash
   cd "$WORKTREE"
   npm run build && echo "✅ Build OK" || echo "❌ Build FAILED"
   ```

3. **Check for mocks/placeholders:**
   ```bash
   cd "$WORKTREE"
   grep -r "mockData\|MOCK_\|placeholder\|TODO" src/ || echo "✅ No mocks found"
   ```

4. **Count real code lines:**
   ```bash
   cd "$WORKTREE"
   find src -name "*.tsx" -o -name "*.ts" | xargs wc -l | tail -1
   ```

### Phase Completion Verification

**Before approving phase, verify ALL of:**
- [ ] All claimed files exist in worktree
- [ ] Build succeeds (`npm run build`)
- [ ] TypeScript check passes (`npm run type-check`)
- [ ] No mocks in production code (search for "mock", "placeholder")
- [ ] Code line count matches expectations (not just empty files)
- [ ] Git shows actual changes (`git status`, `git diff`)

### Auto-Prompt Next Phase

**After verifying phase complete:**
```bash
# Post approval comment
gh issue comment $ISSUE --repo gpt153/$PROJECT --body \
"✅ Phase N Verified - @claude approval

**Verified:**
- Files created: X files (Y lines of code)
- Build: ✅ Success
- TypeScript: ✅ No errors
- Mocks: ✅ None found

**@scar - Proceed with Phase N+1**

Begin implementing [next phase name] as outlined in the plan."
```

---

## Red Flags to Watch For

**🚩 False Completion Claims:**
- SCAR says "created file X" but `ls` shows it doesn't exist
- SCAR says "build succeeds" but no build output shown
- SCAR says "phase complete" but files are empty/missing

**🚩 Mock Data:**
- `const mockData = [...]`
- `const PLACEHOLDER_URL = "http://example.com"`
- `// TODO: Connect to real API`
- `setTimeout(() => { /* fake async */ })`

**🚩 Vague Claims:**
- "Implementation complete" (complete what? proof?)
- "All features working" (show evidence!)
- "Ready for testing" (did YOU test it?)

---

## Completion Verification (Final Phase)

**Before marking issue complete, verify:**

1. **All phases completed and verified** (check your previous approval comments)
2. **Final build succeeds:**
   ```bash
   cd "$WORKTREE"
   npm run build
   npm run type-check
   npm run lint
   ```

3. **Manual testing evidence required:**
   - Request screenshots/video from SCAR
   - OR test yourself if application can run locally
   - Verify actual functionality (not just "compiles")

4. **No mocks in production code:**
   ```bash
   cd "$WORKTREE"
   grep -r "mock\|placeholder" src/ --include="*.ts" --include="*.tsx" \
     | grep -v ".test.ts" | grep -v ".spec.ts"
   ```

5. **Acceptance criteria met:**
   - Re-read issue requirements
   - Verify each requirement has evidence
   - Check "Definition of Done" checklist

6. **Create completion report:**
   ```bash
   gh issue comment $ISSUE --repo gpt153/$PROJECT --body \
   "## ✅ Issue #$ISSUE Complete - Final Verification

   **Supervisor:** @claude
   **Date:** $(date)

   **Phases Completed:** [list phases]
   **Files Created:** X files (Y total lines)
   **Build Status:** ✅ Success
   **Tests Status:** ✅ Pass
   **Mocks Found:** ❌ None

   **Evidence:**
   [attach screenshots/links]

   **Verified by:** @claude
   **Ready to merge:** YES/NO"
   ```

---

## Example Supervision Session

```bash
# User: "supervise issue #43 in openhorizon.cc"

# Step 1: Set up variables
PROJECT="openhorizon.cc"
ISSUE="43"
WORKTREE="/home/samuel/.archon/worktrees/$PROJECT/issue-$ISSUE"

# Step 2: Check what SCAR claims
gh issue view 43 --repo gpt153/$PROJECT --comments --json comments \
  --jq '.comments[-1].body'

# SCAR claims: "Created src/pages/Dashboard.tsx with 200 lines"

# Step 3: Verify the claim
ls -lh "$WORKTREE/src/pages/Dashboard.tsx"
# Output: -rw-r--r-- 1 samuel samuel 8.5K Jan 06 17:30 Dashboard.tsx ✅

wc -l "$WORKTREE/src/pages/Dashboard.tsx"
# Output: 203 Dashboard.tsx ✅

# Step 4: Check build
cd "$WORKTREE" && npm run build
# Output: ✓ built in 2.5s ✅

# Step 5: Approve and prompt next phase
gh issue comment 43 --repo gpt153/$PROJECT --body \
"✅ Dashboard verified - proceed with Phase 3"
```

---

## Summary: Your Supervision Role

**When user says "supervise issue #N":**
1. ✅ Check BOTH workspace AND worktree locations
2. ✅ Verify EVERY claim SCAR makes
3. ✅ Demand evidence (file listings, build output, line counts)
4. ✅ Check for mocks/placeholders
5. ✅ Approve phase ONLY after verification
6. ✅ Auto-prompt SCAR for next phase
7. ✅ Continue until ALL phases verified complete
8. ✅ Final verification before marking done

**NEVER:**
- ❌ Trust SCAR's claims without verification
- ❌ Check only workspace (must check worktree!)
- ❌ Approve phase without seeing evidence
- ❌ Skip verification steps
- ❌ Mark complete without manual testing proof

---

**This protocol prevents hours of wasted time on mock implementations and false claims.**
