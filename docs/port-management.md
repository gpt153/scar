# Port Management

SCAR includes a centralized port registry to prevent port conflicts across development worktrees and production services.

## Overview

The port management system tracks port allocations persistently in a PostgreSQL database, ensuring:
- No port conflicts between worktrees
- Clear visibility of port usage across environments
- Automatic port allocation for new services
- Production port documentation

## Port Ranges

By default, SCAR uses the following port ranges:

| Environment | Range | Default Start | Default End |
|------------|-------|---------------|-------------|
| Development | 1000 ports | 8000 | 8999 |
| Production | 1000 ports | 9000 | 9999 |
| Test | 1000 ports | 7000 | 7999 |

These ranges are configurable via environment variables (see Configuration below).

## Reserved Ports

The following ports are reserved and will never be auto-allocated:
- `3000` - SCAR main application
- `5432` - PostgreSQL database
- `8051` - Archon MCP server
- `8181` - Archon REST API
- `3737` - Archon Frontend

## Available Commands

### `/port-allocate`

Allocate a port for a service.

**Usage:**
```
/port-allocate <service-name> [environment] [preferred-port]
```

**Parameters:**
- `service-name` (required): Name of the service
- `environment` (optional): `dev` (default), `production`, or `test`
- `preferred-port` (optional): Specific port to allocate (if available)

**Examples:**
```bash
# Allocate next available dev port
/port-allocate api-server

# Allocate production port
/port-allocate web-app production

# Request specific port
/port-allocate frontend dev 8080
```

**Output:**
```
✅ Port allocated!

Port: 8001
Service: api-server
Environment: dev

Use: PORT=8001 npm run dev
```

### `/port-list`

List port allocations with various filters.

**Usage:**
```
/port-list [--worktree] [--codebase] [--environment <env>] [--all]
```

**Flags:**
- `--worktree`: Show ports for current worktree
- `--codebase`: Show ports for current codebase
- `--environment <env>`: Filter by environment (dev/production/test)
- `--all`: Show all port allocations (system-wide)

**Examples:**
```bash
# List ports for current conversation
/port-list

# List all dev ports
/port-list --environment dev

# List ports for current worktree
/port-list --worktree

# List all ports system-wide
/port-list --all
```

**Output:**
```
📋 Port Allocations:

🟢 Port 8001 - api-server (dev)
   Test API server
🟢 Port 8002 - frontend (dev)
🔴 Port 8003 - worker (dev)
```

**Status Icons:**
- 🟢 Allocated (active)
- 🟡 In use (process detected)
- 🔴 Released

### `/port-release`

Release a port allocation.

**Usage:**
```
/port-release <port>
```

**Example:**
```bash
/port-release 8001
```

**Output:**
```
✅ Port 8001 released successfully
```

### `/port-check`

Check if a port is available or get allocation details.

**Usage:**
```
/port-check <port>
```

**Example:**
```bash
/port-check 8080
```

**Output (if allocated):**
```
🟢 Port 8080 Information:

Service: api-server
Status: allocated
Environment: dev
Description: Test API server
Allocated: 12/19/2025, 3:45:00 PM
```

**Output (if available):**
```
✅ Port 8080 is available
```

### `/port-stats`

View port range utilization statistics.

**Usage:**
```
/port-stats [environment]
```

**Example:**
```bash
/port-stats dev
```

**Output:**
```
📊 Port Range Statistics (dev):

Total Ports: 1000
Allocated: 15
Available: 985
Utilization: 1.5%
```

With warning when utilization is high:
```
⚠️ Warning: dev port range is 85% full!
```

### `/port-cleanup`

Clean up stale port allocations including:
- Released ports older than 30 days
- Orphaned worktree allocations (worktree deleted outside SCAR)

**Usage:**
```
/port-cleanup [--dry-run]
```

**Flags:**
- `--dry-run`: Preview what would be cleaned without making changes

**Example:**
```bash
# Preview cleanup
/port-cleanup --dry-run

# Perform cleanup
/port-cleanup
```

**Output:**
```
✅ Cleaned up 5 stale port allocation(s)
```

**What gets cleaned:**
- Ports marked as "released" more than 30 days ago
- Ports allocated to worktrees that no longer exist on filesystem
- Both types are automatically detected and removed

## Worktree Integration

SCAR automatically manages ports for worktrees:

### Automatic Allocation

When you create a worktree, a development port is automatically allocated:

```bash
/worktree create feature-api
```

Output includes the allocated port:
```
Worktree created!

Branch: feature-api
Path: scar-issue-6-feature-api
Allocated Port: 8124

Use: PORT=8124 npm run dev
```

### Automatic Cleanup

When you remove a worktree, all associated ports are automatically released:

```bash
/worktree remove
```

This ensures no orphaned port allocations.

## Configuration

Configure port ranges and behavior via environment variables in `.env`:

```env
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

## Common Workflows

### Multi-Service Development

When working with multiple services in a worktree:

```bash
# Create worktree (auto-allocates primary port)
/worktree create feature-microservices

# Allocate additional ports for each service
/port-allocate api-server dev
/port-allocate frontend dev
/port-allocate worker dev

# View all allocated ports
/port-list --worktree

# Generate docker-compose with ports
# (Claude will help create config files with allocated ports)
```

### Port Conflict Resolution

If a service fails to start due to port conflict:

```bash
# Check what's using the port
/port-check 8080

# If allocated to another service, release it
/port-release 8080

# Or allocate a different port
/port-allocate my-service dev
```

### Production Port Documentation

Register production services for tracking:

```bash
# Register production services
/port-allocate nginx production 443
/port-allocate api production 9000
/port-allocate web production 9001

# View all production ports
/port-list --environment production
```

## Database Schema

Port allocations are stored in the `remote_agent_port_allocations` table:

```sql
CREATE TABLE remote_agent_port_allocations (
  id UUID PRIMARY KEY,
  port INTEGER NOT NULL UNIQUE,
  service_name VARCHAR(255) NOT NULL,
  description TEXT,
  codebase_id UUID REFERENCES remote_agent_codebases(id),
  conversation_id UUID REFERENCES remote_agent_conversations(id),
  worktree_path VARCHAR(500),
  environment VARCHAR(20) CHECK (environment IN ('dev', 'production', 'test')),
  status VARCHAR(20) CHECK (status IN ('allocated', 'active', 'released')),
  allocated_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP,
  last_checked TIMESTAMP,
  process_id INTEGER
);
```

## Troubleshooting

### Port Range Exhaustion

If you run out of ports in a range:

1. Check utilization: `/port-stats dev`
2. Clean up stale allocations: `/port-cleanup`
3. Release unused ports manually
4. Consider expanding the port range in `.env`

### Orphaned Allocations

If a worktree is deleted outside SCAR, ports may remain allocated:

1. List all ports: `/port-list --all`
2. Identify orphaned allocations
3. Release manually: `/port-release <port>`
4. Or run cleanup: `/port-cleanup`

### Conflict with External Tools

If an external tool is using a port in SCAR's range:

1. Add it to `RESERVED_PORTS` in `.env`
2. Restart SCAR to reload configuration
3. Or choose a different port range

## Future Enhancements

Planned features for future releases:

- **Port Health Monitoring**: Periodic checks for active processes
- **Smart Port Suggestion**: AI-driven allocation based on service type
- **Port Sharing**: Team-wide port visibility and coordination
- **Web UI**: Visual port range viewer and management dashboard
- **External Tool Integration**: Import/export to other port management tools
