# Secrets Management Research for SCAR + Supervisor

**Date:** 2026-01-10
**Context:** Solve recurring "missing API key" issues where secrets are provided but forgotten during long SCAR/supervisor sessions
**Goal:** Centralized, persistent, AI-accessible secrets storage for both SCAR and supervisor

---

## Problem Statement

### Current Pain Points

1. **Secrets get forgotten** - API keys provided early in session are lost after many tokens
2. **No persistence** - Secrets not preserved across supervisor/SCAR context switches
3. **Repository secrets don't work** - Not accessible in workspace/worktree environments
4. **Time wasted** - Hours spent debugging only to discover missing API key
5. **Both human and AI need access** - Must be readable and writable by both

### Requirements

**Storage Needs:**
- API keys (OpenAI, Anthropic, Stripe, etc.)
- Bot tokens (Telegram, Discord, Slack)
- GitHub tokens (personal access tokens)
- Database credentials (PostgreSQL, Supabase)
- 3rd party service credentials (GCP, AWS, etc.)

**Access Patterns:**
- ✅ Supervisor can read and write secrets
- ✅ SCAR can read and write secrets
- ✅ Human can manually add/update secrets
- ✅ Secrets persist across sessions
- ✅ Per-project AND global secrets
- ❌ Never committed to git
- ❌ No complex infrastructure (single-developer tool)

---

## Industry Best Practices (2026)

### Key Findings from Research

**Source:** [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html), [StrongDM Best Practices](https://discover.strongdm.com/blog/secrets-management), [Doppler Developer Guide](https://www.doppler.com/blog/5-secrets-management-best-practices-for-new-developers)

**2026 Industry Trends:**
1. **Identity-based access** - Shift from "What is the secret?" to "Who is asking?"
2. **Runtime injection** - Eliminate local secrets through dynamic retrieval
3. **Automated rotation** - Ephemeral credentials that rotate automatically
4. **Developer experience focus** - CLI tools minimize friction while maximizing visibility

**Best Practices:**
- ✅ Centralized secure storage (single source of truth)
- ✅ Environment separation (dev/staging/production)
- ✅ Never hardcode or commit secrets to repos
- ✅ Use `.env` files with `.gitignore`
- ✅ Encrypted storage at rest
- ❌ Avoid passing secrets through environment variables in production (prefer vaults)
- ❌ Don't use repository secrets for local development

**Tools Landscape:**
- **Enterprise:** HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault
- **Developer-focused:** [Doppler](https://www.doppler.com/), [Infisical](https://infisical.com/), dotenv-vault
- **Simple:** [direnv](https://www.papermtn.co.uk/secrets-management-managing-environment-variables-with-direnv/), encrypted dotenv files

**Security Note (2026):**
> "73% of 2025 breaches stemmed from config mismanagement (Verizon DBIR 2026), pushing adoption in blockchain/AI pipelines where secrets power wallet keys or inference endpoints."

**Key Insight:**
> "The 'best' secrets manager minimizes friction for developers while maximizing visibility for security teams."

---

## Proposed Solution: Hybrid Secrets Store

### Architecture Overview

```
/home/samuel/.archon/
├── .secrets/                    # Central secrets store (NEW)
│   ├── global.env              # Shared across all projects
│   ├── projects/               # Per-project secrets
│   │   ├── scar.env
│   │   ├── consilio.env
│   │   ├── health-agent.env
│   │   └── openhorizon.env
│   └── README.md               # Usage instructions for AI agents
├── workspaces/
│   ├── scar/
│   │   ├── .env.local          # Auto-loaded from .secrets/projects/scar.env
│   │   └── .gitignore          # Includes .env.local
│   └── consilio/
│       ├── .env.local          # Auto-loaded from .secrets/projects/consilio.env
│       └── .gitignore
└── worktrees/
    └── scar/
        └── issue-42/
            └── .env.local      # Symlinked or copied from .secrets/projects/scar.env
```

### Design Principles

1. **Central + Per-Project Hybrid**
   - Global secrets: `/home/samuel/.archon/.secrets/global.env`
   - Project secrets: `/home/samuel/.archon/.secrets/projects/<project>.env`

2. **Git-Safe by Design**
   - `.secrets/` directory is outside all repositories
   - `.env.local` files are always in `.gitignore`
   - SCAR commands enforce `.gitignore` rules automatically

3. **AI-Discoverable**
   - README.md in `.secrets/` directory with clear instructions
   - SCAR slash commands for secrets management
   - Auto-injection into workspace/worktree environments

4. **Human-Friendly**
   - Simple text files (KEY=value format)
   - Can edit with any text editor
   - SCAR provides CLI helpers for common operations

---

## Implementation Details

### 1. Directory Structure

**Create central secrets store:**

```bash
# One-time setup
mkdir -p /home/samuel/.archon/.secrets/projects
touch /home/samuel/.archon/.secrets/global.env
touch /home/samuel/.archon/.secrets/README.md
```

**`.secrets/README.md`** (for AI agents):

```markdown
# Secrets Management for SCAR + Supervisor

This directory contains all secrets for SCAR projects. Never commit these files to git.

## File Structure

- `global.env` - Secrets shared across ALL projects
- `projects/<project-name>.env` - Secrets specific to one project

## Usage for AI Agents

### Reading Secrets

When you need an API key or credential:

1. Check if secret exists in project-specific file:
   ```bash
   cat /home/samuel/.archon/.secrets/projects/$(basename $PWD).env
   ```

2. If not found, check global file:
   ```bash
   cat /home/samuel/.archon/.secrets/global.env
   ```

3. If still not found, ask user:
   - "I need the [SERVICE] API key. Please add it with: `/secret set [SERVICE]_API_KEY your-key-here`"

### Writing Secrets

When user provides a secret:

1. Determine if global or project-specific
2. Append to appropriate file:
   ```bash
   echo "OPENAI_API_KEY=sk-..." >> /home/samuel/.archon/.secrets/projects/myproject.env
   ```

3. Auto-sync to workspace `.env.local`:
   ```bash
   cp /home/samuel/.archon/.secrets/projects/myproject.env /home/samuel/.archon/workspaces/myproject/.env.local
   ```

## Common Secrets

### Global (all projects)
- `GITHUB_TOKEN` - GitHub personal access token
- `ANTHROPIC_API_KEY` - Claude API key
- `OPENAI_API_KEY` - OpenAI API key

### Project-specific
- `DATABASE_URL` - Project database connection
- `STRIPE_SECRET_KEY` - Stripe for payment features
- `TELEGRAM_BOT_TOKEN` - Telegram bot for this project
- `SUPABASE_SERVICE_KEY` - Supabase admin key

## Security Rules

1. ✅ Store secrets here, NOT in project repos
2. ✅ Always add .env.local to .gitignore
3. ✅ Sync secrets to workspace/worktree on project init
4. ❌ Never log secret values
5. ❌ Never commit secrets to git
```

### 2. SCAR Slash Commands

**Add to `src/handlers/command-handler.ts`:**

```typescript
// Secrets management commands
case 'secret-list':
  // List all available secrets (keys only, not values)
  return await listSecrets(codebase.name);

case 'secret-set':
  // Set a secret: /secret-set KEY value
  // Example: /secret-set OPENAI_API_KEY sk-...
  const [key, ...valueParts] = args;
  const value = valueParts.join(' ');
  return await setSecret(codebase.name, key, value);

case 'secret-get':
  // Get a secret value: /secret-get KEY
  const secretKey = args[0];
  return await getSecret(codebase.name, secretKey);

case 'secret-sync':
  // Sync secrets to workspace .env.local
  return await syncSecrets(codebase.name);

case 'secret-check':
  // Validate all required secrets exist for current project
  return await checkRequiredSecrets(codebase.name);
```

### 3. Secrets Management Module

**Create `src/utils/secrets-manager.ts`:**

```typescript
import fs from 'fs/promises';
import path from 'path';

const SECRETS_BASE = '/home/samuel/.archon/.secrets';
const GLOBAL_SECRETS = path.join(SECRETS_BASE, 'global.env');
const PROJECTS_DIR = path.join(SECRETS_BASE, 'projects');

export interface Secret {
  key: string;
  value: string;
  scope: 'global' | 'project';
}

/**
 * List all secret keys (not values) for a project
 */
export async function listSecrets(projectName: string): Promise<string[]> {
  const globalKeys = await readEnvFile(GLOBAL_SECRETS);
  const projectFile = path.join(PROJECTS_DIR, `${projectName}.env`);
  const projectKeys = await readEnvFile(projectFile);

  return [
    ...globalKeys.map(k => `${k} (global)`),
    ...projectKeys.map(k => `${k} (project)`)
  ];
}

/**
 * Set a secret (global or project-specific)
 */
export async function setSecret(
  projectName: string,
  key: string,
  value: string,
  scope: 'global' | 'project' = 'project'
): Promise<void> {
  const targetFile = scope === 'global'
    ? GLOBAL_SECRETS
    : path.join(PROJECTS_DIR, `${projectName}.env`);

  // Read existing secrets
  const existing = await readEnvFileRaw(targetFile);

  // Remove existing key if present
  const filtered = existing
    .split('\n')
    .filter(line => !line.startsWith(`${key}=`));

  // Append new value
  filtered.push(`${key}=${value}`);

  // Write back
  await fs.writeFile(targetFile, filtered.join('\n'));

  // Auto-sync to workspace
  await syncSecrets(projectName);
}

/**
 * Get a secret value (checks project first, then global)
 */
export async function getSecret(
  projectName: string,
  key: string
): Promise<string | null> {
  // Check project-specific first
  const projectFile = path.join(PROJECTS_DIR, `${projectName}.env`);
  const projectValue = await readSecretFromFile(projectFile, key);
  if (projectValue) return projectValue;

  // Check global
  return await readSecretFromFile(GLOBAL_SECRETS, key);
}

/**
 * Sync secrets from .secrets/ to workspace .env.local
 */
export async function syncSecrets(projectName: string): Promise<void> {
  const workspacePath = `/home/samuel/.archon/workspaces/${projectName}`;
  const envLocalPath = path.join(workspacePath, '.env.local');

  // Merge global + project secrets
  const globalContent = await readEnvFileRaw(GLOBAL_SECRETS);
  const projectFile = path.join(PROJECTS_DIR, `${projectName}.env`);
  const projectContent = await readEnvFileRaw(projectFile);

  const merged = [
    '# Auto-generated from /home/samuel/.archon/.secrets/',
    '# DO NOT EDIT MANUALLY - Use /secret-set command',
    '',
    '# Global secrets',
    globalContent,
    '',
    '# Project secrets',
    projectContent
  ].join('\n');

  await fs.writeFile(envLocalPath, merged);

  // Ensure .gitignore includes .env.local
  await ensureGitignore(workspacePath);
}

/**
 * Check if required secrets exist for a project
 */
export async function checkRequiredSecrets(
  projectName: string,
  required: string[] = []
): Promise<{ missing: string[], found: string[] }> {
  const missing: string[] = [];
  const found: string[] = [];

  for (const key of required) {
    const value = await getSecret(projectName, key);
    if (value) {
      found.push(key);
    } else {
      missing.push(key);
    }
  }

  return { missing, found };
}

// Helper functions

async function readEnvFile(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim() && !line.startsWith('#'))
      .map(line => line.split('=')[0]);
  } catch {
    return [];
  }
}

async function readEnvFileRaw(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

async function readSecretFromFile(
  filePath: string,
  key: string
): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const match = content
      .split('\n')
      .find(line => line.startsWith(`${key}=`));

    if (match) {
      return match.substring(key.length + 1);
    }
  } catch {
    return null;
  }
  return null;
}

async function ensureGitignore(workspacePath: string): Promise<void> {
  const gitignorePath = path.join(workspacePath, '.gitignore');

  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    if (!content.includes('.env.local')) {
      await fs.appendFile(gitignorePath, '\n.env.local\n');
    }
  } catch {
    // Create .gitignore if it doesn't exist
    await fs.writeFile(gitignorePath, '.env.local\n');
  }
}
```

### 4. Auto-Sync on Worktree Creation

**Modify worktree creation code** (e.g., in GitHub adapter or command handler):

```typescript
// After creating worktree
await syncSecretsToWorktree(projectName, worktreePath);

async function syncSecretsToWorktree(
  projectName: string,
  worktreePath: string
): Promise<void> {
  const sourceEnv = `/home/samuel/.archon/workspaces/${projectName}/.env.local`;
  const targetEnv = path.join(worktreePath, '.env.local');

  try {
    await fs.copyFile(sourceEnv, targetEnv);
  } catch (error) {
    console.warn(`[Worktree] Could not sync secrets: ${error}`);
  }
}
```

### 5. Supervisor/SCAR Context Injection

**Add to CLAUDE.md** (for AI agent instructions):

```markdown
## Secrets Management

### CRITICAL: Always Check for Required Secrets

Before starting any implementation that requires external services, check for required secrets:

1. **Check secrets file:**
   ```bash
   cat /home/samuel/.archon/.secrets/projects/$(basename $PWD).env
   cat /home/samuel/.archon/.secrets/global.env
   ```

2. **If secret is missing, ASK USER IMMEDIATELY:**
   ```
   ❌ Missing required secret: OPENAI_API_KEY

   Please provide your OpenAI API key:
   /secret-set OPENAI_API_KEY sk-...
   ```

3. **Common secrets by service:**
   - **OpenAI:** `OPENAI_API_KEY`
   - **Anthropic:** `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`
   - **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`
   - **Supabase:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
   - **GitHub:** `GITHUB_TOKEN` or `GH_TOKEN`
   - **PostgreSQL:** `DATABASE_URL`
   - **Telegram:** `TELEGRAM_BOT_TOKEN`

### Secrets Workflow

**When user provides a secret:**
```bash
# Store it immediately
/secret-set OPENAI_API_KEY sk-proj-xxxxx

# Verify it was saved
/secret-get OPENAI_API_KEY

# Sync to workspace
/secret-sync
```

**When you need a secret:**
```bash
# Check if it exists
/secret-get OPENAI_API_KEY

# If missing, ask user
# If found, use it in your implementation
```

**At start of implementation:**
```bash
# Run secrets check to validate all required secrets exist
/secret-check
```

### Never Commit Secrets

- ✅ All secrets stored in `/home/samuel/.archon/.secrets/`
- ✅ `.env.local` files are git-ignored automatically
- ✅ Verify .gitignore before any git commit
- ❌ Never log secret values in console
- ❌ Never include secrets in git commit messages
```

---

## Migration Strategy

### Step 1: One-Time Setup

```bash
# Create secrets directory structure
mkdir -p /home/samuel/.archon/.secrets/projects

# Create README for AI agents
cat > /home/samuel/.archon/.secrets/README.md << 'EOF'
[Content from section 1 above]
EOF

# Create global secrets file
touch /home/samuel/.archon/.secrets/global.env

# Migrate existing secrets from SCAR .env
cp /home/samuel/scar/.env /home/samuel/.archon/.secrets/global.env

# Clean sensitive data from git-tracked .env
cat /home/samuel/scar/.env.example > /home/samuel/scar/.env
```

### Step 2: Create Per-Project Secrets

```bash
# For each existing project
for project in consilio health-agent openhorizon.cc; do
  # Create project secrets file
  touch /home/samuel/.archon/.secrets/projects/$project.env

  # Copy workspace .env if exists
  if [ -f "/home/samuel/.archon/workspaces/$project/.env" ]; then
    cp "/home/samuel/.archon/workspaces/$project/.env" \
       "/home/samuel/.archon/.secrets/projects/$project.env"
  fi
done
```

### Step 3: Implement SCAR Commands

1. Add `secrets-manager.ts` utility (code above)
2. Add slash commands to command-handler.ts
3. Test with `/secret-set TEST_KEY test-value`
4. Test with `/secret-list`
5. Test with `/secret-sync`

### Step 4: Update Documentation

1. Add secrets section to CLAUDE.md
2. Add secrets section to supervision documentation
3. Update .template/CLAUDE.md with secrets best practices
4. Propagate to all workspaces: `npm run propagate`

---

## Usage Examples

### Example 1: Setting Up New Project

```bash
# Via Telegram or GitHub
User: @scar Let's build a Stripe payment integration

SCAR: 🔑 Checking required secrets for Stripe...
      ❌ Missing: STRIPE_SECRET_KEY
      ❌ Missing: STRIPE_PUBLISHABLE_KEY

      Please provide your Stripe API keys:

User: /secret-set STRIPE_SECRET_KEY sk_test_xxxxx
User: /secret-set STRIPE_PUBLISHABLE_KEY pk_test_xxxxx

SCAR: ✅ Secrets stored successfully
      📁 Location: /home/samuel/.archon/.secrets/projects/consilio.env
      🔄 Synced to workspace .env.local

      Ready to start implementation!
```

### Example 2: Supervisor Checking Secrets

```bash
# Supervisor running /prime-proj
Supervisor: Priming project: health-agent

# Auto-check for common secrets
Supervisor: 🔍 Checking secrets...
            ✅ OPENAI_API_KEY (global)
            ✅ TELEGRAM_BOT_TOKEN (project)
            ✅ DATABASE_URL (project)
            ❌ PYDANTICAI_API_KEY (missing)

            Recommendation: Add PydanticAI API key before starting development
            Use: /secret-set PYDANTICAI_API_KEY your-key-here
```

### Example 3: SCAR in Worktree

```bash
# SCAR working on GitHub issue #42
SCAR: Creating worktree for issue #42...
      📁 /home/samuel/.archon/worktrees/consilio/issue-42/

      🔑 Syncing secrets from workspace...
      ✅ Copied 8 secrets to worktree .env.local

      Secrets available:
      - DATABASE_URL
      - STRIPE_SECRET_KEY
      - OPENAI_API_KEY
      - [5 more...]

      Ready to implement!
```

---

## Security Considerations

### Encryption at Rest (Optional Enhancement)

**Current:** Plain text .env files (acceptable for single-developer use)

**Future:** Encrypt secrets with user password

```bash
# Encrypt secrets directory
gpg --symmetric --cipher-algo AES256 /home/samuel/.archon/.secrets/global.env

# Decrypt when needed
gpg --decrypt /home/samuel/.archon/.secrets/global.env.gpg
```

**Tools to consider:**
- [git-crypt](https://github.com/AGWA/git-crypt) - Transparent encryption in git
- [SOPS](https://github.com/getsops/sops) - Secrets OPerationS tool
- [age](https://age-encryption.org/) - Simple file encryption

### Access Control

**Current:** File system permissions (chmod 600)

```bash
# Restrict secrets to owner-only
chmod 700 /home/samuel/.archon/.secrets
chmod 600 /home/samuel/.archon/.secrets/*.env
chmod 600 /home/samuel/.archon/.secrets/projects/*.env
```

### Audit Logging

**Future enhancement:** Log secret access

```typescript
// Log when secrets are read/written
async function setSecret(...) {
  await logSecretAccess('SET', projectName, key, scope);
  // ... existing logic
}

async function logSecretAccess(
  action: 'GET' | 'SET' | 'DELETE',
  project: string,
  key: string,
  scope: 'global' | 'project'
): Promise<void> {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    project,
    key,
    scope,
  };

  await fs.appendFile(
    '/home/samuel/.archon/.secrets/.audit.log',
    JSON.stringify(logEntry) + '\n'
  );
}
```

---

## Alternative Solutions Considered

### 1. PostgreSQL Storage

**Pros:**
- Already have database infrastructure
- Built-in encryption support
- Query capabilities

**Cons:**
- Adds complexity (database dependency)
- Harder for human to manually edit
- Database credentials are themselves secrets (chicken-egg problem)

**Verdict:** ❌ Too complex for single-developer tool

### 2. Environment Variables Only

**Pros:**
- Standard Node.js pattern
- Simple to use

**Cons:**
- Not persistent across shells
- Hard to share between supervisor/SCAR contexts
- No central management

**Verdict:** ❌ Doesn't solve persistence problem

### 3. HashiCorp Vault

**Pros:**
- Industry standard
- Excellent security
- Dynamic secrets, rotation

**Cons:**
- Complex setup (separate service)
- Overkill for single developer
- Learning curve

**Verdict:** ❌ Over-engineering for this use case

### 4. Doppler / Infisical

**Pros:**
- Developer-focused UI
- Cloud-based (accessible anywhere)
- Team features

**Cons:**
- External dependency
- Requires internet
- Monthly cost (even for solo dev)

**Verdict:** ❌ External dependency not ideal

### 5. Direnv

**Pros:**
- Shell-level environment management
- Works with any programming language
- Simple .envrc files

**Cons:**
- Requires direnv installation
- Per-directory setup needed
- Not easily AI-accessible

**Verdict:** ⚠️ Good for human, harder for AI

### 6. Selected Solution: Hybrid File-Based Store

**Pros:**
- ✅ Simple implementation (just files)
- ✅ No external dependencies
- ✅ Human-readable and editable
- ✅ AI-discoverable (clear file paths)
- ✅ Git-safe (outside repos)
- ✅ Supports global + project scope
- ✅ Easy backup (just copy directory)

**Cons:**
- ⚠️ Plain text (acceptable for single-dev, can encrypt later)
- ⚠️ Manual permission management

**Verdict:** ✅ **Best fit for SCAR use case**

---

## Next Steps

### Phase 1: Core Implementation (Recommended)

1. **Create directory structure** (1 hour)
   - Set up `/home/samuel/.archon/.secrets/`
   - Create README.md for AI agents
   - Migrate existing secrets

2. **Implement secrets-manager.ts** (2 hours)
   - Core CRUD operations
   - Sync functionality
   - Git-ignore enforcement

3. **Add SCAR slash commands** (2 hours)
   - `/secret-set`, `/secret-get`, `/secret-list`
   - `/secret-sync`, `/secret-check`
   - Integration with command-handler.ts

4. **Update documentation** (1 hour)
   - Add to CLAUDE.md
   - Update supervision docs
   - Create user guide

**Total: ~6 hours**

### Phase 2: Enhanced Features (Optional)

1. **Auto-detection** (2 hours)
   - Detect when secrets are needed
   - Proactive reminders
   - Validation on startup

2. **Encryption** (3 hours)
   - GPG-based encryption
   - Transparent decrypt on access
   - Key management

3. **Audit logging** (1 hour)
   - Track secret access
   - Security monitoring

**Total: ~6 hours**

### Phase 3: Advanced (Future)

1. **Rotation reminders**
2. **Secret expiration**
3. **Vault integration option**

---

## Testing Strategy

### Manual Tests

```bash
# Test 1: Set global secret
/secret-set GLOBAL_TEST_KEY test-value-123

# Test 2: Set project secret
/secret-set PROJECT_TEST_KEY project-value-456

# Test 3: List secrets
/secret-list
# Should show both GLOBAL_TEST_KEY and PROJECT_TEST_KEY

# Test 4: Get secret
/secret-get GLOBAL_TEST_KEY
# Should return: test-value-123

# Test 5: Sync to workspace
/secret-sync
# Check: cat ~/.archon/workspaces/scar/.env.local
# Should contain both secrets

# Test 6: Verify gitignore
cd ~/.archon/workspaces/scar
git status
# .env.local should NOT appear in untracked files
```

### Automated Tests

**Create:** `src/utils/secrets-manager.test.ts`

```typescript
import { setSecret, getSecret, listSecrets, syncSecrets } from './secrets-manager';

describe('SecretsManager', () => {
  test('sets and retrieves global secret', async () => {
    await setSecret('test-project', 'TEST_KEY', 'test-value', 'global');
    const value = await getSecret('test-project', 'TEST_KEY');
    expect(value).toBe('test-value');
  });

  test('project secrets override global', async () => {
    await setSecret('test-project', 'KEY', 'global-value', 'global');
    await setSecret('test-project', 'KEY', 'project-value', 'project');
    const value = await getSecret('test-project', 'KEY');
    expect(value).toBe('project-value');
  });

  test('sync creates .env.local with merged secrets', async () => {
    await setSecret('test-project', 'GLOBAL_KEY', 'global-val', 'global');
    await setSecret('test-project', 'PROJECT_KEY', 'project-val', 'project');
    await syncSecrets('test-project');

    const envLocal = await fs.readFile(
      '/home/samuel/.archon/workspaces/test-project/.env.local',
      'utf-8'
    );

    expect(envLocal).toContain('GLOBAL_KEY=global-val');
    expect(envLocal).toContain('PROJECT_KEY=project-val');
  });
});
```

---

## Conclusion

### Recommended Approach

**Hybrid file-based secrets store** at `/home/samuel/.archon/.secrets/` provides:

✅ **Simplicity** - Plain text files, no infrastructure
✅ **Persistence** - Survives sessions, context switches
✅ **Accessibility** - Both human and AI can read/write
✅ **Git-safe** - Outside repos, never committed
✅ **Flexibility** - Global + per-project scoping
✅ **Discoverable** - Clear paths, documented for AI

### Implementation Priority

**Phase 1 (Now):** Core implementation with SCAR commands
**Phase 2 (Later):** Encryption and audit logging
**Phase 3 (Future):** Advanced features if needed

### Success Metrics

- ✅ No more "missing API key" surprises after hours of work
- ✅ Secrets persist across supervisor/SCAR sessions
- ✅ Both human and AI can manage secrets easily
- ✅ Zero secrets committed to git repos
- ✅ <30 seconds to add a new secret

---

## References

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [StrongDM: Secrets Management Best Practices 2026](https://discover.strongdm.com/blog/secrets-management)
- [Doppler: 5 Secrets Management Best Practices](https://www.doppler.com/blog/5-secrets-management-best-practices-for-new-developers)
- [Direnv for Development Environments](https://www.papermtn.co.uk/secrets-management-managing-environment-variables-with-direnv/)
- [Encrypted dotenv for Production (2026)](https://johal.in/secrets-dotenv-secure-config-management-in-production-2026-2/)

---

**Ready to implement?** Start with Phase 1 (6 hours) to solve the immediate pain points.
