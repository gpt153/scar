# GitHub Staging Plan: Docker Container Management

## Overview
This document outlines the GitHub-based implementation strategy for Docker container management in SCAR. It breaks down the work into staged pull requests suitable for isolated development and review.

**Base Plan**: See `.agents/plans/docker-container-management.plan.md` for complete technical specifications.

## Implementation Strategy

### Staged Pull Requests

This feature will be implemented across **5 pull requests** to maintain code quality, enable parallel review, and minimize risk.

---

## PR #1: Docker Infrastructure Foundation
**Branch**: `feature/docker-infrastructure`
**Estimated Time**: 3-4 hours
**Dependencies**: None
**Risk Level**: Low (no user-facing changes)

### Scope
- Add Docker CLI to SCAR container
- Mount Docker socket in docker-compose.yml
- Install dockerode npm package
- Add basic Docker client wrapper
- Integration tests for Docker access

### Files Modified
```
Dockerfile
docker-compose.yml
package.json
package-lock.json
src/clients/docker.ts (new)
src/clients/docker.test.ts (new)
```

### Testing Strategy
```bash
# Verify Docker access from inside SCAR
docker exec scar-app-with-db-1 docker ps
docker exec scar-app-with-db-1 docker version

# Run integration tests
npm test src/clients/docker.test.ts
```

### Success Criteria
- ✅ SCAR container builds successfully
- ✅ Docker CLI available inside container
- ✅ Can list host containers via Docker socket
- ✅ dockerode API wrapper functional
- ✅ All tests passing

### Rollback Plan
If Docker socket causes issues:
1. Remove socket mount from docker-compose.yml
2. Revert Dockerfile changes
3. Restart SCAR container

---

## PR #2: Database Schema & Configuration System
**Branch**: `feature/docker-config-schema`
**Estimated Time**: 2-3 hours
**Dependencies**: PR #1 (merged)
**Risk Level**: Low (database-only changes)

### Scope
- Add `docker_config` column to codebases table
- Create database migration
- Update TypeScript interfaces
- Add configuration utilities
- Database tests

### Files Modified
```
migrations/XXX_add_docker_config_to_codebases.sql (new)
src/types/index.ts
src/db/codebases.ts
src/utils/docker-config.ts (new)
src/utils/docker-config.test.ts (new)
```

### Database Migration
```sql
-- Add docker_config JSONB column
ALTER TABLE codebases
ADD COLUMN docker_config JSONB DEFAULT NULL;

-- Index for performance
CREATE INDEX idx_codebases_docker_config
ON codebases USING GIN (docker_config);
```

### Testing Strategy
```bash
# Test migration
npm run db:migrate

# Verify schema
psql -U postgres -d remote_coding_agent -c "\d codebases"

# Run tests
npm test src/utils/docker-config.test.ts
```

### Success Criteria
- ✅ Migration runs successfully
- ✅ Codebase interface updated
- ✅ Configuration helpers working
- ✅ All tests passing
- ✅ No data loss

### Rollback Plan
```sql
ALTER TABLE codebases DROP COLUMN docker_config;
```

---

## PR #3: Docker Status & Logs Commands
**Branch**: `feature/docker-status-logs`
**Estimated Time**: 3-4 hours
**Dependencies**: PR #1, PR #2 (merged)
**Risk Level**: Low (read-only operations)

### Scope
- Implement `/docker-config` command
- Implement `/docker-status` command
- Implement `/docker-logs` command
- Command handler integration
- End-to-end tests

### Files Modified
```
src/handlers/command-handler.ts
src/clients/docker.ts (enhance)
src/handlers/docker-commands.test.ts (new)
docs/docker-management.md (new)
```

### Commands Added
```typescript
/docker-config set <production-path> <compose-project>
/docker-config show
/docker-status
/docker-logs [container] [lines]
```

### Testing Strategy
```bash
# Manual testing via Telegram
/docker-config set /home/samuel/po po
/docker-status
/docker-logs backend 50

# Automated tests
npm test src/handlers/docker-commands.test.ts
```

### Success Criteria
- ✅ `/docker-config` sets configuration correctly
- ✅ `/docker-status` shows accurate container state
- ✅ `/docker-logs` retrieves logs successfully
- ✅ Commands handle errors gracefully
- ✅ All tests passing
- ✅ Documentation complete

### Rollback Plan
Simply remove commands from switch case in command-handler.ts

---

## PR #4: Docker Restart & Safety Mechanisms
**Branch**: `feature/docker-restart`
**Estimated Time**: 3-4 hours
**Dependencies**: PR #3 (merged)
**Risk Level**: Medium (can affect running containers)

### Scope
- Implement confirmation system
- Implement `/docker-restart` command
- Add health check validation
- Retry logic for transient failures
- Comprehensive testing

### Files Modified
```
src/utils/confirmation.ts (new)
src/utils/confirmation.test.ts (new)
src/handlers/command-handler.ts (enhance)
src/clients/docker.ts (enhance)
```

### Safety Features
- Confirmation required before restart
- Shows containers to be restarted
- Estimates downtime
- Health check after restart
- Rollback guidance on failure

### Testing Strategy
```bash
# Test confirmation flow
/docker-restart
# (shows confirmation prompt)
/docker-restart yes
# (executes restart)

# Test health validation
# Verify all containers return to healthy state

# Automated tests
npm test src/utils/confirmation.test.ts
```

### Success Criteria
- ✅ Confirmation system working
- ✅ Restart executes safely
- ✅ Health checks validate success
- ✅ Error messages actionable
- ✅ All tests passing

### Rollback Plan
Remove restart command, keep confirmation system for future use

---

## PR #5: Docker Deploy & Production Integration
**Branch**: `feature/docker-deploy`
**Estimated Time**: 4-5 hours
**Dependencies**: PR #4 (merged)
**Risk Level**: High (production deployments)

### Scope
- Implement file sync utilities
- Implement `/docker-deploy` command
- Add smart suggestions after code changes
- Deployment workflow integration
- Full end-to-end testing

### Files Modified
```
src/utils/deploy.ts (new)
src/utils/deploy.test.ts (new)
src/handlers/command-handler.ts (enhance)
src/orchestrator/orchestrator.ts (enhance)
docs/docker-management.md (enhance)
```

### Deployment Flow
1. Detect changes (workspace vs production)
2. Show confirmation with file list
3. Sync files (rsync)
4. Rebuild Docker images
5. Restart containers
6. Health validation
7. Success/failure report

### Testing Strategy
```bash
# End-to-end deployment test
# 1. Make code change in workspace
echo "console.log('test')" >> /workspace/project-orchestrator/src/test.js

# 2. Deploy
/docker-deploy
# (shows changes)
/docker-deploy yes
# (executes deployment)

# 3. Verify
/docker-status
/docker-logs 20

# Automated tests
npm test src/utils/deploy.test.ts
```

### Success Criteria
- ✅ Change detection accurate
- ✅ File sync works correctly
- ✅ Images rebuild successfully
- ✅ Containers restart with new code
- ✅ Health validation passes
- ✅ Smart suggestions appear after changes
- ✅ All tests passing
- ✅ Documentation complete

### Rollback Plan
Emergency rollback procedure:
```bash
# Manual rollback if deployment fails
cd /home/samuel/po
git reset --hard HEAD~1
docker compose up -d --build
```

---

## Testing Matrix

### Per-PR Testing

| PR | Unit Tests | Integration Tests | Manual Tests | E2E Tests |
|----|-----------|-------------------|--------------|-----------|
| #1 | ✅ Docker client | ✅ Socket access | ✅ docker ps | ❌ |
| #2 | ✅ Config utils | ✅ DB migration | ✅ Schema check | ❌ |
| #3 | ✅ Commands | ✅ Command handler | ✅ Telegram | ✅ Status/logs |
| #4 | ✅ Confirmation | ✅ Restart logic | ✅ Telegram | ✅ Restart flow |
| #5 | ✅ Deploy utils | ✅ File sync | ✅ Telegram | ✅ Full deploy |

### Cross-PR Integration Testing

After all PRs merged:
1. Full workflow test (code change → deploy → validate)
2. Multi-project test (switch between PO and health-agent)
3. Error scenario testing (network failures, Docker down, etc.)
4. Performance testing (large deployments, many containers)
5. Security testing (unauthorized access attempts)

---

## Risk Mitigation

### High-Risk Operations (PR #5)

**Risk**: Deployment failure leaves production in bad state

**Mitigation**:
1. Always test in staging first (if available)
2. Backup production before deployment
3. Health checks validate success
4. Clear rollback instructions in error messages
5. Manual intervention option

**Emergency Response**:
```bash
# If SCAR deployment fails catastrophically
ssh production-server
cd /home/samuel/po
docker compose down
git reset --hard <last-known-good-commit>
docker compose up -d
```

### Medium-Risk Operations (PR #4)

**Risk**: Container restart causes unexpected downtime

**Mitigation**:
1. Show estimated downtime before restart
2. Require explicit confirmation
3. Restart entire compose project (not individual containers)
4. Health checks after restart
5. User notification of success/failure

### Low-Risk Operations (PRs #1-3)

**Risk**: Minimal (read-only operations, infrastructure setup)

**Mitigation**:
1. Comprehensive testing before merge
2. Staged rollout (Dockerfile → schema → commands)
3. No user-facing changes until PR #3

---

## Merge Strategy

### Sequential Merging (Recommended)

```
main
 ├─ PR #1 (Docker Infrastructure)
 │   └─ merge → main
 │       ├─ PR #2 (Database Schema)
 │       │   └─ merge → main
 │       │       ├─ PR #3 (Status/Logs)
 │       │       │   └─ merge → main
 │       │       │       ├─ PR #4 (Restart)
 │       │       │       │   └─ merge → main
 │       │       │       │       └─ PR #5 (Deploy)
 │       │       │       │           └─ merge → main
```

**Timeline**: 2-3 days total if sequential

**Benefits**:
- ✅ Lower risk (incremental changes)
- ✅ Easy rollback (revert individual PR)
- ✅ Better code review (smaller chunks)

### Parallel Development (Aggressive)

```
main
 ├─ PR #1 (infrastructure) ──┐
 ├─ PR #2 (schema) ──────────┤
 ├─ PR #3 (status/logs) ─────┼─> merge all together
 ├─ PR #4 (restart) ─────────┤
 └─ PR #5 (deploy) ──────────┘
```

**Timeline**: 1 day if parallel

**Benefits**:
- ✅ Faster delivery
- ✅ All features at once

**Risks**:
- ❌ Merge conflicts
- ❌ Integration issues
- ❌ Harder to rollback

**Recommendation**: Use sequential for safety, parallel only if time-critical

---

## Deployment Checklist

### Pre-Deployment (Before PR #1)

- [ ] Backup production database
- [ ] Document current production state
- [ ] Verify Docker version on host (20.10+)
- [ ] Test Docker socket accessibility
- [ ] Review security implications

### Per-PR Deployment

**PR #1**: Infrastructure
- [ ] Rebuild SCAR container
- [ ] Verify Docker access
- [ ] Run integration tests
- [ ] No user-facing changes yet

**PR #2**: Database
- [ ] Run migration on staging DB first
- [ ] Verify no data loss
- [ ] Update TypeScript types
- [ ] No user-facing changes yet

**PR #3**: Status/Logs
- [ ] Test commands in Telegram
- [ ] Verify with multiple projects
- [ ] Update help text
- [ ] Document commands

**PR #4**: Restart
- [ ] Test confirmation flow
- [ ] Verify safe restart
- [ ] Test health checks
- [ ] Update documentation

**PR #5**: Deploy
- [ ] Test deployment on non-critical project first
- [ ] Verify file sync accuracy
- [ ] Test rollback procedure
- [ ] Full end-to-end validation

### Post-Deployment (After PR #5)

- [ ] Monitor production for 24 hours
- [ ] Gather user feedback
- [ ] Performance metrics
- [ ] Document any issues
- [ ] Plan follow-up improvements

---

## Code Review Guidelines

### PR #1: Infrastructure Review

**Focus Areas**:
- Docker socket security
- Non-root user permissions
- Error handling in Docker client
- Test coverage

**Key Questions**:
- Can Docker socket be accessed by appuser?
- Are errors handled gracefully?
- Do tests cover all API methods?

### PR #2: Database Review

**Focus Areas**:
- Migration reversibility
- Index efficiency
- Type safety
- Data validation

**Key Questions**:
- Can migration be rolled back safely?
- Is docker_config validated before save?
- Are TypeScript types accurate?

### PR #3: Commands Review

**Focus Areas**:
- User experience
- Error messages
- Command consistency
- Documentation

**Key Questions**:
- Are error messages helpful?
- Is command syntax intuitive?
- Does help text cover all cases?

### PR #4: Restart Review

**Focus Areas**:
- Safety mechanisms
- Confirmation UX
- Health validation
- Rollback guidance

**Key Questions**:
- Can user accidentally restart production?
- Are health checks comprehensive?
- What happens if restart fails?

### PR #5: Deploy Review

**Focus Areas**:
- File sync correctness
- Image build process
- Rollback procedure
- Production safety

**Key Questions**:
- Are all files synced correctly?
- What happens on build failure?
- Can deployment be rolled back?
- Is production protected?

---

## Success Metrics

### Per-PR Metrics

| PR | Code Coverage | Review Time | Bug Count | User Feedback |
|----|--------------|-------------|-----------|---------------|
| #1 | >80% | 1-2 hours | 0 (infra only) | N/A |
| #2 | >90% | 1 hour | 0 (DB only) | N/A |
| #3 | >85% | 2-3 hours | 0-1 | Positive |
| #4 | >85% | 2-3 hours | 0-1 | Positive |
| #5 | >80% | 3-4 hours | 0-2 | Critical |

### Overall Feature Metrics

**Functional**:
- ✅ 100% of commands working
- ✅ Zero data loss during migrations
- ✅ <1% deployment failure rate

**Performance**:
- ✅ Status check <2 seconds
- ✅ Log retrieval <3 seconds
- ✅ Deployment <2 minutes

**Quality**:
- ✅ >85% code coverage
- ✅ All tests passing
- ✅ Zero critical bugs

**User Satisfaction**:
- ✅ Positive feedback on UX
- ✅ Intuitive command interface
- ✅ Clear error messages

---

## Timeline Estimation

### Sequential Implementation

| Week | PRs | Activities |
|------|-----|------------|
| Week 1, Day 1-2 | PR #1, #2 | Infrastructure + Database |
| Week 1, Day 3-4 | PR #3 | Status/Logs commands |
| Week 1, Day 5 | PR #4 | Restart command |
| Week 2, Day 1-2 | PR #5 | Deploy command |
| Week 2, Day 3 | Testing | Full integration testing |
| Week 2, Day 4-5 | Polish | Bug fixes, documentation |

**Total**: 10 working days (2 weeks)

### Parallel Implementation (Aggressive)

| Day | PRs | Activities |
|-----|-----|------------|
| Day 1 | All | Kick off all PRs |
| Day 2 | All | Development continues |
| Day 3 | All | Code review + fixes |
| Day 4 | Integration | Merge + test |
| Day 5 | Polish | Bug fixes, docs |

**Total**: 5 working days (1 week)

**Recommendation**: Sequential for safety and quality

---

## Future Enhancements (Post-MVP)

### Phase 2 Features (Next Quarter)

1. **Rollback Command**
   - `/docker-rollback` - Revert to previous deployment
   - Image tagging and versioning
   - Deployment history tracking

2. **Multi-Environment Support**
   - `/docker-deploy staging`
   - `/docker-deploy production`
   - Environment-specific configurations

3. **Container Registry Integration**
   - `/docker-build-push` - Build and push to GHCR
   - Pull from registry for deployment
   - Version tagging automation

4. **Auto-Deployment**
   - `/docker-auto-deploy on`
   - Deploy on commit (with test gates)
   - Slack/Telegram notifications

### Phase 3 Features (Future)

1. **Blue-Green Deployments**
   - Zero-downtime deployments
   - Automatic traffic switching
   - Health-based rollback

2. **Kubernetes Support**
   - Manage K8s deployments
   - Pod scaling
   - Service mesh integration

3. **Monitoring & Alerting**
   - Real-time metrics
   - Alert on failures
   - Performance dashboards

---

## Conclusion

This staging plan breaks down the Docker container management feature into **5 manageable pull requests** that can be developed, reviewed, and deployed safely.

**Key Principles**:
- ✅ Incremental delivery (PR by PR)
- ✅ Low-risk rollback (revert individual PR)
- ✅ Comprehensive testing (unit + integration + E2E)
- ✅ Production safety (confirmations, health checks)
- ✅ Clear documentation (per-PR docs)

**Next Steps**:
1. Review this staging plan
2. Create GitHub issues for each PR
3. Begin PR #1 (Docker infrastructure)
4. Sequential merging to main
5. Monitor and iterate

**Timeline**: 2 weeks (sequential) or 1 week (parallel)

**Effort**: 14-22 hours total development time

**Risk**: Low to Medium (mitigated by staging)

---

**Related Documents**:
- [Full Technical Plan](.agents/plans/docker-container-management.plan.md)
- [Implementation Summary](IMPLEMENTATION_PLAN_SUMMARY.md)
