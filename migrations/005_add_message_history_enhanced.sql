-- Migration 005: Add message history table with explicit platform and project tagging
-- Purpose: Store conversation history for crash recovery and context continuity
-- Enhancement: Direct platform/codebase columns for easy tracing without joins

-- Table for storing message history with explicit tagging
CREATE TABLE IF NOT EXISTS remote_agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES remote_agent_conversations(id) ON DELETE CASCADE,

  -- Explicit tagging for traceability (denormalized for query performance)
  platform_type VARCHAR(20) NOT NULL,  -- 'github', 'telegram', 'cli', 'slack', 'discord', 'web'
  codebase_id UUID REFERENCES remote_agent_codebases(id) ON DELETE SET NULL,  -- Which project
  codebase_name VARCHAR(255),  -- Cached for easy display (e.g., "scar", "health-agent")

  -- Message content
  sender VARCHAR(20) NOT NULL,  -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  images JSONB,  -- Array of image metadata (if any): [{"filename": "...", "mimeType": "..."}]

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_remote_agent_messages_conversation
  ON remote_agent_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_remote_agent_messages_platform
  ON remote_agent_messages(platform_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_remote_agent_messages_codebase
  ON remote_agent_messages(codebase_id, created_at DESC);

-- Composite index for common query: "recent messages for this project on this platform"
CREATE INDEX IF NOT EXISTS idx_remote_agent_messages_project_platform
  ON remote_agent_messages(codebase_id, platform_type, created_at DESC);

COMMENT ON TABLE remote_agent_messages IS
  'Message history for crash recovery and context continuity.
   Messages are explicitly tagged with platform and codebase for traceability.';

COMMENT ON COLUMN remote_agent_messages.platform_type IS
  'Source platform: github, telegram, cli, slack, discord, web';

COMMENT ON COLUMN remote_agent_messages.codebase_name IS
  'Cached codebase name for display (denormalized for performance)';
