# Port Management Integration Plan for SCAR

## Executive Summary

This plan details the integration of a centralized port registry into SCAR to prevent port conflicts across development worktrees and production services. The solution will track port allocations persistently, provide programmatic access for Claude, and integrate seamlessly with SCAR's existing worktree and command infrastructure.

## 1. Solution Evaluation

### Approach Comparison

| Aspect | Custom Solution | drkpxl/devports | bendechrai Concept |
|--------|----------------|-----------------|-------------------|
| **Persistence** | ✅ PostgreSQL | ❌ Runtime only | ✅ Described |
| **Worktree Integration** | ✅ Native | ❌ None | ✅ Purpose-built |
| **Programmatic Access** | ✅ Full API | ⚠️ CLI only | ✅ Described |
| **SCAR Integration** | ✅ Seamless | ⚠️ External tool | ⚠️ Concept only |
| **Production Tracking** | ✅ Configurable | ❌ Dev only | ⚠️ Unclear |
| **Maintenance** | ✅ In-house | ⚠️ External | ❌ Not implemented |

### Recommendation: **Custom Solution**

**Rationale:**
1. **Database-backed persistence** - Survives service restarts, aligns with SCAR's PostgreSQL infrastructure
2. **Native worktree integration** - Leverages existing `worktree_path` column and Git workflows
3. **Full programmatic access** - Claude can query, allocate, and release ports via slash commands
4. **Flexible port ranges** - Define separate ranges for dev (8000-8999) and production (9000-9999)
5. **Zero external dependencies** - No additional tools or services required

**Inspiration from existing tools:**
- Port tracking concept from bendechrai's worktree-aware approach
- Process detection from drkpxl/devports
- Configuration templating for service startup

## 2. Architecture & Data Model

### Database Schema

**New Table: `remote_agent_port_allocations`**

```sql
CREATE TABLE remote_agent_port_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Port information
  port INTEGER NOT NULL UNIQUE,
  service_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Context linkage
  codebase_id UUID REFERENCES remote_agent_codebases(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES remote_agent_conversations(id) ON DELETE SET NULL,
  worktree_path VARCHAR(500),

  -- Environment tracking
  environment VARCHAR(20) NOT NULL CHECK (environment IN ('dev', 'production', 'test')),

  -- Port status
  status VARCHAR(20) NOT NULL DEFAULT 'allocated'
    CHECK (status IN ('allocated', 'active', 'released')),

  -- Metadata
  allocated_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP,
  last_checked TIMESTAMP,
  process_id INTEGER,  -- Optional: track running process

  -- Port range validation
  CONSTRAINT valid_port_range CHECK (port >= 1024 AND port <= 65535)
);

-- Indexes
CREATE INDEX idx_port_allocations_codebase ON remote_agent_port_allocations(codebase_id);
CREATE INDEX idx_port_allocations_worktree ON remote_agent_port_allocations(worktree_path);
CREATE INDEX idx_port_allocations_status ON remote_agent_port_allocations(status);
CREATE INDEX idx_port_allocations_environment ON remote_agent_port_allocations(environment);
```

### Port Range Strategy

```typescript
// Port range definitions (configurable via environment)
const PORT_RANGES = {
  dev: {
    start: parseInt(process.env.DEV_PORT_START ?? '8000'),
    end: parseInt(process.env.DEV_PORT_END ?? '8999'),
  },
  production: {
    start: parseInt(process.env.PROD_PORT_START ?? '9000'),
    end: parseInt(process.env.PROD_PORT_END ?? '9999'),
  },
  test: {
    start: parseInt(process.env.TEST_PORT_START ?? '7000'),
    end: parseInt(process.env.TEST_PORT_END ?? '7999'),
  },
};

// Reserved ports (never auto-allocate)
const RESERVED_PORTS = [
  3000,  // SCAR main app
  5432,  // PostgreSQL
  8051,  // Archon MCP
  8181,  // Archon REST API
  3737,  // Archon Frontend
];
```

### TypeScript Interfaces

```typescript
// src/types/index.ts additions

export interface PortAllocation {
  id: string;
  port: number;
  service_name: string;
  description: string | null;
  codebase_id: string | null;
  conversation_id: string | null;
  worktree_path: string | null;
  environment: 'dev' | 'production' | 'test';
  status: 'allocated' | 'active' | 'released';
  allocated_at: Date;
  released_at: Date | null;
  last_checked: Date | null;
  process_id: number | null;
}

export interface PortAllocationRequest {
  service_name: string;
  description?: string;
  environment: 'dev' | 'production' | 'test';
  preferred_port?: number;
  codebase_id?: string;
  conversation_id?: string;
  worktree_path?: string;
}
```

## 3. Integration Points with SCAR

### 3.1 Database Integration

**File:** `/workspace/worktrees/scar/issue-6/migrations/007_add_port_allocations.sql`

Create new migration file with the schema above.

**File:** `/workspace/worktrees/scar/issue-6/src/db/port-allocations.ts`

New database operations module:

```typescript
import { pool } from './connection';
import { PortAllocation, PortAllocationRequest } from '../types';

export async function allocatePort(request: PortAllocationRequest): Promise<PortAllocation>
export async function releasePort(port: number): Promise<boolean>
export async function findAvailablePort(environment: string, start?: number): Promise<number | null>
export async function getPortAllocation(port: number): Promise<PortAllocation | null>
export async function listAllocations(filters?: PortAllocationFilters): Promise<PortAllocation[]>
export async function getPortsByCodebase(codebaseId: string): Promise<PortAllocation[]>
export async function getPortsByWorktree(worktreePath: string): Promise<PortAllocation[]>
export async function checkPortConflicts(port: number): Promise<boolean>
export async function updatePortStatus(port: number, status: string): Promise<void>
export async function cleanupStaleAllocations(): Promise<number>
```

### 3.2 Command Handler Integration

**File:** `/workspace/worktrees/scar/issue-6/src/handlers/command-handler.ts`

Add new slash commands:

```typescript
// Port management commands
case 'port-allocate': {
  // Usage: /port-allocate <service-name> [dev|production|test] [preferred-port]
  // Allocates next available port in range
}

case 'port-list': {
  // Usage: /port-list [--worktree] [--codebase] [--environment dev|prod|test]
  // Shows port allocations with filters
}

case 'port-release': {
  // Usage: /port-release <port>
  // Releases a port allocation
}

case 'port-check': {
  // Usage: /port-check <port>
  // Checks if port is available and shows allocation details
}

case 'port-config': {
  // Usage: /port-config <service-name>
  // Generates configuration snippet for service with allocated port
}

case 'port-cleanup': {
  // Usage: /port-cleanup [--dry-run]
  // Removes stale allocations (released ports, orphaned worktrees)
}
```

### 3.3 Worktree Integration

**Enhancement to `/worktree create` command:**

```typescript
case 'create': {
  // ... existing worktree creation logic ...

  // After worktree is created, allocate development port
  const portAllocation = await portDb.allocatePort({
    service_name: `${codebase.name}-${branchName}`,
    description: `Development server for ${branchName}`,
    environment: 'dev',
    codebase_id: codebase.id,
    conversation_id: conversation.id,
    worktree_path: worktreePath,
  });

  // Include port in response message
  return {
    success: true,
    message: `Worktree created!\n\nBranch: ${branchName}\nPath: ${shortPath}\nAllocated Port: ${portAllocation.port}\n\nUse: PORT=${portAllocation.port} npm run dev`,
    modified: true,
  };
}
```

**Enhancement to `/worktree remove` command:**

```typescript
case 'remove': {
  // ... existing worktree removal logic ...

  // Release all ports associated with this worktree
  const worktreePorts = await portDb.getPortsByWorktree(worktreePath);
  for (const allocation of worktreePorts) {
    await portDb.releasePort(allocation.port);
  }

  // ... rest of removal logic ...
}
```

### 3.4 Environment Configuration

**File:** `/workspace/worktrees/scar/issue-6/.env.example`

Add new configuration options:

```env
# Port Management Configuration
# Development port range (default: 8000-8999)
DEV_PORT_START=8000
DEV_PORT_END=8999

# Production port range (default: 9000-9999)
PROD_PORT_START=9000
PROD_PORT_END=9999

# Test port range (default: 7000-7999)
TEST_PORT_START=7000
TEST_PORT_END=7999

# Reserved ports (comma-separated, never auto-allocate)
RESERVED_PORTS=3000,5432,8051,8181,3737

# Auto-cleanup stale allocations on startup
PORT_AUTO_CLEANUP=true

# Port allocation strategy: sequential | random
PORT_ALLOCATION_STRATEGY=sequential
```

### 3.5 Codebase Integration

**Enhancement to `Codebase` type:**

```typescript
// src/types/index.ts
export interface Codebase {
  // ... existing fields ...

  // Add port registry metadata
  port_config?: {
    primary_port?: number;
    service_ports?: Record<string, number>;
  };
}
```

**Store production port configuration in codebase metadata:**

```typescript
// When cloning a repo with known services
const codebase = await codebaseDb.createCodebase({
  name: repoName,
  repository_url: repoUrl,
  default_cwd: repoPath,
  ai_assistant_type: 'claude',
  commands: {},
  port_config: {
    primary_port: 3000,
    service_ports: {
      'api': 9000,
      'web': 9001,
      'worker': 9002,
    },
  },
});
```

## 4. Implementation Steps

### Phase 1: Core Infrastructure (Week 1)

**Step 1.1: Database Schema**
- Create migration file `007_add_port_allocations.sql`
- Test migration on local PostgreSQL
- Verify indexes and constraints

**Step 1.2: Database Operations Module**
- Create `src/db/port-allocations.ts`
- Implement core functions:
  - `allocatePort()`
  - `releasePort()`
  - `findAvailablePort()`
  - `getPortAllocation()`
  - `listAllocations()`
- Write unit tests in `src/db/port-allocations.test.ts`

**Step 1.3: Type Definitions**
- Add `PortAllocation` and `PortAllocationRequest` to `src/types/index.ts`
- Update `Codebase` interface with `port_config`

### Phase 2: Command Integration (Week 1-2)

**Step 2.1: Basic Commands**
- Implement `/port-allocate` command
- Implement `/port-list` command
- Implement `/port-release` command
- Test commands via Telegram adapter

**Step 2.2: Advanced Commands**
- Implement `/port-check` command
- Implement `/port-config` command (generates config snippets)
- Implement `/port-cleanup` command

**Step 2.3: Help Documentation**
- Update `/help` command with port management section
- Add inline help for each port command

### Phase 3: Worktree Integration (Week 2)

**Step 3.1: Auto-allocation on Worktree Creation**
- Modify `/worktree create` to allocate port
- Update response message to include port number
- Test port allocation/release lifecycle

**Step 3.2: Auto-cleanup on Worktree Removal**
- Modify `/worktree remove` to release ports
- Add orphan detection for stale worktrees
- Implement cleanup on startup

### Phase 4: Claude Integration (Week 2)

**Step 4.1: Programmatic Access**
- Create utility functions for Claude to use:
  - `getRecommendedPort(serviceName, environment)`
  - `reservePortForService(serviceName, port, metadata)`
  - `generatePortConfig(serviceName, format)`
- Document Claude access patterns

**Step 4.2: Configuration Templates**
- Create templates for common frameworks:
  - Express.js: `app.listen(process.env.PORT || $PORT)`
  - Vite: `server.port: $PORT`
  - Next.js: `module.exports = { port: $PORT }`
- Implement `/port-config` template rendering

### Phase 5: Production Port Tracking (Week 3)

**Step 5.1: Production Registry**
- Add command to register production services:
  - `/port-register <service-name> <port> production`
- Import existing production ports from documentation
- Validate no conflicts with dev range

**Step 5.2: Port Range Management**
- Implement environment variable configuration
- Add validation for overlapping ranges
- Create admin command to view range utilization

### Phase 6: Advanced Features (Week 3-4)

**Step 6.1: Port Conflict Detection**
- Implement `lsof`-based active port detection
- Add warning when allocating already-active port
- Periodic health check for allocated ports

**Step 6.2: Auto-cleanup and Maintenance**
- Scheduled cleanup job for stale allocations
- Detect orphaned ports (worktree deleted but port allocated)
- Release ports inactive for >7 days (configurable)

**Step 6.3: Export/Import**
- Export port registry to JSON/CSV
- Import production port mappings from file
- Sync with external port management tools (optional)

## 5. Claude Interaction Patterns

### Scenario 1: Creating New Service in Worktree

**User:** "Create a worktree for the API feature and set up a dev server"

**Claude workflow:**
1. `/worktree create feature-api` → Port 8124 allocated
2. Check package.json for dev script
3. Create `.env.local` with `PORT=8124`
4. Suggest: `PORT=8124 npm run dev`

### Scenario 2: Port Conflict Resolution

**User:** "The dev server won't start, says port is in use"

**Claude workflow:**
1. `/port-list --worktree` → Check current allocations
2. Run `lsof -i :8124` to detect process
3. Suggest killing process or reallocating:
   - `/port-release 8124`
   - `/port-allocate api-server dev`

### Scenario 3: Multi-Service Architecture

**User:** "Set up ports for API, frontend, and worker services"

**Claude workflow:**
1. `/port-allocate api-server dev` → Port 8001
2. `/port-allocate frontend dev` → Port 8002
3. `/port-allocate worker dev` → Port 8003
4. Generate `docker-compose.yml` with allocated ports
5. Create `.env` file with all port mappings

### Scenario 4: Production Port Documentation

**User:** "What ports are used in production?"

**Claude workflow:**
1. `/port-list --environment production`
2. Query codebase `port_config` metadata
3. Generate markdown table of production services
4. Suggest gaps in port range for new services

## 6. Implementation Challenges & Solutions

### Challenge 1: Port Range Exhaustion

**Problem:** Dev range (8000-8999) may run out with many worktrees

**Solutions:**
- Implement automatic cleanup of stale allocations
- Wider default range (8000-8999 = 1000 ports)
- Alert when range >80% utilized
- Configurable ranges per environment

### Challenge 2: Process Detection Reliability

**Problem:** `lsof` may not detect all processes, or unavailable on some systems

**Solutions:**
- Graceful degradation: warn but allow allocation
- Use `netstat` as fallback on Windows
- Mark ports as `allocated` vs `active` status
- User override with `--force` flag

### Challenge 3: Cross-Platform Compatibility

**Problem:** Port detection differs on Linux/Mac/Windows

**Solutions:**
- Platform-specific detection utilities
- Focus on database as source of truth
- Process detection as advisory only
- Document platform limitations

### Challenge 4: Stale Allocation Detection

**Problem:** Worktree deleted outside SCAR, port still allocated

**Solutions:**
- Periodic cleanup job checking worktree existence
- `/port-cleanup` command with orphan detection
- Auto-cleanup on SCAR startup (optional)
- Manual review via `/port-list --orphans`

### Challenge 5: Concurrent Allocation Race Conditions

**Problem:** Two processes might allocate same port simultaneously

**Solutions:**
- Use PostgreSQL `UNIQUE` constraint on port number
- Implement retry logic on constraint violation
- Database-level transaction isolation
- Sequential allocation with row-level locking

## 7. Testing Strategy

### Unit Tests
- `src/db/port-allocations.test.ts` - Database operations
- Port range validation
- Conflict detection logic
- Cleanup algorithms

### Integration Tests
- Command handler tests for all `/port-*` commands
- Worktree creation/removal with port lifecycle
- Multi-service port allocation scenarios
- Cleanup job execution

### End-to-End Tests
- User workflow: worktree → port → service startup
- Port conflict detection and resolution
- Production port registration and tracking
- Cross-environment port management

### Manual Testing Checklist
- [ ] Create worktree, verify port allocated
- [ ] Remove worktree, verify port released
- [ ] Allocate port manually via command
- [ ] Check port status and conflicts
- [ ] Generate config with allocated port
- [ ] Cleanup stale allocations
- [ ] Test with multiple simultaneous worktrees
- [ ] Verify production port tracking

## 8. Documentation Requirements

### User Documentation

**README.md updates:**
- Add Port Management section
- Document available commands
- Show example workflows

**New Documentation File: `docs/port-management.md`**
- Overview of port registry
- Port range configuration
- Command reference
- Integration with worktrees
- Troubleshooting guide

### Developer Documentation

**Architecture.md updates:**
- Port allocation database schema
- Port management service layer
- Integration with existing systems

**API Reference:**
- Database operations (`src/db/port-allocations.ts`)
- Helper utilities for Claude integration
- Configuration template system

## 9. Migration Path

### Step 1: Schema Migration
```bash
psql $DATABASE_URL < migrations/007_add_port_allocations.sql
```

### Step 2: Import Existing Production Ports
Create `scripts/import-production-ports.ts`:
```typescript
// Parse docs/production-ports.md or similar
// Insert into remote_agent_port_allocations with environment='production'
```

### Step 3: Opt-in Rollout
- Environment variable: `ENABLE_PORT_MANAGEMENT=true`
- Initially available only via feature flag
- Gradual rollout to all users

### Step 4: Backfill Existing Worktrees
- Scan all active worktrees in database
- Allocate ports retroactively
- Send notification to conversation owners

## 10. Future Enhancements

### Phase 7: Advanced Features (Post-MVP)

1. **Port Health Monitoring**
   - Periodic checks for active processes
   - Alert on port conflicts
   - Integration with monitoring tools

2. **Port Sharing & Handoff**
   - Share worktree with port allocation
   - Transfer port ownership between conversations
   - Team-wide port visibility

3. **Smart Port Suggestion**
   - AI-driven port allocation based on service type
   - Learn from historical patterns
   - Avoid common conflict ports

4. **Integration with External Tools**
   - Export to Port Keeper format
   - Import from bendechrai devports
   - Sync with Archon knowledge base

5. **Web UI for Port Management**
   - Visual port range viewer
   - Interactive conflict resolution
   - Port utilization dashboards

---

## Critical Files for Implementation

The following files are most critical for implementing this port management integration:

1. **Database Schema** (CREATE NEW)
   - `/workspace/worktrees/scar/issue-6/migrations/007_add_port_allocations.sql`

2. **Database Operations** (CREATE NEW)
   - `/workspace/worktrees/scar/issue-6/src/db/port-allocations.ts`

3. **Command Handler** (MODIFY)
   - `/workspace/worktrees/scar/issue-6/src/handlers/command-handler.ts`

4. **Type Definitions** (MODIFY)
   - `/workspace/worktrees/scar/issue-6/src/types/index.ts`

5. **Environment Configuration** (MODIFY)
   - `/workspace/worktrees/scar/issue-6/.env.example`

6. **Worktree Handler** (MODIFY)
   - `/workspace/worktrees/scar/issue-6/src/handlers/worktree-handler.ts`

## Implementation Timeline

- **Week 1**: Core infrastructure (database, types, basic operations)
- **Week 2**: Command integration and worktree lifecycle hooks
- **Week 3**: Production tracking and advanced features
- **Week 4**: Testing, documentation, and rollout

Total estimated effort: **3-4 weeks** for full implementation and testing.
