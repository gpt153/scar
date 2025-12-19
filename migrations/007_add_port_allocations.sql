-- Migration 007: Add port allocation tracking for SCAR
-- This enables centralized port management across dev, production, and test environments

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

-- Indexes for efficient queries
CREATE INDEX idx_port_allocations_codebase ON remote_agent_port_allocations(codebase_id);
CREATE INDEX idx_port_allocations_worktree ON remote_agent_port_allocations(worktree_path);
CREATE INDEX idx_port_allocations_status ON remote_agent_port_allocations(status);
CREATE INDEX idx_port_allocations_environment ON remote_agent_port_allocations(environment);

-- Comment on table
COMMENT ON TABLE remote_agent_port_allocations IS 'Tracks port allocations across development worktrees and production services to prevent conflicts';
