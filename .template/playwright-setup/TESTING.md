# Testing Guide

This document explains how to run Playwright E2E tests for this project.

## Problem & Solution

### The Issue
Playwright tests require Chromium browser, which needs specific system libraries (glibc, libnspr4, libnss3, etc.). Our production Docker image uses `node:20-alpine` (minimal, ~50MB, uses musl libc), but Playwright needs a full Debian/Ubuntu environment with glibc.

### The Solution
We maintain **two separate Docker images**:
1. **Production** (`Dockerfile`) - Alpine-based, minimal, for deployment (~50MB)
2. **Testing** (`Dockerfile.test`) - Debian-based, includes all Playwright dependencies (~200MB)

This keeps production lean while enabling comprehensive testing.

## Running Tests Locally

### Option 1: Docker (Recommended - No System Dependencies Required)

This is the **easiest and most reliable** method. No need to install system libraries on your host machine.

```bash
# Build and run tests in Docker
npm run test:docker

# Or using docker-compose directly
docker-compose -f docker-compose.test.yml up --build
```

**Advantages:**
- ✅ No system dependencies needed on your machine
- ✅ Identical environment to CI
- ✅ Works on any OS (Windows, Mac, Linux)
- ✅ Isolated from your host system

### Option 2: Direct Execution (Requires System Dependencies)

If you have all Playwright dependencies installed on your system:

```bash
# Install Playwright browsers
npx playwright install chromium

# Run tests
npm test

# Run tests with UI (interactive mode)
npm run test:ui

# Run tests in headed mode (see browser)
npm run test:headed
```

**Requirements:**
- Linux/Mac with full system libraries
- All dependencies from `Dockerfile.test` installed
- NOT recommended on Alpine-based systems

### Option 3: Install System Dependencies (Debian/Ubuntu only)

If you're on Debian/Ubuntu and want to run tests directly:

```bash
# Install Playwright system dependencies
npx playwright install-deps chromium

# Install Playwright browsers
npx playwright install chromium

# Run tests
npm test
```

## CI/CD

Tests run automatically in GitHub Actions on every push/PR using the official Playwright Docker image.

See: `.github/workflows/playwright.yml`

## Test Files

- `tests/*.spec.ts` - E2E test files
- `playwright.config.ts` - Playwright configuration
- `test-results/` - Test execution results (gitignored)
- `playwright-report/` - HTML test reports (gitignored)

## Writing Tests

Add new tests to `tests/` directory. See [Playwright docs](https://playwright.dev/docs/intro) for syntax.

Example:
```typescript
import { test, expect } from '@playwright/test';

test('should load homepage', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Expected Title/);
});

test('should navigate to about page', async ({ page }) => {
  await page.goto('/');
  await page.click('a[href="/about"]');
  await expect(page).toHaveURL(/\/about/);
});
```

## Configuration

### Base URL

Update `playwright.config.ts` to set your application URL:

```typescript
use: {
  baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
}
```

You can override via environment variable:
```bash
PLAYWRIGHT_TEST_BASE_URL=https://staging.example.com npm test
```

### Browsers

By default, tests run on Chromium only. To test on multiple browsers, uncomment projects in `playwright.config.ts`:

```typescript
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
],
```

## Troubleshooting

### Tests fail with "libnspr4.so not found" or similar

You're trying to run tests without system dependencies. Use **Docker method** instead (Option 1):

```bash
npm run test:docker
```

### Tests time out

1. Check if the application is running and accessible at the configured baseURL
2. Increase timeout in `playwright.config.ts`:
```typescript
use: {
  timeout: 30000, // 30 seconds
}
```

### "Browser not installed"

Run: `npx playwright install chromium`

### Port conflicts

If you see "port already in use" errors:
```bash
# Check what's using the port
lsof -i :3000

# Kill the process or use a different port
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3001 npm test
```

### Docker build fails

Make sure Docker is running:
```bash
docker --version
docker ps
```

## Best Practices

1. **Always use Docker for CI/CD** - Ensures consistency
2. **Use Docker for local testing too** - Eliminates "works on my machine"
3. **Keep production Dockerfile Alpine** - Don't add Playwright deps to production
4. **Run tests before every commit** - Catch regressions early
5. **Use test.only() sparingly** - CI fails if you forget to remove it
6. **Screenshot on failure** - Already configured automatically

## Architecture Decision

**Why two Dockerfiles?**

We use Alpine for production because:
- Smaller image size (~50MB vs ~200MB)
- Faster deployments
- Better security (minimal attack surface)
- We only need Node.js runtime, not browser testing

We use Debian for testing because:
- Playwright requires full system libraries (glibc)
- Easier to install dependencies
- Better compatibility with browser binaries
- Alpine uses musl libc instead of glibc

This separation keeps production lean while enabling comprehensive testing.

## Quick Reference

```bash
# Run tests in Docker (recommended)
npm run test:docker

# Run tests locally (requires deps)
npm test

# Interactive test UI
npm run test:ui

# See browser while testing
npm run test:headed

# Install Playwright browsers
npx playwright install chromium

# Install system deps (Debian/Ubuntu)
npx playwright install-deps chromium
```
