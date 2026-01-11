# Playwright Testing Infrastructure Template

This directory contains reusable templates for setting up Playwright E2E testing in any Node.js project.

## Problem This Solves

Playwright tests systematically fail when using Alpine Linux Docker images because:
- Alpine uses `musl libc` instead of `glibc`
- Playwright's Chromium requires 10+ Debian/Ubuntu system libraries
- Tests fail with "cannot open shared object file" errors

## Solution

This template provides a complete testing infrastructure that:
1. Keeps production Docker image Alpine-based (lean & fast)
2. Uses separate Debian-based image for testing (Playwright compatible)
3. Includes CI/CD configuration (GitHub Actions)
4. Provides comprehensive documentation

## Template Contents

```
playwright-setup/
├── Dockerfile.test              # Debian-based with Playwright deps
├── docker-compose.test.yml      # Test service orchestration
├── playwright.config.ts         # Playwright configuration
├── .github/
│   └── workflows/
│       └── playwright.yml       # CI/CD workflow
├── package.json.snippet         # Scripts to add to package.json
├── .gitignore.snippet          # Artifacts to ignore
├── TESTING.md                  # Comprehensive testing guide
└── README.md                   # This file
```

## Usage

### Automatic (Recommended)

Use the propagation script from SCAR repository:

```bash
# From SCAR repo
./scripts/setup-playwright-testing.sh /path/to/your/project

# From target project
/home/samuel/scar/scripts/setup-playwright-testing.sh .
```

### Manual

1. Copy all files to your project root:
   ```bash
   cp -r .template/playwright-setup/* /path/to/your/project/
   ```

2. Merge `package.json.snippet` into your `package.json`:
   - Add scripts to `"scripts"` section
   - Add devDependencies to `"devDependencies"` section

3. Append `.gitignore.snippet` to your `.gitignore`:
   ```bash
   cat .gitignore.snippet >> .gitignore
   ```

4. Create `tests/` directory if it doesn't exist:
   ```bash
   mkdir -p tests
   ```

5. Customize `playwright.config.ts`:
   - Update `baseURL` to match your application URL
   - Add/remove browser projects as needed

6. Install dependencies:
   ```bash
   npm install --save-dev @playwright/test @types/node
   ```

7. Run tests:
   ```bash
   npm run test:docker
   ```

## Customization Points

### Required Changes
- **playwright.config.ts**: Update `baseURL` to your application URL

### Optional Changes
- **docker-compose.test.yml**: Add database or backend services if tests need them
- **playwright.config.ts**: Add more browsers (Firefox, Safari, Mobile)
- **GitHub Actions**: Adjust branches, add deployment steps

## Validation

After setup, verify everything works:

```bash
# 1. Install dependencies
npm install

# 2. Run tests in Docker (should work even without local Playwright)
npm run test:docker

# 3. Check CI/CD (push to GitHub and check Actions tab)
git push
```

## What Gets Created

After applying this template, your project will have:

1. **Test Infrastructure**
   - `Dockerfile.test` - Debian-based test image
   - `docker-compose.test.yml` - Test orchestration
   - `playwright.config.ts` - Test configuration

2. **CI/CD**
   - `.github/workflows/playwright.yml` - Automated testing

3. **Documentation**
   - `TESTING.md` - How to run tests

4. **Package Configuration**
   - Test scripts in `package.json`
   - Playwright dependencies installed
   - Test artifacts in `.gitignore`

5. **Test Directory**
   - `tests/` - Ready for test files

## Architecture

**Production (Alpine)**
- Dockerfile: `FROM node:20-alpine`
- Size: ~50MB
- Use: Deployment only

**Testing (Debian)**
- Dockerfile.test: `FROM node:20-slim`
- Size: ~200MB
- Use: Testing only (local + CI)

This separation keeps production lean while enabling E2E testing.

## Troubleshooting

### Template already exists
- Manual merge required
- Compare existing files with templates
- Don't overwrite custom configurations

### Tests still fail
- Verify you're using `npm run test:docker` (not `npm test`)
- Check Docker is running: `docker ps`
- Check `baseURL` in `playwright.config.ts`

### GitHub Actions fail
- Verify workflow file is in `.github/workflows/playwright.yml`
- Check branch names match your repo (main vs master)
- Review Actions logs in GitHub

## References

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Alpine vs Debian for Playwright](https://github.com/microsoft/playwright/issues/10000)
- SCAR Issue #27: Systematic E2E testing solution

## Version History

- v1.0 (Jan 2025): Initial template
  - Dockerfile.test with all Chromium dependencies
  - Docker Compose test setup
  - GitHub Actions workflow
  - Comprehensive documentation
