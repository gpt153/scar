-- Migration 005: Add message history table for Web UI sync
-- Purpose: Store all messages (user, assistant, system) from both Telegram and Web platforms
-- This enables full conversation history display and seamless platform switching

-- Table for storing message history (both Telegram and Web)
CREATE TABLE IF NOT EXISTS remote_agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES remote_agent_conversations(id) ON DELETE CASCADE,
  sender VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  images JSONB, -- Array of image metadata (if any)
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_remote_agent_messages_conversation ON remote_agent_messages(conversation_id, created_at DESC);

-- Verify table creation
-- \d remote_agent_messages
