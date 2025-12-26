# Feature: Add Playwright E2E Testing to SCAR for UI/UX Validation

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

Add Playwright browser automation to SCAR's Docker container to enable end-to-end (E2E) testing for all projects (current and future). This closes the critical gap where SCAR validates code quality (linting, TypeScript, builds) but does not validate actual UI/UX functionality from a user's perspective.

**Real-world problem**: SCAR currently says "feature tested and working" after verifying code compiles, but users discover features don't actually work. Example: working/formal toggle compiled successfully but didn't function in the browser.

## User Story

As a developer using SCAR for UI feature development
I want SCAR to validate that features actually work in a real browser
So that I can be confident features work from a user's perspective before creating PRs

## Problem Statement

SCAR's current validation pipeline only tests:
- ✅ Code compiles (TypeScript check)
- ✅ Linter passes
- ✅ Unit tests pass (if present)
- ❌ **Missing**: Actual UI/UX functionality works in browser

This creates false confidence where implementation is technically correct but functionally broken from the user's perspective.

## Solution Statement

Install Playwright with Chromium browser in SCAR's Docker container, update documentation to include E2E testing in validation workflows, and provide templates for new projects to easily add Playwright tests.

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Low
**Primary Systems Affected**:
- Dockerfile (Playwright installation)
- CLAUDE.md (documentation)
- README.md (feature documentation)
- .agents/commands/execute*.md (validation workflow)
- .template/ (project templates)

**Dependencies**:
- Playwright (npm package: `@playwright/test`)
- Chromium browser (installed via Playwright CLI)

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `Dockerfile` (lines 1-87) - Why: Need to add Playwright installation after npm ci
- `CLAUDE.md` (lines 89-127) - Why: Testing section where we'll add Playwright validation
- `README.md` (lines 1-100) - Why: Features section where we'll document Playwright capability
- `.agents/commands/execute-github.md` (lines 89-99) - Why: Validation commands section to add E2E tests
- `.agents/commands/execute.md` (if exists) - Why: Same validation section update needed
- `.template/CLAUDE.md` (lines 1-57) - Why: Template for new projects using SCAR

### New Files to Create

- `.template/playwright-setup/playwright.config.ts` - Playwright configuration template for new projects
- `.template/playwright-setup/e2e/example.spec.ts` - Example E2E test and template guide

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [Playwright Installation](https://playwright.dev/docs/intro#installing-playwright)
  - Specific section: Installation with npm
  - Why: Required for correct Docker installation command
- [Playwright Docker Guide](https://playwright.dev/docs/ci#docker)
  - Specific section: Running in Docker containers
  - Why: Shows proper system dependencies and installation pattern
- [Playwright Config](https://playwright.dev/docs/test-configuration)
  - Specific section: Configuration file structure
  - Why: Template config must follow best practices
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
  - Specific section: Test structure and organization
  - Why: Example test should demonstrate recommended patterns

### Patterns to Follow

**Dockerfile Pattern** (SCAR):
```dockerfile
# Install npm packages
RUN npm ci

# Additional tooling installations here
RUN npx -y playwright install --with-deps chromium

# Copy application code
COPY . .
```

**Documentation Pattern** (CLAUDE.md):
```markdown
### Testing Category

```bash
# Command to run
command here
# Expected output
```

**Why This Is Critical:**
- Bullet points explaining importance
```

**README Pattern** (Features Section):
```markdown
- **Feature Name:** Brief description of capability
```

**Command Validation Pattern** (.agents/commands/execute*.md):
```markdown
### N. Validation Category

If condition:

```bash
# Run validation
command

# Expected: Success message
```

If tests fail:
- Fix the issue
- Rerun
- Only proceed when passes
```

**Test Framework Pattern** (from package.json):
```json
{
  "scripts": {
    "test:e2e": "npx playwright test"
  }
}
```

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation

Install Playwright in Docker container with system dependencies.

**Tasks:**
- Update Dockerfile to install Playwright and Chromium browser
- Verify installation doesn't break existing build process
- Document image size impact

### Phase 2: Documentation Updates

Update SCAR's core documentation to include Playwright E2E testing in validation workflows.

**Tasks:**
- Add E2E testing section to CLAUDE.md testing requirements
- Update README.md features list with Playwright capability
- Update execute-github.md validation commands
- Update execute.md validation commands (if separate)
- Add migration guide for existing projects

### Phase 3: Project Templates

Create template files for new projects to easily adopt Playwright testing.

**Tasks:**
- Create playwright.config.ts template with sensible defaults
- Create example E2E test with comprehensive comments
- Update template CLAUDE.md with Playwright usage
- Document template usage in README

### Phase 4: Validation

Verify Playwright works in SCAR container and templates are functional.

**Tasks:**
- Build Docker image and verify Playwright is available
- Test Playwright execution inside container
- Verify template files are syntactically correct
- Validate documentation completeness

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### UPDATE Dockerfile

- **IMPLEMENT**: Add Playwright installation after npm ci (line ~56)
- **PATTERN**: Follow npm tooling installation pattern (npm ci → additional tools → COPY)
- **IMPORTS**: None (Dockerfile, no imports)
- **GOTCHA**: Must use `--with-deps` flag to install system dependencies; must use `chromium` (not `chrome`) for smaller image size
- **VALIDATE**: `docker compose --profile with-db build --no-cache`

```dockerfile
# After: RUN npm ci
# Before: COPY . .

# Install Playwright browsers (required for UI/UX testing in workspaces)
# This allows SCAR to run E2E tests in cloned projects
RUN npx -y playwright install --with-deps chromium
```

### UPDATE CLAUDE.md

- **IMPLEMENT**: Add Playwright E2E testing section after existing testing commands (after line 127)
- **PATTERN**: Mirror existing test section format with bash blocks, expected output, and "Why This Is Critical"
- **IMPORTS**: None (markdown)
- **GOTCHA**: Must emphasize this is OPTIONAL (only runs if project has Playwright configured)
- **VALIDATE**: Visual inspection for markdown formatting

```markdown
### Playwright E2E Tests (When Available)

If the project has Playwright tests (`npx playwright test`):

```bash
cd <project-directory>
npx playwright test
# All tests must pass
```

**Why This Is Critical:**
- Validates actual UI/UX functionality, not just code compilation
- Catches issues like:
  - Buttons that don't appear on the page
  - Click handlers that don't work
  - Features that compile but don't function from user perspective
- SCAR must verify features actually work before creating PR
```

### UPDATE README.md

- **IMPLEMENT**: Add Playwright E2E Testing to Features section (after line 16)
- **PATTERN**: Follow existing feature list bullet format
- **IMPORTS**: None (markdown)
- **GOTCHA**: Keep description concise (one line)
- **VALIDATE**: Visual inspection for formatting consistency

```markdown
- **UI/UX Testing**: SCAR can run Playwright E2E tests to validate actual functionality from user perspective
```

### UPDATE .agents/commands/execute-github.md

- **IMPLEMENT**: Add E2E testing validation step after integration tests section (after line 99)
- **PATTERN**: Mirror existing validation step format with numbered heading, bash block, conditional logic
- **IMPORTS**: None (markdown)
- **GOTCHA**: This is OPTIONAL validation - only runs if Playwright is configured
- **VALIDATE**: Visual inspection for markdown formatting and step numbering

```markdown
### 5. UI/UX Testing (if configured)

If the project has Playwright tests:

```bash
# Run E2E tests
npx playwright test

# Expected: All tests pass
```

If tests fail:
- Fix the issue (UI bug, incorrect test, etc.)
- Rerun all validations
- Only create PR when all tests pass
```

### CREATE .template/playwright-setup/playwright.config.ts

- **IMPLEMENT**: Create Playwright configuration template with comprehensive comments
- **PATTERN**: Use Playwright official config structure with sensible defaults
- **IMPORTS**: `@playwright/test`
- **GOTCHA**: Must use localhost URLs (not 0.0.0.0), webServer config for auto-start
- **VALIDATE**: `npx -y playwright test --config .template/playwright-setup/playwright.config.ts --list` (should list tests without errors)

```typescript
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for E2E Testing
 *
 * This config enables browser-based testing to validate UI/UX functionality.
 *
 * Usage:
 *   npm run test:e2e              - Run all tests
 *   npm run test:e2e -- --ui      - Run with UI mode
 *   npm run test:e2e -- --debug   - Run in debug mode
 */
export default defineConfig({
  // Test directory
  testDir: './e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry failed tests on CI
  retries: process.env.CI ? 2 : 0,

  // Limit parallel workers on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter: HTML report for local, GitHub Actions reporter for CI
  reporter: process.env.CI ? 'github' : 'html',

  // Shared settings for all tests
  use: {
    // Base URL for page.goto('/')
    baseURL: 'http://localhost:3000',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Browser projects to test against
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Add more browsers as needed:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Development server configuration
  // Playwright will automatically start this before running tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes
  },
});
```

### CREATE .template/playwright-setup/e2e/example.spec.ts

- **IMPLEMENT**: Create example E2E test with comprehensive template comments
- **PATTERN**: Use Playwright test structure with descriptive test names
- **IMPORTS**: `@playwright/test`
- **GOTCHA**: Must include commented template patterns for common UI testing scenarios
- **VALIDATE**: `npx -y playwright test .template/playwright-setup/e2e/example.spec.ts --config .template/playwright-setup/playwright.config.ts` (test should run and pass or fail gracefully)

```typescript
import { test, expect } from '@playwright/test';

/**
 * Example Playwright E2E Test
 *
 * This demonstrates basic UI/UX testing patterns.
 * Replace this with your actual feature tests.
 */
test('homepage loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});

/**
 * TEMPLATE PATTERNS for testing UI features:
 */

// Pattern 1: Test element visibility
test.skip('feature element appears on page', async ({ page }) => {
  await page.goto('/feature-page');

  const element = page.getByRole('button', { name: /submit/i });
  await expect(element).toBeVisible();
});

// Pattern 2: Test button click interaction
test.skip('button click triggers expected behavior', async ({ page }) => {
  await page.goto('/feature-page');

  const button = page.getByRole('button', { name: /toggle/i });
  await button.click();

  // Verify outcome (e.g., URL change, element appears, state changes)
  await expect(page).toHaveURL(/.*success/);
});

// Pattern 3: Test form submission
test.skip('form submission works correctly', async ({ page }) => {
  await page.goto('/form-page');

  // Fill form fields
  await page.getByLabel(/username/i).fill('testuser');
  await page.getByLabel(/password/i).fill('testpass');

  // Submit form
  await page.getByRole('button', { name: /submit/i }).click();

  // Verify success
  await expect(page.getByText(/success/i)).toBeVisible();
});

// Pattern 4: Test navigation flow
test.skip('navigation flow works end-to-end', async ({ page }) => {
  await page.goto('/');

  // Step 1: Click navigation link
  await page.getByRole('link', { name: /features/i }).click();
  await expect(page).toHaveURL(/.*features/);

  // Step 2: Interact with feature
  await page.getByRole('button', { name: /try it/i }).click();

  // Step 3: Verify final state
  await expect(page.getByText(/result/i)).toBeVisible();
});

// Pattern 5: Test error handling
test.skip('error states display correctly', async ({ page }) => {
  await page.goto('/form-page');

  // Submit invalid data
  await page.getByRole('button', { name: /submit/i }).click();

  // Verify error message appears
  await expect(page.getByText(/error|invalid|required/i)).toBeVisible();
});

/**
 * USAGE NOTES:
 *
 * - Remove .skip from tests to enable them
 * - Use test.only to run a single test during development
 * - Selectors priority: role > label > placeholder > text > test-id
 * - Always use regex for text matching: /text/i (case-insensitive)
 * - Wait for elements with expect().toBeVisible() (auto-retry)
 * - Test from user perspective (what they see/click), not implementation details
 */
```

### UPDATE .template/CLAUDE.md

- **IMPLEMENT**: Add Playwright usage section after "Using Archon" section (after line 52)
- **PATTERN**: Mirror existing tooling documentation format
- **IMPORTS**: None (markdown)
- **GOTCHA**: This is template file - uses placeholder variables
- **VALIDATE**: Visual inspection for markdown formatting

```markdown
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
```

### CREATE Migration Guide in README.md

- **IMPLEMENT**: Add "Adding Playwright to Existing Projects" section at end of README (after Troubleshooting)
- **PATTERN**: Step-by-step installation guide format
- **IMPORTS**: None (markdown)
- **GOTCHA**: Must reference template files created in earlier steps
- **VALIDATE**: Visual inspection for completeness

```markdown
---

## Adding Playwright to Existing Projects

SCAR includes Playwright in its container. To add E2E testing to an existing project:

### 1. Install Playwright

```bash
npm install --save-dev @playwright/test
```

### 2. Copy Template Configuration

```bash
# Copy config from SCAR templates
cp .template/playwright-setup/playwright.config.ts ./
mkdir -p e2e
cp .template/playwright-setup/e2e/example.spec.ts e2e/
```

### 3. Update package.json

Add test script:

```json
{
  "scripts": {
    "test:e2e": "npx playwright test"
  }
}
```

### 4. Write Your First Test

Edit `e2e/example.spec.ts` with your actual feature tests. See template comments for patterns.

### 5. Run Tests

```bash
npm run test:e2e
```

### 6. Update CLAUDE.md (Optional)

Add E2E testing requirements to your project's CLAUDE.md:

```markdown
### E2E Testing

```bash
npm run test:e2e
# All tests must pass
```
```

**Image Size Impact**: Playwright + Chromium adds ~200MB to Docker image. This is a one-time cost, cached across builds.
```

---

## TESTING STRATEGY

### Manual Validation

Since this feature enables testing infrastructure rather than implementing testable features, validation is primarily manual:

1. **Docker Build Verification**
   - Build succeeds without errors
   - Image size increase is acceptable (~200MB)
   - Playwright CLI is available in container

2. **Playwright Availability**
   - `npx playwright --version` works in container
   - Chromium browser is installed
   - System dependencies are present

3. **Template File Validation**
   - TypeScript files compile without errors
   - Playwright config is syntactically valid
   - Example test can be executed

4. **Documentation Review**
   - All documentation sections are clear and complete
   - Code examples are correct
   - Migration guide is actionable

### Edge Cases

- **No Playwright in Project**: Commands should gracefully skip E2E tests
- **Playwright Already Installed**: Template files should not conflict
- **CI Environment**: Config should handle CI-specific settings (retries, workers, reporters)

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Docker Build Validation

**Build SCAR container with Playwright:**

```bash
cd /worktrees/scar/issue-19
docker compose --profile with-db build --no-cache
```

**Expected:** Build completes successfully with no errors. Image size increases by ~200-250MB (acceptable).

**Why:** Verifies Playwright installation doesn't break Docker build process.

### Level 2: Playwright Availability

**Verify Playwright is installed in container:**

```bash
docker compose --profile with-db up -d
docker compose exec app-with-db npx playwright --version
```

**Expected:** Outputs Playwright version number (e.g., "Version 1.40.0").

**Why:** Confirms Playwright CLI is accessible inside SCAR container.

### Level 3: Browser Availability

**Verify Chromium browser is installed:**

```bash
docker compose exec app-with-db npx playwright install --dry-run chromium
```

**Expected:** "Chromium ... is already installed" or similar confirmation message.

**Why:** Confirms browser binary is present and functional.

### Level 4: Template File Validation

**Validate Playwright config syntax:**

```bash
docker compose exec app-with-db npx -y playwright test --config /app/.template/playwright-setup/playwright.config.ts --list
```

**Expected:** Lists tests or shows "no tests found" (syntax is valid either way).

**Why:** Confirms template config file is syntactically correct.

### Level 5: Documentation Review

**Check documentation formatting:**

```bash
# Render markdown to verify no syntax errors
cat CLAUDE.md | grep -A 10 "Playwright E2E Tests"
cat README.md | grep "Playwright"
cat .agents/commands/execute-github.md | grep -A 5 "UI/UX Testing"
```

**Expected:** All sections display correctly with proper formatting.

**Why:** Ensures documentation is readable and complete.

### Level 6: Template Test Execution

**Run example E2E test to verify it executes:**

```bash
# Note: This may fail (no dev server running), but should execute Playwright
docker compose exec app-with-db sh -c "cd /app/.template/playwright-setup && npx playwright test --reporter=list 2>&1 | head -20"
```

**Expected:** Playwright starts, attempts to run test (may fail on webServer timeout - this is OK). Should NOT show syntax errors.

**Why:** Verifies template test file is executable and Playwright works in container.

---

## ACCEPTANCE CRITERIA

- [x] Playwright installed in SCAR Docker image
- [x] Chromium browser available in container
- [x] CLAUDE.md updated with E2E testing requirements
- [x] README.md mentions Playwright capability
- [x] Template files created for new projects (config + example test)
- [x] .agents/commands/execute-github.md updated with E2E validation step
- [x] .template/CLAUDE.md updated with Playwright usage
- [x] Migration guide added to README for existing projects
- [x] Docker image builds successfully
- [x] SCAR can run `npx playwright test` in workspaces
- [x] Documentation includes examples and templates
- [x] All validation commands pass

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Docker image builds successfully with Playwright
- [ ] Playwright CLI accessible in container
- [ ] Chromium browser installed and functional
- [ ] Template files are syntactically valid
- [ ] Documentation is complete and formatted correctly
- [ ] No regressions in existing functionality
- [ ] Image size increase is documented (~200MB)

---

## NOTES

### Design Decisions

**Why Chromium only (not Firefox/WebKit)?**
- Chromium covers 90%+ of real-world browser usage
- Smaller image size (~200MB vs ~600MB for all browsers)
- Faster installation and test execution
- Can add more browsers later if needed

**Why install in Dockerfile (not per-project)?**
- One-time cost amortized across all projects
- Faster project setup (no per-project installation)
- Consistent browser version across all workspaces
- Simplifies CI/CD configuration

**Why templates (not automatic installation)?**
- Respects user choice (opt-in, not forced)
- Avoids conflicts with existing test setups
- Allows customization per project needs
- Clear migration path for existing projects

### Trade-offs

**Image Size (+200MB)**
- **Pro**: Enables critical UI/UX validation
- **Pro**: One-time cost, cached across builds
- **Con**: Larger download for first-time users
- **Decision**: Worth it - prevents broken features reaching production

**Build Time (+2-3 minutes)**
- **Pro**: Only happens on image rebuild (infrequent)
- **Pro**: Cached in Docker layers
- **Con**: Slower initial setup
- **Decision**: Acceptable for the value provided

### Future Enhancements

- Add Firefox/WebKit support (via ENV flag)
- Create more template examples (authentication, forms, navigation)
- Integrate with CI/CD examples (GitHub Actions)
- Add visual regression testing templates
- Create Playwright best practices guide
