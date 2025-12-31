# Feature: Fix Git Authentication with Credential Helper

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

Fix git authentication failures for push operations by configuring git to use the GitHub CLI (`gh`) credential helper instead of embedding tokens directly into clone URLs. This prevents authentication mismatches when tokens expire or rotate, and ensures all git operations (clone, push, pull) use the same authentication mechanism.

## User Story

As a developer using SCAR
I want git push operations to succeed automatically
So that the bot can autonomously commit changes, create PRs, and manage repositories without manual intervention

## Problem Statement

Currently, SCAR embeds GitHub tokens directly into git clone URLs (`https://TOKEN@github.com/user/repo.git`). This creates authentication failures when:

1. **Token rotation**: Embedded token differs from current `GH_TOKEN` environment variable
2. **Push operations fail**: Git tries to authenticate with the embedded token which may be invalid/expired
3. **Manual intervention required**: Users must manually fix remote URLs before pushing
4. **Worktree workflows broken**: New worktrees inherit broken remote URLs from main repo

**Error Example:**
```
remote: Invalid username or token. Password authentication is not supported.
fatal: Authentication failed for 'https://github.com/...'
```

## Solution Statement

Configure git globally to use the GitHub CLI credential helper, which automatically retrieves valid tokens from `gh auth` context. Remove token embedding from clone operations so all git commands authenticate consistently through the credential helper.

**Benefits:**
- ✅ Centralized authentication via gh CLI
- ✅ Token rotation handled automatically
- ✅ Works for all git operations (clone, push, pull, fetch)
- ✅ No tokens stored in repository configs
- ✅ Minimal code changes (remove token embedding logic)

## Feature Metadata

**Feature Type**: Bug Fix
**Estimated Complexity**: Low
**Primary Systems Affected**:
- Dockerfile (git credential configuration)
- src/handlers/command-handler.ts (clone command)
- src/handlers/new-topic-handler.ts (topic clone)

**Dependencies**:
- GitHub CLI (`gh`) - already installed in Dockerfile
- Git credential helper support (built-in)

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `Dockerfile` (lines 40-52) - Where gh CLI is installed and git is configured
- `src/handlers/command-handler.ts` (lines 399-417) - Current clone logic with token embedding
- `src/handlers/new-topic-handler.ts` (lines 145-148) - Topic clone logic with token embedding
- `CLAUDE.md` (lines 52-57) - Git best practices and patterns to follow

### New Files to Create

None - this is a modification of existing files only

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [GitHub CLI Manual - Git Credential Helper](https://cli.github.com/manual/gh_auth_setup-git)
  - Specific section: `gh auth setup-git` command
  - Why: Shows how to configure git credential helper
- [Git Credential Storage Documentation](https://git-scm.com/docs/gitcredentials)
  - Specific section: Custom credential helpers
  - Why: Explains how git credential helpers work
- [GitHub Token Authentication](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
  - Specific section: Using tokens on command line
  - Why: Confirms that gh CLI credential helper is the recommended approach

### Patterns to Follow

**Git Command Pattern (from CLAUDE.md):**
```typescript
// ✅ ALWAYS use execFileAsync for git commands (prevents command injection)
await execFileAsync('git', ['clone', url, targetPath]);

// ❌ NEVER use exec with string concatenation
await exec(`git clone ${url} ${targetPath}`); // Vulnerable!
```

**Error Handling Pattern (from command-handler.ts):**
```typescript
try {
  await execFileAsync('git', ['clone', cloneUrl, targetPath]);
  // Success logging
  console.log('[Clone] Cloning succeeded');
} catch (error) {
  const err = error as Error;
  console.error('[Clone] Failed:', err);
  return {
    success: false,
    message: `Failed to clone repository: ${err.message}`,
  };
}
```

**Logging Pattern (from CLAUDE.md):**
```typescript
// Good: Structured logging with context
console.log('[Component] Action', { key: 'value', timestamp: new Date().toISOString() });

// Good: Never log sensitive data
console.log('[Clone] Using authenticated GitHub clone'); // Don't log token!
```

---

## IMPLEMENTATION PLAN

### Phase 1: Configure Git Credential Helper

Set up git to use gh CLI for GitHub authentication globally in the Docker container.

**Tasks:**
- Configure git credential helper in Dockerfile after gh CLI installation
- Ensure configuration persists for all git operations

### Phase 2: Remove Token Embedding

Remove logic that embeds tokens into clone URLs in both handlers.

**Tasks:**
- Simplify clone logic in command-handler.ts to use plain HTTPS URLs
- Simplify clone logic in new-topic-handler.ts to use plain HTTPS URLs
- Remove token URL manipulation code

### Phase 3: Testing & Validation

Verify that all git operations work with the credential helper.

**Tasks:**
- Test clone operation
- Test push operation (create commit and push)
- Test pull operation
- Verify no manual intervention needed

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### TASK 1: UPDATE Dockerfile

- **IMPLEMENT**: Add git credential helper configuration after gh CLI installation (after line 52)
- **PATTERN**: Use RUN command to execute git config commands
- **COMMANDS**:
  ```dockerfile
  # Configure git to use gh CLI for authentication
  RUN git config --global credential.https://github.com.helper "" && \
      git config --global credential.https://github.com.helper "!/usr/bin/gh auth git-credential" && \
      git config --global credential.https://gist.github.com.helper "" && \
      git config --global credential.https://gist.github.com.helper "!/usr/bin/gh auth git-credential"
  ```
- **WHY**: Clear any existing credential helpers first (empty string), then set gh CLI as the helper
- **GOTCHA**: Must use absolute path `/usr/bin/gh` - relative paths don't work in credential helper context
- **GOTCHA**: Must configure BEFORE switching to appuser (line 91) to ensure global config is applied
- **VALIDATE**: Build Docker image and verify git config:
  ```bash
  docker build -t scar-test .
  docker run --rm scar-test git config --global --get credential.https://github.com.helper
  # Expected: !/usr/bin/gh auth git-credential
  ```

### TASK 2: UPDATE src/handlers/command-handler.ts

- **IMPLEMENT**: Remove token embedding logic from clone command (lines 399-415)
- **PATTERN**: Simplify to direct clone with plain HTTPS URL
- **BEFORE** (lines 399-417):
  ```typescript
  // Build clone command with authentication if GitHub token is available
  let cloneUrl = workingUrl;
  const ghToken = process.env.GH_TOKEN;

  if (ghToken && workingUrl.includes('github.com')) {
    // Inject token into GitHub URL for private repo access
    // Convert: https://github.com/user/repo.git -> https://token@github.com/user/repo.git
    if (workingUrl.startsWith('https://github.com')) {
      cloneUrl = workingUrl.replace('https://github.com', `https://${ghToken}@github.com`);
    } else if (workingUrl.startsWith('http://github.com')) {
      cloneUrl = workingUrl.replace('http://github.com', `https://${ghToken}@github.com`);
    } else if (!workingUrl.startsWith('http')) {
      // Handle github.com/user/repo format (bare domain)
      cloneUrl = `https://${ghToken}@${workingUrl}`;
    }
    console.log('[Clone] Using authenticated GitHub clone');
  }

  await execFileAsync('git', ['clone', cloneUrl, targetPath]);
  ```
- **AFTER**:
  ```typescript
  // Clone repository (authentication via gh CLI credential helper)
  // The credential helper automatically retrieves tokens from gh auth context
  console.log('[Clone] Cloning repository (auth via gh CLI credential helper)');
  await execFileAsync('git', ['clone', workingUrl, targetPath]);
  ```
- **IMPORTS**: No changes needed - execFileAsync already imported
- **GOTCHA**: Keep the `workingUrl` variable as-is - it's the normalized URL without token
- **GOTCHA**: Remove the entire token embedding block (lines 399-415), not just parts of it
- **VALIDATE**:
  ```typescript
  npm run build
  npm run type-check
  ```

### TASK 3: UPDATE src/handlers/new-topic-handler.ts

- **IMPLEMENT**: Remove token embedding from topic creation clone (line 148)
- **PATTERN**: Use plain HTTPS URL directly (same pattern as command-handler.ts)
- **BEFORE** (line 148):
  ```typescript
  await execFileAsync('git', ['clone', repo.cloneUrl, repoPath]);
  ```
- **AFTER**:
  ```typescript
  // Clone repository (authentication via gh CLI credential helper)
  console.log('[NewTopic] Cloning repository (auth via gh CLI credential helper)');
  await execFileAsync('git', ['clone', repo.cloneUrl, repoPath]);
  ```
- **IMPORTS**: No changes needed - execFileAsync already imported
- **GOTCHA**: The `repo.cloneUrl` from `createRepository()` already returns plain HTTPS URL (verified in src/utils/github-repo.ts)
- **VALIDATE**:
  ```typescript
  npm run build
  npm run type-check
  ```

### TASK 4: UPDATE unit tests (if needed)

- **IMPLEMENT**: Review test mocks in command-handler.test.ts
- **PATTERN**: Ensure mocked execFile calls expect plain URLs (no tokens)
- **CHECK**: Lines where `execFile` is mocked for clone operations
- **GOTCHA**: Tests mock `execFile` - ensure they don't expect token-embedded URLs
- **VALIDATE**:
  ```bash
  npm test -- src/handlers/command-handler.test.ts
  ```

---

## TESTING STRATEGY

### Unit Tests

**Scope**: Verify command parsing and clone logic changes

**Tests to Run**:
```bash
# Run all handler tests
npm test -- src/handlers/command-handler.test.ts

# Run new-topic handler tests (if they exist)
npm test -- src/handlers/new-topic-handler.test.ts
```

**Expected**: All existing tests pass (no changes to test assertions needed unless they explicitly check for token-embedded URLs)

### Integration Tests

**Scope**: End-to-end clone, commit, and push workflow

**Manual Test Workflow**:

1. **Build Docker image**:
   ```bash
   docker-compose build
   ```

2. **Start container with GH_TOKEN**:
   ```bash
   docker-compose --profile with-db up -d
   ```

3. **Verify gh CLI authentication**:
   ```bash
   docker exec -it remote-coding-agent-app-with-db-1 gh auth status
   # Expected: Logged in to github.com as <username>
   ```

4. **Verify git credential helper**:
   ```bash
   docker exec -it remote-coding-agent-app-with-db-1 git config --global --get credential.https://github.com.helper
   # Expected: !/usr/bin/gh auth git-credential
   ```

5. **Test clone via bot**:
   - Send `/clone https://github.com/gpt153/scar-test-private` to bot
   - Verify clone succeeds (check logs for success message)

6. **Test push operation**:
   - Send message to bot: "Create a test file and commit it"
   - Bot should: create file, commit, and push to GitHub
   - Verify no authentication errors in logs
   - Check GitHub repo for the new commit

### Edge Cases

**Test Scenarios**:

1. **Private repository clone**:
   - Clone a private repo the token has access to
   - Expected: Clone succeeds without errors

2. **SSH URL conversion** (already supported):
   - Use `/clone git@github.com:user/repo.git`
   - Expected: Converts to HTTPS, uses credential helper

3. **Bare domain format** (already supported):
   - Use `/clone github.com/user/repo`
   - Expected: Adds https://, uses credential helper

4. **Token rotation simulation**:
   - Change `GH_TOKEN` env var after cloning
   - Try to push
   - Expected: Push succeeds with new token (credential helper retrieves it)

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Docker Build

**Verify Dockerfile builds successfully:**

```bash
docker-compose build
```

**Expected**: Build completes without errors, git config commands execute successfully

**Why**: Catches syntax errors in Dockerfile RUN commands

### Level 2: Git Credential Configuration

**Verify git credential helper is configured:**

```bash
docker-compose --profile with-db up -d
docker exec -it remote-coding-agent-app-with-db-1 git config --global --list | grep credential
```

**Expected Output**:
```
credential.https://github.com.helper=!/usr/bin/gh auth git-credential
credential.https://gist.github.com.helper=!/usr/bin/gh auth git-credential
```

**Why**: Confirms git is configured to use gh CLI for authentication

### Level 3: GitHub CLI Authentication

**Verify gh CLI is authenticated:**

```bash
docker exec -it remote-coding-agent-app-with-db-1 gh auth status
```

**Expected Output**:
```
github.com
  ✓ Logged in to github.com as <username> (keyring)
  ✓ Git operations for github.com configured to use https protocol.
  ✓ Token: *******************
```

**Why**: Confirms gh CLI can provide credentials to git

### Level 4: TypeScript Compilation

**Verify code compiles without errors:**

```bash
npm run build
npm run type-check
```

**Expected**: No TypeScript errors, build completes successfully

**Why**: Catches type errors from code changes

### Level 5: Unit Tests

**Run all unit tests:**

```bash
npm test
```

**Expected**: All tests pass (no regressions)

**Why**: Ensures changes don't break existing functionality

### Level 6: Linting & Formatting

**Verify code quality:**

```bash
npm run lint
npm run format:check
```

**Expected**: No linting errors, formatting is correct

**Why**: Maintains code quality standards

### Level 7: Manual Integration Test

**Test clone → commit → push workflow:**

```bash
# 1. Clone a repository via bot
# Send to bot: /clone https://github.com/gpt153/scar-test-private

# 2. Check logs for success
docker-compose logs -f app-with-db | grep Clone

# 3. Make a commit and push (via bot message)
# Send to bot: "Create a file called test.txt with content 'Hello World' and commit it with message 'Test commit'"

# 4. Verify push succeeded
docker-compose logs -f app-with-db | grep -i "push\|error\|authentication"

# 5. Check GitHub for the commit
gh repo view gpt153/scar-test-private --web
# Navigate to commits and verify test.txt was pushed
```

**Expected**:
- Clone succeeds
- Commit is created
- Push succeeds with no authentication errors
- Commit appears on GitHub

**Why**: Validates the complete workflow end-to-end

---

## ACCEPTANCE CRITERIA

- [x] Dockerfile configures git credential helper for github.com
- [x] Dockerfile configures git credential helper for gist.github.com
- [x] command-handler.ts uses plain HTTPS URLs for clone (no token embedding)
- [x] new-topic-handler.ts uses plain HTTPS URLs for clone (no token embedding)
- [x] Docker image builds successfully
- [x] Git credential helper is configured correctly
- [x] gh CLI is authenticated in container
- [x] TypeScript compilation succeeds
- [x] All unit tests pass
- [x] Linting and formatting pass
- [x] Clone operation works for private repositories
- [x] Push operation succeeds without authentication errors
- [x] No manual intervention required for git operations
- [x] Logging includes credential helper context

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (unit + integration)
- [ ] No linting or type checking errors
- [ ] Manual testing confirms clone and push work
- [ ] Acceptance criteria all met
- [ ] Code reviewed for quality and maintainability

---

## NOTES

### Design Decisions

**Why credential helper instead of token cleanup?**
- Credential helper is the recommended GitHub approach
- Handles token rotation automatically
- No need to modify remote URLs post-clone
- Simpler code (removes token manipulation logic)

**Why configure in Dockerfile vs runtime?**
- Configuration needs to be global and persistent
- Dockerfile ensures it's set before any git operations
- Avoids race conditions if app tries to clone before setup

**Why clear existing helpers first?**
- Prevents conflicts with default git credential helpers
- Ensures gh CLI is the only credential provider
- Makes configuration idempotent (safe to run multiple times)

### Trade-offs

**Dependency on gh CLI:**
- Pro: Already required for GitHub operations (issue comments, PR creation)
- Pro: Handles OAuth token refresh automatically
- Con: Adds slight coupling to gh CLI (acceptable - it's a core dependency)

**Global git config:**
- Pro: Works for all repositories and users
- Pro: Simple configuration (one-time setup)
- Con: Affects all git operations in container (acceptable - we only use GitHub)

### Security Considerations

- ✅ No tokens stored in git configs or remote URLs
- ✅ gh CLI manages token storage securely (keyring/environment)
- ✅ Credential helper only provides tokens to github.com domains
- ✅ No changes to existing authorization patterns (still requires GH_TOKEN env var)

### Alternative Approaches Considered

**Option 2: Post-clone URL cleanup** (from issue description)
- Keep token embedding, but clean URLs after clone
- More complex - requires tracking what to clean
- Doesn't solve root cause - still using tokens incorrectly

**Option 3: Git credential store** (simple file-based)
- Store tokens in `~/.git-credentials`
- Less secure than credential helper
- Manual token rotation required

**Decision: Option 1 (credential helper) is the best solution** ✅
