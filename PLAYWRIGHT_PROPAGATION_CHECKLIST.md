# Playwright Testing Infrastructure - Propagation Checklist

This document tracks the application of Playwright E2E testing infrastructure across all gpt153 projects.

## ✅ Completed Projects

### openhorizon.cc
- **Status**: ✅ Complete & Verified Aligned (Issue #56)
- **Issue**: #13 (original), #56 (verification & alignment)
- **Date**: January 2025 (issue-41 worktree), January 11, 2025 (verification)
- **Location**: `app/` directory (monorepo)
- **Notes**:
  - Original working implementation that inspired the template
  - Verified aligned with SCAR template (Issue #56)
  - Uses port 3000 (Next.js)
  - Monorepo structure (landing/ + app/ workspaces)
  - Tests in `app/tests/` (prod verification) and `app/e2e/` (local dev)
  - Applied template improvements: test:docker scripts, .gitignore updates, workflow fixes
  - All files verified working and properly structured for monorepo

### consilio
- **Status**: ✅ Complete (Applied via script)
- **Issue**: #67 (referenced, setup applied)
- **Date**: January 11, 2025
- **Location**: `frontend/` directory (monorepo)
- **Notes**:
  - Monorepo structure (frontend/backend separation)
  - Uses port 5173 (Vite)
  - Scripts renamed to avoid conflict with existing vitest (test:e2e:*)
  - Applied in issue-87 worktree
  - Ready for E2E test implementation

## 📋 Projects to Evaluate

The following projects should be evaluated to determine if E2E testing is needed:

### project-manager
- **Priority**: Medium
- **Type**: Project management tool
- **Evaluation Needed**: 
  - Does it have a frontend UI?
  - Are there critical user flows to test?
  - Backend-only vs full-stack?
- **Action**: Assess whether E2E tests would provide value

### health-agent  
- **Priority**: Low
- **Type**: Health monitoring agent
- **Evaluation Needed**:
  - Likely backend-only (no UI to test)
  - May not need E2E tests
  - Could need integration tests instead
- **Action**: Confirm if it has a frontend component

### quiculum-monitor
- **Priority**: Low
- **Type**: Monitoring tool
- **Evaluation Needed**:
  - Is there a dashboard/UI?
  - Critical monitoring flows?
- **Action**: Assess E2E testing needs

### project-orchestrator
- **Priority**: Medium
- **Type**: Project orchestration system
- **Evaluation Needed**:
  - Web UI presence?
  - User-facing features?
- **Action**: Determine if E2E tests are applicable

## 🔍 Discovery Process

To find all projects that might need Playwright:

```bash
# List all worktrees
ls /worktrees/

# Find projects with frontend code
find /worktrees -name "package.json" -path "*/frontend/*" | head -20

# Find projects with existing test directories
find /worktrees -type d -name "tests" -o -name "e2e" | grep -v node_modules | head -20

# Find projects mentioning Playwright (might already have partial setup)
grep -r "playwright" /worktrees/*/package.json 2>/dev/null

# Find Next.js projects (likely need E2E tests)
grep -r '"next"' /worktrees/*/package.json 2>/dev/null

# Find React projects (candidates for E2E tests)
grep -r '"react"' /worktrees/*/package.json 2>/dev/null
```

## 📊 Propagation Strategy

### Phase 1: High Priority (Completed)
- [x] openhorizon.cc (original implementation)
- [x] consilio (script validation)

### Phase 2: Medium Priority
1. Evaluate project-manager
2. Evaluate project-orchestrator
3. Apply Playwright setup to projects with confirmed frontend

### Phase 3: Low Priority
1. Evaluate health-agent
2. Evaluate quiculum-monitor
3. Apply if frontend components exist

### Phase 4: Future Projects
- New projects should use Playwright template from the start
- Supervisor should automatically apply template when creating E2E tests
- Template location: `.template/playwright-setup/`

## 🛠️ Application Process

For each project requiring Playwright:

1. **Assess Project Structure**
   ```bash
   ls -la /worktrees/<project>/
   # Monorepo? → Apply to frontend/
   # Simple? → Apply to root
   ```

2. **Check Existing Setup**
   ```bash
   grep "playwright" /worktrees/<project>/package.json
   ls /worktrees/<project>/Dockerfile.test
   ```

3. **Run Propagation Script**
   ```bash
   cd /worktrees/<project>  # or /worktrees/<project>/frontend
   /home/samuel/scar/scripts/setup-playwright-testing.sh .
   ```

4. **Customize Configuration**
   - Update `baseURL` in `playwright.config.ts`
   - Adjust port if not 3000
   - Rename scripts if conflicts with existing tests
   - Add services to `docker-compose.test.yml` if needed

5. **Install Dependencies**
   ```bash
   npm install
   ```

6. **Verify Setup**
   ```bash
   npm run test:e2e:docker
   ```

7. **Document Application**
   - Update this checklist
   - Note any customizations made
   - Record port, structure, special requirements

8. **Commit Changes**
   ```bash
   git add .
   git commit -m "Add Playwright E2E testing infrastructure
   
   - Applied from .template/playwright-setup/
   - Configured for <specific-details>
   - Closes #<issue-number>"
   ```

## 📝 Customization Notes

### Common Variations

**Port Numbers:**
- openhorizon.cc: 3000 (Next.js)
- consilio: 5173 (Vite)
- Other: Check `vite.config.ts`, `next.config.js`, or `package.json` dev script

**Script Naming:**
- Standard: `test`, `test:ui`, `test:docker`
- With conflicts: `test:e2e`, `test:e2e:ui`, `test:e2e:docker`

**Project Structure:**
- Monorepo: Apply to `frontend/` directory
- Simple: Apply to root directory
- Workspace: Apply to appropriate workspace

**Additional Services:**
- Database: Add to `docker-compose.test.yml`
- Backend: Add `depends_on` in `docker-compose.test.yml`
- Redis/Queue: Add service definitions as needed

## 🚨 Known Issues & Solutions

### Issue: jq Not Available
**Symptom**: Script warns "jq not found" and doesn't merge package.json
**Solution**: Manually add scripts from `package.json.snippet`

### Issue: Port Conflicts
**Symptom**: Tests timeout or fail to connect
**Solution**: Update `baseURL` in `playwright.config.ts` to match actual port

### Issue: Existing Test Scripts
**Symptom**: Script would overwrite existing `test` script
**Solution**: Use namespaced scripts (test:e2e:*) instead

### Issue: Monorepo Structure
**Symptom**: package.json not found in root
**Solution**: Apply script to `frontend/` or appropriate subdirectory

## 📚 Reference Documentation

- **Template**: `/home/samuel/scar/.template/playwright-setup/`
- **Script**: `/home/samuel/scar/scripts/setup-playwright-testing.sh`
- **Full Guide**: `/home/samuel/scar/docs/playwright-integration.md`
- **CLAUDE.md**: Updated with E2E testing section
- **Original Issue**: SCAR #27

## 📅 Timeline

- **Investigation Phase**: January 11, 2025 (30 min)
- **Template Creation**: January 11, 2025 (1.5 hours)
- **Script Development**: January 11, 2025 (1 hour)
- **Validation (consilio)**: January 11, 2025 (30 min)
- **Documentation**: January 11, 2025 (30 min)
- **Total Effort**: ~4 hours

**Estimated per-project application**: 15-30 minutes each

## ✅ Success Criteria

For a project to be considered "complete" on this checklist:

- [ ] Playwright template applied (all files present)
- [ ] package.json updated with scripts and dependency
- [ ] .gitignore updated
- [ ] playwright.config.ts customized (baseURL)
- [ ] Dependencies installed (`node_modules/@playwright/test`)
- [ ] Tests run successfully (`npm run test:e2e:docker`)
- [ ] Documentation updated (project-specific notes added here)
- [ ] Changes committed to project repository

## 🎯 Long-term Maintenance

### Template Updates
When updating `.template/playwright-setup/`:
1. Update template files in SCAR repo
2. Test on one project
3. Re-run script on all projects (or selectively)
4. Document changes in template README

### Version Bumps
When Playwright releases new versions:
1. Update `package.json.snippet` (version number)
2. Update GitHub Actions workflow (image version)
3. Re-propagate to all projects
4. Test systematically

### New Projects
For new projects from the start:
```bash
# During initial project setup
/home/samuel/scar/scripts/setup-playwright-testing.sh .
```

Supervisor should be aware of this template and suggest it when creating projects with frontends.

---

**Last Updated**: January 11, 2025  
**Maintained By**: SCAR Bot  
**Related Issue**: #27
