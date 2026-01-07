# Verify SCAR Phase Implementation

**Purpose:** Verify that SCAR has actually completed a phase of work on a GitHub issue.

**Usage:** `/verify-scar-phase <project> <issue-number> <phase-number>`

**Example:** `/verify-scar-phase openhorizon.cc 43 1`

---

## Task

You are a verification agent. Your job is to check if SCAR actually completed the work it claims to have done.

### Inputs from User Command

- **Project:** $1 (e.g., "openhorizon.cc")
- **Issue Number:** $2 (e.g., "43")
- **Phase Number:** $3 (e.g., "1")

### Locations to Check

```bash
WORKSPACE="/home/samuel/.archon/workspaces/$1"
WORKTREE="/home/samuel/.archon/worktrees/$1/issue-$2"
```

**CRITICAL: Check the WORKTREE (not workspace!) for all files.**

---

## Verification Steps

### 1. Read SCAR's Latest Claim

Get SCAR's latest comment from GitHub:

```bash
gh issue view $2 --repo gpt153/$1 --comments --json comments \
  --jq '.comments[-1].body' | head -200
```

Identify what SCAR claims to have done (files created, builds run, etc.).

### 2. Verify Worktree Location

```bash
# Verify worktree exists
ls -la "$WORKTREE" 2>/dev/null || echo "ERROR: Worktree not found"

# Check git status
cd "$WORKTREE" && git status --short
```

### 3. Verify File Claims

For EACH file SCAR claims to have created:

```bash
# Check if file exists
[ -f "$WORKTREE/path/to/file" ] && echo "✅ EXISTS" || echo "❌ MISSING"

# Count lines (if code file)
wc -l "$WORKTREE/path/to/file"

# Check it's not empty
[ -s "$WORKTREE/path/to/file" ] && echo "✅ NOT EMPTY" || echo "⚠️ EMPTY FILE"
```

**Extract file claims from SCAR's comment** by looking for:
- "Created `src/pages/Dashboard.tsx`"
- "Implemented X in Y file"
- File paths in code blocks

### 4. Verify Build Claims

If SCAR claims "build succeeds" or "TypeScript compiles":

```bash
cd "$WORKTREE/project-pipeline/frontend"

# Try to build
npm run build 2>&1 | tail -30

# Check exit code
if [ $? -eq 0 ]; then
  echo "✅ Build succeeded"
else
  echo "❌ Build FAILED"
fi

# Type check
npm run type-check 2>&1 | tail -30
```

### 5. Check for Mocks/Placeholders

Search for forbidden patterns:

```bash
cd "$WORKTREE"

# Search for mock data
grep -r "mockData\|MOCK_\|placeholder\|TODO.*API\|example\.com" \
  --include="*.ts" --include="*.tsx" \
  project-pipeline/frontend/src/ 2>/dev/null | \
  grep -v ".test.ts" | grep -v ".spec.ts"

# If output is empty, no mocks found ✅
# If output exists, list the problematic files ❌
```

### 6. Count Code Lines

Get total line count for all TypeScript files:

```bash
cd "$WORKTREE/project-pipeline/frontend/src"
find . -name "*.tsx" -o -name "*.ts" | xargs wc -l 2>/dev/null | tail -1
```

### 7. Compare to Plan

Read the implementation plan to see what Phase N requires:

```bash
# Find plan file
PLAN_FILE="$WORKTREE/FRONTEND-IMPLEMENTATION-PLAN.md"

# Extract Phase N requirements (use grep to find phase section)
grep -A 50 "^### Phase $3:" "$PLAN_FILE" | head -60
```

Check if all required files from the plan are present.

---

## Output Format

Report your findings in this EXACT format:

```markdown
## 🔍 Phase $3 Verification Report - Issue #$2

**Project:** $1  
**Phase:** $3  
**Verified:** [DATE]  
**Worktree:** $WORKTREE

---

### SCAR's Claims

[Summarize what SCAR claimed - 2-3 bullet points]

---

### File Verification

| File | Exists | Lines | Status |
|------|--------|-------|--------|
| src/pages/Dashboard.tsx | ✅/❌ | 234 | ✅ OK / ⚠️ Empty |
| src/components/Header.tsx | ✅/❌ | 56 | ✅ OK |
| ... | | | |

**Total Files Claimed:** X  
**Total Files Verified:** Y  
**Missing Files:** Z

---

### Build Verification

- **npm run build:** ✅ Success / ❌ Failed
- **npm run type-check:** ✅ No errors / ❌ X errors
- **Exit code:** 0 / non-zero

**Build Output (last 10 lines):**
```
[paste relevant output]
```

---

### Mock/Placeholder Check

- **Mock data found:** ✅ None / ❌ Found in X files
- **Placeholder URLs:** ✅ None / ❌ Found
- **TODO comments:** ✅ None / ⚠️ Found (acceptable in comments)

**Violations (if any):**
```
src/pages/Dashboard.tsx:45: const mockData = [...]
src/services/api.ts:12: const API_URL = "http://example.com"
```

---

### Code Quality

- **Total TypeScript files:** X
- **Total lines of code:** Y
- **Average file size:** Z lines

---

### Plan Compliance

**Phase $3 Requirements from Plan:**
- [ ] Requirement 1 - ✅ Met / ❌ Not met
- [ ] Requirement 2 - ✅ Met / ❌ Not met
- [ ] Requirement 3 - ✅ Met / ❌ Not met

---

### ⚖️ VERDICT

**Status:** ✅ APPROVED / ❌ REJECTED / ⚠️ NEEDS FIXES

**Reasoning:**
[1-2 sentences explaining the verdict]

**Issues to Fix (if any):**
1. Missing file: src/components/X.tsx
2. Build failing due to TypeScript error in Y
3. Mock data found in Z files

---

### 📝 Recommendation

**If APPROVED:**
✅ Phase $3 complete. @scar may proceed to Phase [N+1].

**If REJECTED:**
❌ Phase $3 incomplete. @scar must fix issues listed above before proceeding.

**If NEEDS FIXES:**
⚠️ Phase $3 mostly complete but needs fixes. Address issues, then request re-verification.
```

---

## Important Notes

1. **Be thorough** - Check EVERY claim SCAR makes
2. **Be objective** - Base verdict on evidence, not assumptions
3. **Be specific** - If rejecting, list EXACTLY what's wrong
4. **Be concise** - Summary format, not full build logs
5. **Check worktree** - NOT workspace!

If you cannot access the worktree or files, report this clearly and stop verification.

## Example Invocation

User runs: `/verify-scar-phase openhorizon.cc 43 1`

You:
1. Set PROJECT="openhorizon.cc", ISSUE="43", PHASE="1"
2. Check worktree at `/home/samuel/.archon/worktrees/openhorizon.cc/issue-43/`
3. Read SCAR's latest comment from issue #43
4. Verify all claimed files exist and have content
5. Run build in `project-pipeline/frontend/`
6. Check for mocks
7. Compare to Phase 1 requirements in plan
8. Generate verdict report in format above

