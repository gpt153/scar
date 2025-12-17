-- Migration 006: Add CLI events history table
-- Purpose: Store CLI execution events (tool calls, results, errors) for Web UI
-- This enables full execution history display and seamless platform switching

-- Table for storing CLI events history
CREATE TABLE IF NOT EXISTS remote_agent_cli_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES remote_agent_conversations(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'tool_call', 'tool_result', 'thinking', 'error', 'status', 'message'
  content TEXT NOT NULL,
  metadata JSONB, -- Tool name, args, exit code, duration, etc.
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_remote_agent_cli_events_conversation ON remote_agent_cli_events(conversation_id, created_at DESC);

-- Verify table creation
-- \d remote_agent_cli_events
