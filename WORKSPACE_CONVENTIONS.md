# Workspace Conventions

## Single Source of Truth Principle

All project code lives in `/home/samuel/.archon/workspaces/<project>/`

## Three Workspace Patterns

We use different patterns based on how each project manages state:

### Pattern 1: Docker Volume State (Stateless Applications)

**Projects**: project-manager, scar

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
cd /home/samuel/.archon/workspaces/project-manager
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
  ├── project-manager/             # PM (Pattern 1)
  ├── health-agent/                # Health-Agent (Pattern 2)
  │   └── production/              # Runtime data
  ├── openhorizon.cc/              # OpenHorizon (Pattern 3)
  └── [other-projects]/

/worktrees/                         # Git worktrees for parallel work
  ├── scar/
  ├── project-manager/
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
# Example: Project-Manager CI/CD
env:
  DEPLOY_DIR: /home/samuel/.archon/workspaces/project-manager

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
