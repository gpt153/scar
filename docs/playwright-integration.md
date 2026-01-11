# Playwright E2E Testing Integration Guide

This document explains the systematic solution for Playwright E2E testing across all SCAR-managed projects.

## Table of Contents
1. [Problem Statement](#problem-statement)
2. [Root Cause](#root-cause)
3. [Solution Architecture](#solution-architecture)
4. [Using the Template](#using-the-template)
5. [Customization Guide](#customization-guide)
6. [Troubleshooting](#troubleshooting)
7. [Projects Status](#projects-status)

## Problem Statement

### The Issue
Playwright E2E tests systematically fail when supervisor creates them across multiple projects. The error pattern is consistent:

```
Error: dlopen: cannot open shared object file: libnspr4.so: No such file or directory
```

### Why It Happens Everywhere
1. Production Docker images use `node:20-alpine` (minimal, ~50MB)
2. Alpine Linux uses `musl libc` instead of `glibc`
3. Playwright's Chromium requires 10+ Debian/Ubuntu system libraries
4. Tests fail with "cannot open shared object file" errors
5. Each project hits this independently

**Evidence:**
- ✅ openhorizon.cc#13 - Fixed with Dockerfile.test approach
- ❌ consilio#67 - E2E tests needed, would fail without fix
- ❌ Any future project with Alpine + Playwright

## Root Cause

### Technical Details

**Production Environment (Alpine):**
- Base image: `node:20-alpine`
- Size: ~50MB
- Libc: musl (not glibc)
- Missing: libnspr4, libnss3, libatk-1.0, libatspi, libgbm1, etc.

**Playwright Requirements (Chromium):**
- Requires: glibc (not musl)
- Requires: 20+ system libraries
- Requires: Full Debian/Ubuntu environment
- Cannot run on Alpine without significant hacks

**The Conflict:**
```
Production Dockerfile: node:20-alpine (no glibc)
     ↓
Playwright tests fail
     ↓
Cannot add deps to production (bloat)
     ↓
Need separate test environment
```

## Solution Architecture

### Dual Docker Image Strategy

We maintain **two separate Docker images** per project:

1. **Production** (`Dockerfile`) - Alpine-based
   - Base: `node:20-alpine`
   - Size: ~50MB
   - Purpose: Deployment
   - Libraries: Minimal (no Playwright)

2. **Testing** (`Dockerfile.test`) - Debian-based
   - Base: `node:20-slim`
   - Size: ~200MB
   - Purpose: E2E testing only
   - Libraries: Full Playwright dependencies

### Key Principle
**Never mix production and testing concerns.**
- Production stays lean (Alpine)
- Testing gets what it needs (Debian)
- Separation via different Dockerfiles

## Using the Template

### Quick Start

From any Node.js project:

```bash
# Run the propagation script
/home/samuel/scar/scripts/setup-playwright-testing.sh .

# Or from SCAR repo
./scripts/setup-playwright-testing.sh /path/to/project
```

### What Gets Installed

The script creates:

```
project/
├── Dockerfile.test              # Debian-based test image
├── docker-compose.test.yml      # Test orchestration
├── playwright.config.ts         # Test configuration
├── .github/
│   └── workflows/
│       └── playwright.yml       # CI/CD automation
├── TESTING.md                   # Documentation
├── tests/                       # Test directory
│   └── example.spec.ts         # Example test (if empty)
└── package.json                 # Updated with scripts
```

### Automated Setup

The script automatically:
- ✅ Validates project structure
- ✅ Backs up existing files
- ✅ Copies all templates
- ✅ Merges package.json scripts
- ✅ Updates .gitignore
- ✅ Creates tests/ directory
- ✅ Detects and suggests baseURL

### Manual Verification Checklist

After running the script:

- [ ] Check `playwright.config.ts` - Update `baseURL` to match your app
- [ ] Check `package.json` - Verify scripts don't conflict
- [ ] Check `.gitignore` - Ensure test artifacts are ignored
- [ ] Run `npm install` - Install Playwright dependency
- [ ] Run `npm run test:e2e:docker` - Verify setup works

## Customization Guide

### Common Customizations

#### 1. Base URL Configuration

**Default:**
```typescript
baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'
```

**For Vite projects (port 5173):**
```typescript
baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173'
```

**For production testing:**
```bash
PLAYWRIGHT_TEST_BASE_URL=https://app.example.com npm run test:e2e
```

#### 2. Script Naming (Avoid Conflicts)

**If project already has `test` script:**

Don't overwrite existing test scripts. Use E2E-specific names:

```json
{
  "scripts": {
    "test": "vitest",              // Existing unit tests
    "test:ui": "vitest --ui",      // Existing UI
    "test:e2e": "playwright test",  // NEW: E2E tests
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:docker": "docker-compose -f docker-compose.test.yml up --build"
  }
}
```

#### 3. Monorepo Projects

**For projects with separate frontend/backend:**

Apply to the frontend directory:

```bash
cd project/frontend
/home/samuel/scar/scripts/setup-playwright-testing.sh .
```

**Adjust docker-compose.test.yml if backend is needed:**

```yaml
services:
  playwright-tests:
    build:
      context: .
      dockerfile: Dockerfile.test
    depends_on:
      - backend
    environment:
      - API_URL=http://backend:3000

  backend:
    build: ../backend
    ports:
      - "3000:3000"
```

#### 4. Additional Services (Database, Redis, etc.)

**Add services to docker-compose.test.yml:**

```yaml
services:
  playwright-tests:
    depends_on:
      - postgres
      - redis
    environment:
      - DATABASE_URL=postgres://user:pass@postgres:5432/test
      - REDIS_URL=redis://redis:6379

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_PASSWORD=test
      - POSTGRES_DB=test

  redis:
    image: redis:7-alpine
```

## Troubleshooting

### Tests Still Fail After Setup

**Check you're using Docker:**
```bash
# ✅ Correct (uses Dockerfile.test)
npm run test:e2e:docker

# ❌ Wrong (requires local Playwright)
npm run test:e2e
```

**Verify Docker is running:**
```bash
docker --version
docker ps
```

### Port Conflicts

**Symptoms:**
```
Error: Port 3000 already in use
```

**Solution:**
```bash
# Check what's using the port
lsof -i :3000

# Kill the process or use different port
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3001 npm run test:e2e
```

### Tests Timeout

**Check baseURL is correct:**
```bash
# In playwright.config.ts
baseURL: 'http://localhost:5173'  // Must match your dev server
```

**Increase timeout:**
```typescript
use: {
  baseURL: 'http://localhost:5173',
  timeout: 60000,  // 60 seconds
}
```

### CI/CD Failures

**Check GitHub workflow branch names:**
```yaml
on:
  push:
    branches: [main, develop]  # Update to match your branches
```

**Check Node version matches:**
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'  # Must match your project
```

### Docker Build Fails

**Clear Docker cache:**
```bash
docker-compose -f docker-compose.test.yml build --no-cache
```

**Check disk space:**
```bash
df -h
docker system prune -a
```

## Projects Status

### ✅ Implemented

| Project | Issue | Status | Notes |
|---------|-------|--------|-------|
| openhorizon.cc | #13 | ✅ Complete | Original implementation |
| consilio | #67 | ✅ Complete | Applied via script |

### 📋 Pending

| Project | Priority | Notes |
|---------|----------|-------|
| project-manager | Medium | TBD if E2E tests needed |
| health-agent | Low | Backend-only, may not need E2E |
| quiculum-monitor | Low | Monitoring tool, TBD |

### 🔍 Audit Required

Run this to find projects that might need Playwright:

```bash
# Find projects with tests or test directories
find ~/projects -name "tests" -o -name "*.spec.ts" -o -name "*.test.ts" | grep -v node_modules

# Find projects with package.json mentioning tests
find ~/projects -name "package.json" -exec grep -l "test" {} \;
```

## Best Practices

### 1. Always Use Docker for Tests

**✅ DO:**
```bash
npm run test:e2e:docker
```

**❌ DON'T:**
```bash
npm run test:e2e  # Requires local Playwright + system deps
```

### 2. Keep Production Dockerfile Alpine

**✅ DO:**
```dockerfile
# Production Dockerfile
FROM node:20-alpine
```

**❌ DON'T:**
```dockerfile
# DON'T add Playwright deps to production!
FROM node:20-alpine
RUN apk add chromium  # ❌ Bloats production image
```

### 3. Test Locally Before CI

```bash
# 1. Test Docker setup locally
npm run test:e2e:docker

# 2. Verify tests pass
# 3. Then commit and push (CI will use same setup)
```

### 4. Write Stable Tests

```typescript
// ✅ Good: Wait for elements
await page.waitForSelector('button[type="submit"]');
await page.click('button[type="submit"]');

// ❌ Bad: Race conditions
await page.click('button[type="submit"]');
```

### 5. Use Semantic Selectors

```typescript
// ✅ Good: Semantic, stable
await page.getByRole('button', { name: 'Submit' });
await page.getByLabel('Email');

// ❌ Bad: Brittle, breaks with styling changes
await page.click('.btn-primary');
await page.fill('#email-input-field-1234');
```

## Template Maintenance

### Updating the Template

Template location: `.template/playwright-setup/`

**After updating templates:**

```bash
# Re-run propagation script on affected projects
./scripts/setup-playwright-testing.sh /path/to/project

# Review changes (script backs up existing files)
diff package.json package.json.backup-*
```

### Version Updates

**Playwright version:**

Update in `.template/playwright-setup/package.json.snippet`:

```json
{
  "devDependencies": {
    "@playwright/test": "^1.40.0"  // Update version here
  }
}
```

**GitHub Actions Playwright image:**

Update in `.template/playwright-setup/.github/workflows/playwright.yml`:

```yaml
container:
  image: mcr.microsoft.com/playwright:v1.40.0-jammy  # Update version
```

## References

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Alpine vs Debian for Playwright](https://github.com/microsoft/playwright/issues/10000)
- [Docker Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
- SCAR Issue #27: This implementation
- openhorizon.cc Issue #13: Original solution

## Support

**For issues:**
1. Check [Troubleshooting](#troubleshooting) section
2. Review `TESTING.md` in your project
3. Check Playwright docs: https://playwright.dev/docs/troubleshooting
4. Create SCAR issue with full error logs

**For template updates:**
1. Update `.template/playwright-setup/` in SCAR repo
2. Test on one project first
3. Propagate to all projects systematically
4. Update this documentation

---

Last updated: January 2025
Version: 1.0
