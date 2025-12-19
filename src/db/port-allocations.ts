/**
 * Port allocation database operations
 * Manages port assignments across dev, production, and test environments
 */

import { pool } from './connection';
import { PortAllocation, PortAllocationRequest, PortAllocationFilters } from '../types';

// Port range configuration (configurable via environment variables)
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
const RESERVED_PORTS_STR = process.env.RESERVED_PORTS ?? '3000,5432,8051,8181,3737';
const RESERVED_PORTS = new Set(RESERVED_PORTS_STR.split(',').map((p: string) => parseInt(p.trim())));

/**
 * Allocate a port for a service
 */
export async function allocatePort(request: PortAllocationRequest): Promise<PortAllocation> {
  const { service_name, description, environment, preferred_port, codebase_id, conversation_id, worktree_path } = request;

  let port: number;

  if (preferred_port) {
    // Check if preferred port is available
    const existing = await getPortAllocation(preferred_port);
    if (existing && existing.status !== 'released') {
      throw new Error(`Port ${preferred_port} is already allocated to ${existing.service_name}`);
    }
    if (RESERVED_PORTS.has(preferred_port)) {
      throw new Error(`Port ${preferred_port} is reserved and cannot be allocated`);
    }
    port = preferred_port;
  } else {
    // Find next available port in range
    const availablePort = await findAvailablePort(environment);
    if (!availablePort) {
      throw new Error(`No available ports in ${environment} range (${PORT_RANGES[environment].start}-${PORT_RANGES[environment].end})`);
    }
    port = availablePort;
  }

  // Insert port allocation
  const result = await pool.query<PortAllocation>(
    `INSERT INTO remote_agent_port_allocations
      (port, service_name, description, codebase_id, conversation_id, worktree_path, environment, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'allocated')
    RETURNING *`,
    [port, service_name, description || null, codebase_id || null, conversation_id || null, worktree_path || null, environment]
  );

  return result.rows[0];
}

/**
 * Release a port allocation
 */
export async function releasePort(port: number): Promise<boolean> {
  const result = await pool.query(
    `UPDATE remote_agent_port_allocations
    SET status = 'released', released_at = NOW()
    WHERE port = $1 AND status != 'released'
    RETURNING id`,
    [port]
  );

  return result.rowCount > 0;
}

/**
 * Find an available port in the specified environment range
 */
export async function findAvailablePort(environment: 'dev' | 'production' | 'test', startFrom?: number): Promise<number | null> {
  const range = PORT_RANGES[environment];
  const start = startFrom || range.start;

  // Get all allocated ports in this environment
  const result = await pool.query<{ port: number }>(
    `SELECT port FROM remote_agent_port_allocations
    WHERE environment = $1 AND status != 'released'
    ORDER BY port`,
    [environment]
  );

  const allocatedPorts = new Set(result.rows.map((r: { port: number }) => r.port));

  // Find first available port
  for (let port = start; port <= range.end; port++) {
    if (!allocatedPorts.has(port) && !RESERVED_PORTS.has(port)) {
      return port;
    }
  }

  return null;
}

/**
 * Get port allocation details
 */
export async function getPortAllocation(port: number): Promise<PortAllocation | null> {
  const result = await pool.query<PortAllocation>(
    'SELECT * FROM remote_agent_port_allocations WHERE port = $1',
    [port]
  );

  return result.rows[0] || null;
}

/**
 * List port allocations with optional filters
 */
export async function listAllocations(filters?: PortAllocationFilters): Promise<PortAllocation[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters?.codebase_id) {
    conditions.push(`codebase_id = $${paramIndex++}`);
    params.push(filters.codebase_id);
  }

  if (filters?.conversation_id) {
    conditions.push(`conversation_id = $${paramIndex++}`);
    params.push(filters.conversation_id);
  }

  if (filters?.worktree_path) {
    conditions.push(`worktree_path = $${paramIndex++}`);
    params.push(filters.worktree_path);
  }

  if (filters?.environment) {
    conditions.push(`environment = $${paramIndex++}`);
    params.push(filters.environment);
  }

  if (filters?.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `SELECT * FROM remote_agent_port_allocations ${whereClause} ORDER BY port`;

  const result = await pool.query<PortAllocation>(query, params);
  return result.rows;
}

/**
 * Get all ports allocated to a codebase
 */
export async function getPortsByCodebase(codebaseId: string): Promise<PortAllocation[]> {
  return listAllocations({ codebase_id: codebaseId });
}

/**
 * Get all ports allocated to a worktree
 */
export async function getPortsByWorktree(worktreePath: string): Promise<PortAllocation[]> {
  return listAllocations({ worktree_path: worktreePath });
}

/**
 * Check if a port is currently in use (allocated or active)
 */
export async function checkPortConflicts(port: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM remote_agent_port_allocations
    WHERE port = $1 AND status != 'released'`,
    [port]
  );

  return parseInt(result.rows[0].count) > 0;
}

/**
 * Update port status
 */
export async function updatePortStatus(port: number, status: 'allocated' | 'active' | 'released'): Promise<void> {
  const updates: string[] = ['status = $1', 'last_checked = NOW()'];
  const params: any[] = [status, port];

  if (status === 'released') {
    updates.push('released_at = NOW()');
  }

  await pool.query(
    `UPDATE remote_agent_port_allocations
    SET ${updates.join(', ')}
    WHERE port = $2`,
    params
  );
}

/**
 * Cleanup stale allocations (orphaned worktrees, old released ports)
 */
export async function cleanupStaleAllocations(): Promise<number> {
  // Delete released ports older than 30 days
  const deleteOldResult = await pool.query(
    `DELETE FROM remote_agent_port_allocations
    WHERE status = 'released' AND released_at < NOW() - INTERVAL '30 days'
    RETURNING id`
  );

  let deletedCount = deleteOldResult.rowCount;

  // Check for orphaned worktrees (worktree_path set but directory doesn't exist)
  const worktreeAllocations = await pool.query<{ id: string; port: number; worktree_path: string }>(
    `SELECT id, port, worktree_path FROM remote_agent_port_allocations
    WHERE worktree_path IS NOT NULL AND status != 'released'`
  );

  // Import fs/promises for filesystem checks
  const { access } = await import('fs/promises');
  const { constants } = await import('fs');

  for (const allocation of worktreeAllocations.rows) {
    try {
      // Check if worktree path exists
      await access(allocation.worktree_path, constants.F_OK);
    } catch {
      // Path doesn't exist - release the orphaned port
      await pool.query(
        `UPDATE remote_agent_port_allocations
        SET status = 'released', released_at = NOW()
        WHERE id = $1`,
        [allocation.id]
      );
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Get port range utilization statistics
 */
export async function getPortRangeUtilization(environment: 'dev' | 'production' | 'test'): Promise<{
  environment: string;
  total: number;
  allocated: number;
  available: number;
  utilizationPercent: number;
}> {
  const range = PORT_RANGES[environment];
  const total = range.end - range.start + 1;

  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM remote_agent_port_allocations
    WHERE environment = $1 AND status != 'released'`,
    [environment]
  );

  const allocated = parseInt(result.rows[0].count);
  const available = total - allocated;
  const utilizationPercent = (allocated / total) * 100;

  return {
    environment,
    total,
    allocated,
    available,
    utilizationPercent: Math.round(utilizationPercent * 100) / 100,
  };
}
