# Playwright Integration for UI/UX Testing

## Overview

SCAR can use Playwright for browser automation to test website features and UI functionality when operating via GitHub webhooks. This is powered by the Playwright MCP (Model Context Protocol) server.

## How It Works

### Architecture

```
GitHub Issue/PR Comment (@scar test the login page)
         ↓
GitHub Webhook → SCAR → Orchestrator
         ↓
Claude Agent SDK (with Playwright MCP enabled)
         ↓
Playwright MCP Server (npx @playwright/mcp)
         ↓
Chromium Browser (installed in Docker container)
         ↓
Test Results → Posted back to GitHub issue/PR
```

### Key Components

1. **System Dependencies** (Dockerfile lines 19-37)
   - `libnspr4` - Core Netscape Portable Runtime library (fixes "libnspr4.so not found")
   - `libnss3` - Network Security Services library
   - Additional Chromium dependencies (libatk, libcups2, libgbm1, etc.)

2. **Playwright Browsers** (Dockerfile line 97)
   - Chromium installed in `/home/appuser/.cache/ms-playwright/`
   - Installed as `appuser` (non-root) for security and proper permissions
   - Headless browser automation ready for use

3. **Playwright MCP Server** (src/clients/claude.ts:87-94)
   - Automatically spawned when `ENABLE_PLAYWRIGHT_MCP=true`
   - Uses `npx -y @playwright/mcp` (auto-installs on first use)
   - Provides browser automation tools to Claude Code instances

## Configuration

### Environment Variables

```env
# Enable Playwright MCP (default: true)
ENABLE_PLAYWRIGHT_MCP=true
```

**Note**: Playwright MCP is **enabled by default** in `.env.example`.

### Capabilities Provided to Claude

When Playwright MCP is enabled, SCAR's Claude Code instances have access to:

- `mcp__playwright__browser_navigate` - Navigate to URLs
- `mcp__playwright__browser_click` - Click elements
- `mcp__playwright__browser_type` - Type text into inputs
- `mcp__playwright__browser_snapshot` - Capture accessibility snapshots
- `mcp__playwright__browser_take_screenshot` - Take screenshots
- `mcp__playwright__browser_evaluate` - Execute JavaScript
- `mcp__playwright__browser_wait_for` - Wait for elements/events
- And many more... (full list in MCP server documentation)

## Usage Examples

### Example 1: Test Login Flow (GitHub Issue)

**User comment on issue**:
```
@scar test the login flow on https://app.openhorizon.cc

Check:
1. Login form displays correctly
2. Email and password fields are present
3. Submit button is clickable
4. Error message shows for invalid credentials
```

**SCAR's workflow**:
1. Receives webhook from GitHub
2. Spawns Claude Code instance with Playwright MCP
3. Claude uses Playwright tools:
   - Navigate to URL
   - Take snapshot of page structure
   - Find email/password inputs
   - Click submit button
   - Verify error handling
4. Posts test results as GitHub comment

### Example 2: Visual Regression Testing

**User comment**:
```
@scar compare the homepage before and after the redesign

Old URL: https://app.openhorizon.cc?version=old
New URL: https://app.openhorizon.cc

Take screenshots and report differences.
```

**SCAR's workflow**:
1. Take screenshot of old version
2. Take screenshot of new version
3. Compare visually
4. Report findings with screenshot links

### Example 3: Feature Verification

**User comment**:
```
@scar verify that the working/formal toggle works on /seeds page

Expected behavior:
- Toggle should be visible in header
- Clicking toggle should change content
- Mode should persist across page refreshes
```

**SCAR's workflow**:
1. Navigate to /seeds page
2. Find toggle button using accessibility snapshot
3. Click toggle
4. Verify content changes
5. Reload page and verify persistence
6. Report results

## Docker Build Considerations

### Critical Fixes Implemented

**Problem 1: Missing System Dependencies**
- **Before**: Playwright failed with "libnspr4.so not found"
- **After**: All Chromium dependencies installed as system packages (lines 19-37)

**Problem 2: Permission Issues**
- **Before**: Browsers installed as root, inaccessible to appuser
- **After**: Browsers installed as appuser after `USER appuser` (line 97)

### Build Process

```dockerfile
# 1. Install system deps as root (lines 10-38)
RUN apt-get install -y libnspr4 libnss3 ...

# 2. Switch to non-root user (line 91)
USER appuser

# 3. Install browsers as appuser (line 97)
RUN npx -y playwright install chromium
```

## Testing the Integration

### Local Testing

**Build the Docker image**:
```bash
docker compose --profile with-db build
```

**Start SCAR**:
```bash
docker compose --profile with-db up -d
```

**Test via GitHub webhook**:
1. Create a test issue in your repository
2. Comment: `@scar navigate to https://example.com and take a screenshot`
3. SCAR should respond with accessibility snapshot and/or screenshot results

### Verification Steps

**Check Playwright is available**:
```bash
# Inside running container
docker compose exec app-with-db bash
npx playwright --version
# Should output: Version 1.x.x
```

**Check browsers are installed**:
```bash
ls -la /home/appuser/.cache/ms-playwright/chromium-*/
# Should show chromium browser files
```

**Check MCP server loads**:
```bash
# Check application logs when it starts
docker compose logs app-with-db | grep "Playwright MCP"
# Should show: [Claude] Playwright MCP enabled
```

## Troubleshooting

### Issue: "libnspr4.so not found"

**Cause**: System dependencies not installed
**Fix**: Rebuild Docker image (system deps added to Dockerfile)

### Issue: "Executable doesn't exist at /root/.cache/ms-playwright/"

**Cause**: Browsers installed as root, but app runs as appuser
**Fix**: Rebuild Docker image (browsers now install as appuser)

### Issue: Playwright MCP not available to Claude

**Cause**: `ENABLE_PLAYWRIGHT_MCP` not set to `true`
**Fix**: Set environment variable in `.env` file

### Issue: Browser crashes or hangs

**Cause**: Insufficient memory or missing dependencies
**Fix**:
1. Increase Docker memory limit (4GB+ recommended)
2. Verify all system deps are installed
3. Check logs for specific error messages

## Performance Considerations

### Resource Usage

- **Memory**: ~500MB per Chromium browser instance
- **Disk**: ~300MB for Chromium installation
- **CPU**: Moderate usage during page rendering

### Recommendations

- Use headless mode (default in MCP)
- Limit concurrent browser sessions
- Close browsers after each test
- Consider timeout limits for long-running tests

## Security Considerations

### Sandboxing

Chromium runs with reduced privileges inside Docker:
- Non-root user (`appuser`)
- No direct host access
- Network isolation via Docker

### URL Safety

**SCAR will navigate to any URL provided** - ensure:
- You trust the repositories SCAR has access to
- Webhook secret is properly configured
- User whitelist is enabled if needed (`GITHUB_ALLOWED_USERS`)

## Related Documentation

- [Playwright MCP Documentation](https://github.com/playwright/mcp)
- [SCAR MCP Configuration](../CLAUDE.md#mcp-server-configuration)
- [GitHub Adapter Implementation](../src/adapters/github.ts)
- [Claude Client MCP Setup](../src/clients/claude.ts)

---

**Status**: ✅ **Fully Implemented and Ready for Use**

Last updated: 2025-12-29
