# Workspace Unification & System Cleanup Plan (Revised)

**Goal**: Unify workspace as single source of truth and remove all unnecessary backups/duplicates.

**Strategy**: Workspace-first architecture with project-specific patterns:
- **PO**: No production subfolder (state in Docker volumes)
- **Health-Agent**: Production subfolder for persistent data/logs
- **OpenHorizon**: Hybrid workflow (local dev, Cloud Run staging/prod)

**Estimated Time**: 45-60 minutes
**Risk Level**: Medium (requires production container restarts)
**Disk Space Recovery**: ~16GB

---

## Phase 1: Pre-Flight Checks ✅

**Verify nothing is lost before deletion**

```bash
# 1. Verify all active projects are in workspace
ls -la /home/samuel/.archon/workspaces/

# Expected:
# - scar
# - project-orchestrator
# - health-agent
# - openhorizon.cc
# + other active projects

# 2. Check production containers are stopped before cleanup
docker ps -a | grep -E "po-|odin-health"

# 3. Verify workspace git status (nothing uncommitted we care about)
cd /home/samuel/.archon/workspaces/project-orchestrator
git status
git log -1

cd /home/samuel/.archon/workspaces/health-agent
git status
git log -1

cd /home/samuel/.archon/workspaces/openhorizon.cc
git status
git log -1

# 4. Check what's in production that might not be in workspace
cd /home/samuel/po
git log -1
git diff /home/samuel/.archon/workspaces/project-orchestrator

# If production has commits not in workspace, push them first!

# 5. Verify backups are actually old (safe to delete)
ls -lh /home/samuel/workspace-old-20251218/
ls -lh /home/samuel/po.backup.20251220_145744/
stat /home/samuel/workspace-old-backup.tar.gz
```

**STOP HERE**: If any production directory has code NOT in workspace, sync it first!

---

## Phase 2: Backup Critical Data 🔒

**Create final safety backup before destructive changes**

```bash
# 1. Backup production .env files (not in git)
mkdir -p /home/samuel/cleanup-backup/env-files
cp /home/samuel/po/.env /home/samuel/cleanup-backup/env-files/po.env 2>/dev/null || true
cp /home/samuel/odin-health/.env /home/samuel/cleanup-backup/env-files/odin-health.env 2>/dev/null || true

# 2. Backup any production data directories
cp -r /home/samuel/odin-health/data /home/samuel/cleanup-backup/odin-health-data 2>/dev/null || true
cp -r /home/samuel/odin-health/logs /home/samuel/cleanup-backup/odin-health-logs 2>/dev/null || true

# 3. List what we're about to delete (final review)
du -sh /home/samuel/workspace-old-20251218
du -sh /home/samuel/po.backup.20251220_145744
du -sh /home/samuel/workspace-old-backup.tar.gz
du -sh /home/samuel/.archon/workspaces/health-agent.backup-20251218-191313
du -sh /home/samuel/po
du -sh /home/samuel/odin-health

# 4. Create inventory file
ls -laR /home/samuel/workspace-old-20251218 > /home/samuel/cleanup-backup/workspace-old-inventory.txt
ls -laR /home/samuel/po > /home/samuel/cleanup-backup/po-inventory.txt
```

---

## Phase 3: Stop Production Services 🛑

```bash
# 1. Stop project-orchestrator containers
cd /home/samuel/po
docker compose down

# 2. Stop health-agent bot
kill $(cat /tmp/health-agent-bot.pid) 2>/dev/null || true
rm /tmp/health-agent-bot.pid 2>/dev/null || true

# 3. Verify stopped
docker ps -a | grep -E "po-|odin-health"
ps aux | grep health-agent | grep -v grep
```

---

## Phase 4: Delete Old Backups 🗑️

**Remove ~16GB of unnecessary backups**

```bash
# 1. Delete old workspace backup directory (11GB)
rm -rf /home/samuel/workspace-old-20251218

# 2. Delete old workspace backup tarball (4.9GB)
rm /home/samuel/workspace-old-backup.tar.gz

# 3. Delete old PO backup (3.2MB)
rm -rf /home/samuel/po.backup.20251220_145744

# 4. Delete workspace health-agent backup (1.7MB)
rm -rf /home/samuel/.archon/workspaces/health-agent.backup-20251218-191313

# 5. Verify deletion
ls -lh /home/samuel/ | grep -E "workspace|backup"
ls -lh /home/samuel/.archon/workspaces/ | grep backup

# 6. Check disk space recovered
df -h /home/samuel
```

---

## Phase 5: Migrate Production to Workspace Structure 🔄

### 5.1 Project-Orchestrator (PO)

**Pattern**: No production subfolder - all state in Docker volumes

```bash
# 1. Ensure workspace is up to date
cd /home/samuel/.archon/workspaces/project-orchestrator
git fetch origin
git status

# 2. Copy production .env if different from workspace
diff /home/samuel/po/.env /home/samuel/.archon/workspaces/project-orchestrator/.env
# If different, decide which to keep or merge them
cp /home/samuel/po/.env /home/samuel/.archon/workspaces/project-orchestrator/.env.production

# 3. Copy production docker-compose.yml if customized
diff /home/samuel/po/docker-compose.yml /home/samuel/.archon/workspaces/project-orchestrator/docker-compose.yml
# If production version has important changes, merge them

# 4. Update PO's CI/CD workflow to deploy from workspace
nano .github/workflows/cd.yml

# Change DEPLOY_DIR from:
#   DEPLOY_DIR: /home/samuel/po
# To:
#   DEPLOY_DIR: /home/samuel/.archon/workspaces/project-orchestrator

# 5. Commit the workflow change
git add .github/workflows/cd.yml .env.production
git commit -m "ci: Update deployment to use workspace as source of truth"
git push

# 6. Delete old production directory
rm -rf /home/samuel/po

# 7. Test deployment from workspace
cd /home/samuel/.archon/workspaces/project-orchestrator
docker compose down
docker compose up -d --build

# 8. Verify PO is running
curl http://localhost:8001/health
docker compose ps
docker compose logs --tail 50
```

**Why no production/ subfolder?**
- All state (database, Redis) is in Docker volumes
- No file-based persistent data outside containers
- Workspace IS the deployment location

---

### 5.2 Health-Agent (Odin-Health)

**Pattern**: Production subfolder for persistent data/logs

```bash
# 1. Create production subdirectory structure
mkdir -p /home/samuel/.archon/workspaces/health-agent/production

# 2. Move production data/logs into workspace
mv /home/samuel/odin-health/data /home/samuel/.archon/workspaces/health-agent/production/data
mv /home/samuel/odin-health/logs /home/samuel/.archon/workspaces/health-agent/production/logs

# 3. Copy production .env to workspace
cp /home/samuel/odin-health/.env /home/samuel/.archon/workspaces/health-agent/.env.production

# 4. Update docker-compose.yml volume mounts
cd /home/samuel/.archon/workspaces/health-agent
nano docker-compose.yml

# Change volume paths from:
#   - ./data:/app/data
# To:
#   - ./production/data:/app/data
#   - ./production/logs:/app/logs

# 5. Update health-agent CI/CD workflow
nano .github/workflows/docker-build-deploy.yml

# Update deployment paths to reference workspace:
# OLD: /home/samuel/odin-health
# NEW: /home/samuel/.archon/workspaces/health-agent

# Update docker compose commands to use production/ paths

# 6. Test locally before committing
docker compose down
docker compose up -d
docker compose logs -f health-agent-bot

# 7. Commit changes
git add docker-compose.yml .github/workflows/docker-build-deploy.yml .env.production
git commit -m "ci: Migrate production to workspace structure with production/ subfolder"
git push

# 8. Delete old production directory
rm -rf /home/samuel/odin-health

# 9. Verify bot is running
ps aux | grep python | grep health-agent
tail -f production/logs/bot.log
```

**Why production/ subfolder?**
- File-based persistent data (user food logs, conversation history)
- Data must survive code updates
- Clean separation: code vs runtime data

---

### 5.3 OpenHorizon (Hybrid Development Workflow)

**Pattern**: Local development, Cloud Run for staging/production

```bash
# 1. Ensure workspace is current
cd /home/samuel/.archon/workspaces/openhorizon.cc
git fetch origin
git status

# 2. Create local development setup
cat > .env.local << 'EOF'
# Local development environment
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/openhorizon_dev
NEXT_PUBLIC_API_URL=http://localhost:3000

# Add other local-specific vars here
EOF

# 3. Install dependencies
npm install

# 4. Create development workflow documentation
cat > DEVELOPMENT_WORKFLOW.md << 'EOF'
# OpenHorizon Development Workflow

## Hybrid Development Strategy

### Daily Development (Local)

```bash
# Run landing page locally
npm run dev:landing
# Access at: http://localhost:3001

# Run application locally
npm run dev:app
# Access at: http://localhost:3000

# Run both simultaneously
npm run dev:landing & npm run dev:app
```

**Use local development for:**
- Feature development
- Bug fixes
- Database schema changes
- Rapid iteration (hot reload)

### Staging Testing (Cloud Run)

```bash
# Deploy app to Cloud Run for testing
gcloud builds submit --config cloudbuild-app.yaml --project openhorizon-cc

# Deploy landing if changed
gcloud builds submit --config cloudbuild-landing.yaml --project openhorizon-cc

# Test on real infrastructure
curl https://openhorizon-app-704897644650.europe-west1.run.app
```

**Use Cloud Run staging for:**
- Integration testing
- Client demos
- Production-like environment validation
- Performance testing under load

### Production Release

```bash
# Deploy both to production
gcloud builds submit --config cloudbuild-landing.yaml --project openhorizon-cc
gcloud builds submit --config cloudbuild-app.yaml --project openhorizon-cc

# Verify deployment
gcloud run services list --project openhorizon-cc --region europe-west1
```

**Deploy to production for:**
- Release to users
- Stable feature launches
- After successful staging validation

## Quick Reference

| Task | Command | Environment |
|------|---------|-------------|
| Local dev | `npm run dev:app` | localhost:3000 |
| Local landing | `npm run dev:landing` | localhost:3001 |
| Deploy app staging | `gcloud builds submit --config cloudbuild-app.yaml` | Cloud Run |
| Deploy landing | `gcloud builds submit --config cloudbuild-landing.yaml` | Cloud Run |
| View logs | `gcloud run logs read openhorizon-app` | Cloud Run |

## Environment Files

- `.env.local` - Local development (git-ignored)
- `.env.production` - Cloud Run production (in repo)
- `.env.example` - Template for new developers

EOF

git add DEVELOPMENT_WORKFLOW.md .env.local
git commit -m "docs: Add hybrid development workflow for OpenHorizon"
git push

# 5. Test local development
npm run dev:app
# Open browser: http://localhost:3000

# 6. Verify Cloud Run is still accessible
curl https://openhorizon-704897644650.europe-west1.run.app
```

**Why hybrid workflow?**
- 🚀 Fast local development (hot reload)
- 💰 Lower costs (only pay for staging/prod deployments)
- 🔒 Production validation before release
- 🎯 Landing page always live on Cloud Run
- 🛠️ App development happens locally

**No production/ subfolder needed**:
- Next.js applications are stateless
- All state in external database (Supabase/Neon)
- Build artifacts deployed to Cloud Run, not stored locally

---

## Phase 6: Update SCAR Configuration 📝

### 6.1 Update docker-compose.yml

```bash
cd /home/samuel/scar
nano docker-compose.yml
```

**Remove these lines** (no longer needed):
```yaml
# OLD - DELETE THESE
- /home/samuel/po:/home/samuel/po
- /home/samuel/odin-health:/home/samuel/odin-health
```

**Keep these** (still needed for workspace access):
```yaml
# KEEP - Still maps workspace correctly
- /home/samuel/.archon/workspaces:/workspace
- /home/samuel/.archon/worktrees:/worktrees
- /home/samuel/scar:/home/samuel/scar
```

### 6.2 Update CLAUDE.md Documentation

```bash
cd /home/samuel/scar
nano CLAUDE.md
```

**Line 11 - Change:**
```markdown
# OLD
- Workspace: `/home/samuel/workspace/health-agent`

# NEW
- Workspace: `/home/samuel/.archon/workspaces/health-agent`
```

**Add new section** (after Important Terminology):
```markdown
## Workspace Architecture Patterns

Different projects use different workspace patterns based on their state management needs:

### Pattern 1: Docker Volume State (Project-Orchestrator)

**Structure:**
```
/home/samuel/.archon/workspaces/project-orchestrator/
├── src/                    # Application code
├── docker-compose.yml      # Container orchestration
├── .env                    # Configuration
└── .github/workflows/      # CI/CD
```

**State management**: All persistent data in Docker volumes (postgres_data, redis_data)
**No production/ subfolder needed** - workspace IS the deployment location
**Use case**: Web applications with database-backed state

### Pattern 2: File-Based State (Health-Agent)

**Structure:**
```
/home/samuel/.archon/workspaces/health-agent/
├── src/                    # Application code
├── production/             # Runtime data (separate from code)
│   ├── data/              # User data, food logs, conversation history
│   └── logs/              # Application logs
├── .venv/                 # Development dependencies
└── .github/workflows/      # CI/CD
```

**State management**: Persistent files in production/ subfolder
**Production subfolder required** - data survives code updates
**Use case**: Bots, agents with file-based persistence

### Pattern 3: Hybrid Development (OpenHorizon)

**Structure:**
```
/home/samuel/.archon/workspaces/openhorizon.cc/
├── landing/               # Landing page (Next.js)
├── app/                   # Full application (Next.js)
├── .env.local            # Local development config
└── .env.production       # Cloud Run production config
```

**Development**: Local (`npm run dev`)
**Staging/Production**: Cloud Run (`gcloud builds submit`)
**No production/ subfolder** - stateless Next.js apps
**Use case**: Modern web apps with external database, serverless deployment

### Inside SCAR Container

**Accessible paths:**
- ✅ `/workspace/<project>/` - All workspaces
- ✅ `/worktrees/<project>/` - Git worktrees
- ❌ `/home/samuel/po/` - REMOVED (now in workspace)
- ❌ `/home/samuel/odin-health/` - REMOVED (now in workspace)

**When working on projects:**
- **PO**: `/workspace/project-orchestrator/`
- **Health-Agent**: `/workspace/health-agent/` (code) and `/workspace/health-agent/production/` (data)
- **OpenHorizon**: `/workspace/openhorizon.cc/`
```

### 6.3 Restart SCAR with Updated Config

```bash
cd /home/samuel/scar
docker compose --profile with-db down
docker compose --profile with-db up -d

# Verify SCAR started
docker ps | grep scar
docker logs scar-app-with-db-1 --tail 30

# Test health endpoint
curl http://localhost:3001/health

# Verify workspace access
docker exec scar-app-with-db-1 ls -la /workspace/
```

---

## Phase 7: Update Database References 🗄️

```bash
# 1. Check if database has hardcoded production paths
docker exec scar-postgres-1 psql -U postgres -d remote_coding_agent -c \
  "SELECT id, name, repo_path FROM remote_agent_codebases WHERE repo_path LIKE '%/po%' OR repo_path LIKE '%odin-health%';"

# 2. Update any hardcoded paths (if needed)
docker exec -it scar-postgres-1 psql -U postgres -d remote_coding_agent <<EOF
UPDATE remote_agent_codebases
SET repo_path = '/workspace/project-orchestrator'
WHERE name = 'project-orchestrator';

UPDATE remote_agent_codebases
SET repo_path = '/workspace/health-agent'
WHERE name = 'health-agent';

UPDATE remote_agent_codebases
SET repo_path = '/workspace/openhorizon.cc'
WHERE name = 'openhorizon.cc';
EOF

# 3. Verify updates
docker exec scar-postgres-1 psql -U postgres -d remote_coding_agent -c \
  "SELECT id, name, repo_path FROM remote_agent_codebases ORDER BY name;"
```

---

## Phase 8: Verify Everything Works ✅

### 8.1 Test SCAR

```bash
# 1. Test SCAR can access workspaces
docker exec scar-app-with-db-1 ls -la /workspace/

# 2. Test SCAR can access worktrees
docker exec scar-app-with-db-1 ls -la /worktrees/

# 3. Verify SCAR does NOT have old production paths
docker exec scar-app-with-db-1 ls /home/samuel/po 2>&1
docker exec scar-app-with-db-1 ls /home/samuel/odin-health 2>&1
# Should fail with "No such file or directory"

# 4. Verify workspace access for all projects
docker exec scar-app-with-db-1 ls -la /workspace/project-orchestrator/
docker exec scar-app-with-db-1 ls -la /workspace/health-agent/
docker exec scar-app-with-db-1 ls -la /workspace/openhorizon.cc/
```

### 8.2 Test Project-Orchestrator

```bash
# 1. Check PO containers are running
cd /home/samuel/.archon/workspaces/project-orchestrator
docker compose ps

# 2. Test health endpoint
curl http://localhost:8001/health

# 3. Test frontend
curl -I http://localhost:3002

# 4. Check logs for errors
docker compose logs --tail 50

# 5. Verify database is accessible
docker exec backend psql $DATABASE_URL -c "SELECT COUNT(*) FROM projects;"
```

### 8.3 Test Health-Agent

```bash
# 1. Check bot process
ps aux | grep health-agent | grep -v grep

# 2. Check production data exists
ls -la /home/samuel/.archon/workspaces/health-agent/production/data/
ls -la /home/samuel/.archon/workspaces/health-agent/production/logs/

# 3. Check logs
tail -f /home/samuel/.archon/workspaces/health-agent/production/logs/bot.log

# 4. Send test message via Telegram to verify bot responds

# 5. Verify data persistence
# (Check that user data still exists and is accessible)
```

### 8.4 Test OpenHorizon

```bash
cd /home/samuel/.archon/workspaces/openhorizon.cc

# 1. Test local development
npm run dev:app &
DEV_PID=$!
sleep 5
curl -I http://localhost:3000
kill $DEV_PID

# 2. Verify Cloud Run is still accessible
curl -I https://openhorizon-704897644650.europe-west1.run.app

# 3. Check Cloud Run services
gcloud run services list --project openhorizon-cc --region europe-west1
```

### 8.5 Test SCAR GitHub Integration

```bash
# 1. Post test comment on issue #17
gh issue comment 17 --repo gpt153/scar --body "@scar verify workspace access - list projects in /workspace/"

# 2. Verify SCAR responds correctly
# 3. Check SCAR doesn't reference old paths like /home/samuel/po
```

---

## Phase 9: Final Cleanup 🧹

```bash
# 1. Remove safety backup (if everything works for 24h)
# WAIT 24 HOURS before running this!
rm -rf /home/samuel/cleanup-backup

# 2. Check for any other old directories
ls -la /home/samuel/ | grep -E "old|backup|tmp"

# 3. Clean up Docker images
docker image prune -f

# 4. Clean up unused volumes (CAREFUL!)
docker volume ls
# Only remove volumes you're sure are unused

# 5. Check final disk usage
df -h /home/samuel
du -sh /home/samuel/.archon/workspaces/*
```

---

## Phase 10: Documentation Update 📚

```bash
cd /home/samuel/scar

# 1. Create workspace conventions doc
cat > WORKSPACE_CONVENTIONS.md << 'EOF'
# Workspace Conventions

## Single Source of Truth Principle

All project code lives in `/home/samuel/.archon/workspaces/<project>/`

## Three Workspace Patterns

We use different patterns based on how each project manages state:

### Pattern 1: Docker Volume State (Stateless Applications)

**Projects**: project-orchestrator, scar

**Structure:**
```
/home/samuel/.archon/workspaces/<project>/
├── src/                  # Application code
├── docker-compose.yml    # Container orchestration
├── .env                  # Configuration
└── .github/workflows/    # CI/CD
```

**Characteristics:**
- All persistent state in Docker volumes (databases, caches)
- No file-based data storage
- Workspace IS the deployment location
- No production/ subfolder needed

**Deployment:**
```bash
cd /home/samuel/.archon/workspaces/project-orchestrator
docker compose up -d
```

---

### Pattern 2: File-Based State (Stateful Applications)

**Projects**: health-agent

**Structure:**
```
/home/samuel/.archon/workspaces/<project>/
├── src/                  # Application code
├── production/           # Runtime data
│   ├── data/            # Persistent user data
│   └── logs/            # Application logs
├── .venv/               # Development dependencies (not in production/)
└── .github/workflows/    # CI/CD
```

**Characteristics:**
- Persistent data stored as files
- Data survives code updates
- Clean separation: code vs runtime data
- Production/ subfolder required

**Deployment:**
```bash
cd /home/samuel/.archon/workspaces/health-agent
docker compose up -d
# Mounts: ./production/data:/app/data
```

**Why the separation?**
- Code updates don't touch user data
- Can backup production/ independently
- Smaller production footprint (data only, no venv)

---

### Pattern 3: Hybrid Development (Cloud-Native Applications)

**Projects**: openhorizon.cc

**Structure:**
```
/home/samuel/.archon/workspaces/<project>/
├── landing/              # Landing page app
├── app/                  # Main application
├── .env.local           # Local development config
└── .env.production      # Cloud Run production config
```

**Characteristics:**
- Stateless Next.js applications
- External database (Supabase/Neon)
- Local development, Cloud Run production
- No production/ subfolder (no local state)

**Development:**
```bash
# Local development (fast iteration)
npm run dev:app           # localhost:3000
npm run dev:landing       # localhost:3001

# Staging/Production (Cloud Run)
gcloud builds submit --config cloudbuild-app.yaml
```

**When to use each:**
- **Daily work**: Local development
- **Testing/demos**: Deploy to Cloud Run
- **Production**: Deploy to Cloud Run

---

## Path Reference

### Inside SCAR Container

```
/workspace/                         # All development workspaces
  ├── scar/                        # SCAR source
  ├── project-orchestrator/        # PO (Pattern 1)
  ├── health-agent/                # Health-Agent (Pattern 2)
  │   └── production/              # Runtime data
  ├── openhorizon.cc/              # OpenHorizon (Pattern 3)
  └── [other-projects]/

/worktrees/                         # Git worktrees for parallel work
  ├── scar/
  ├── project-orchestrator/
  └── health-agent/
```

### On Host System

```
/home/samuel/
├── .archon/
│   ├── workspaces/              # All project source code
│   └── worktrees/               # Git worktrees
└── scar/                        # SCAR production (exception: self-reference)
```

**Removed paths:**
- ❌ `/home/samuel/po/` - Migrated to workspace
- ❌ `/home/samuel/odin-health/` - Migrated to workspace

---

## Decision Tree: Which Pattern?

```
Does your project store persistent data as files?
├─ YES → Pattern 2 (File-Based State)
│   Examples: Bots with user data, agents with conversation logs
│   Structure: workspace/<project>/production/{data,logs}
│
└─ NO → Does it deploy to cloud/serverless?
    ├─ YES → Pattern 3 (Hybrid Development)
    │   Examples: Next.js apps on Cloud Run/Vercel
    │   Development: Local, Production: Cloud
    │
    └─ NO → Pattern 1 (Docker Volume State)
        Examples: Web apps with Postgres/Redis
        Structure: workspace/<project>/ with docker volumes
```

---

## CI/CD Integration

All CI/CD workflows deploy FROM workspace:

```yaml
# Example: Project-Orchestrator CI/CD
env:
  DEPLOY_DIR: /home/samuel/.archon/workspaces/project-orchestrator

# Example: Health-Agent CI/CD
env:
  DEPLOY_DIR: /home/samuel/.archon/workspaces/health-agent

# Example: OpenHorizon CI/CD
# Uses gcloud builds submit (no DEPLOY_DIR needed)
```

---

## Migration Checklist

When adding a new project:

1. **Clone to workspace:**
   ```bash
   cd /home/samuel/.archon/workspaces
   git clone https://github.com/user/project.git
   ```

2. **Determine pattern:**
   - Check if it stores files → Pattern 2
   - Check if it's cloud-native → Pattern 3
   - Otherwise → Pattern 1

3. **Set up structure:**
   - Pattern 1: Use workspace directly
   - Pattern 2: Create `production/` subfolder
   - Pattern 3: Document local vs cloud workflow

4. **Update CI/CD:**
   - Point workflows to workspace path
   - Test deployment

5. **Register with SCAR:**
   - Database entry with correct repo_path
   - Load commands if available

---

**End of Workspace Conventions**
EOF

# 2. Commit all documentation updates
git add CLAUDE.md WORKSPACE_CONVENTIONS.md WORKSPACE_UNIFICATION_PLAN.md
git commit -m "docs: Implement workspace unification with pattern-based architecture

- Pattern 1: Docker volume state (PO, SCAR)
- Pattern 2: File-based state (health-agent)
- Pattern 3: Hybrid development (openhorizon)
- Removed /home/samuel/po and /home/samuel/odin-health
- All projects now in workspace structure
- Recovered ~16GB disk space"
git push

# 3. Update README if needed
nano README.md
# Add reference to WORKSPACE_CONVENTIONS.md
```

---

## Success Criteria ✅

After completing this plan:

- [ ] ~16GB disk space recovered
- [ ] All backups removed (`workspace-old-*`, `po.backup.*`, `*.backup-*`)
- [ ] `/home/samuel/po/` removed
- [ ] `/home/samuel/odin-health/` removed
- [ ] **PO**: Running from workspace (Pattern 1 - no production subfolder)
- [ ] **Health-Agent**: Running from workspace with production/ subfolder (Pattern 2)
- [ ] **OpenHorizon**: Hybrid workflow documented (Pattern 3)
- [ ] CI/CD deploys from workspace for all projects
- [ ] SCAR container doesn't mount old production paths
- [ ] CLAUDE.md updated with workspace patterns
- [ ] WORKSPACE_CONVENTIONS.md created with all patterns documented
- [ ] All production services running from workspace
- [ ] SCAR GitHub integration works
- [ ] No references to old paths in codebase or database
- [ ] Each project follows appropriate pattern for its state management

---

## Rollback Plan 🔙

If something goes wrong:

```bash
# 1. Restore from safety backup
cp -r /home/samuel/cleanup-backup/env-files/* /home/samuel/po/
cp -r /home/samuel/cleanup-backup/odin-health-data /home/samuel/odin-health/data
cp -r /home/samuel/cleanup-backup/odin-health-logs /home/samuel/odin-health/logs

# 2. Restore SCAR docker-compose.yml
cd /home/samuel/scar
git checkout docker-compose.yml

# 3. Restart with old config
docker compose --profile with-db down
docker compose --profile with-db up -d

# 4. Restore production services
cd /home/samuel/po
docker compose up -d

cd /home/samuel/odin-health
docker compose up -d
```

---

## Next Steps

After successful completion:

1. **Monitor for 24 hours:**
   - Check all services remain healthy
   - Verify no path-related errors in logs
   - Test SCAR can work with all projects

2. **Remove safety backup** (after 24h):
   ```bash
   rm -rf /home/samuel/cleanup-backup
   ```

3. **Update any external references:**
   - Scripts that reference old paths
   - Aliases that point to `/home/samuel/po`
   - Monitoring/logging tools

4. **Document in project changelogs:**
   - Note workspace migration date
   - Link to WORKSPACE_CONVENTIONS.md
   - Explain pattern for each project

5. **Consider scheduled backups:**
   - Workspace to external storage
   - Especially for Pattern 2 projects (file-based data)

---

**End of Plan**
