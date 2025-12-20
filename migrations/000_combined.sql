-- Remote Coding Agent - Combined Schema
-- Version: Combined (includes migrations 001-004)
-- Description: Complete database schema (idempotent - safe to run multiple times)

-- ============================================================================
-- Migration 001: Initial Schema
-- ============================================================================

-- Table 1: Codebases
CREATE TABLE IF NOT EXISTS remote_agent_codebases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  repository_url VARCHAR(500),
  default_cwd VARCHAR(500) NOT NULL,
  ai_assistant_type VARCHAR(20) DEFAULT 'claude',
  commands JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table 2: Conversations
CREATE TABLE IF NOT EXISTS remote_agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_type VARCHAR(20) NOT NULL,
  platform_conversation_id VARCHAR(255) NOT NULL,
  codebase_id UUID REFERENCES remote_agent_codebases(id),
  cwd VARCHAR(500),
  ai_assistant_type VARCHAR(20) DEFAULT 'claude',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(platform_type, platform_conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_remote_agent_conversations_codebase ON remote_agent_conversations(codebase_id);

-- Table 3: Sessions
CREATE TABLE IF NOT EXISTS remote_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES remote_agent_conversations(id) ON DELETE CASCADE,
  codebase_id UUID REFERENCES remote_agent_codebases(id),
  ai_assistant_type VARCHAR(20) NOT NULL,
  assistant_session_id VARCHAR(255),
  active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_remote_agent_sessions_conversation ON remote_agent_sessions(conversation_id, active);
CREATE INDEX IF NOT EXISTS idx_remote_agent_sessions_codebase ON remote_agent_sessions(codebase_id);

-- ============================================================================
-- Migration 002: Command Templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS remote_agent_command_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remote_agent_command_templates_name ON remote_agent_command_templates(name);

-- ============================================================================
-- Migration 003: Add Worktree Support
-- ============================================================================

ALTER TABLE remote_agent_conversations
ADD COLUMN IF NOT EXISTS worktree_path VARCHAR(500);

COMMENT ON COLUMN remote_agent_conversations.worktree_path IS
  'Path to git worktree for this conversation. If set, AI works here instead of cwd.';

-- ============================================================================
-- Migration 004: Worktree Sharing Index
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_remote_agent_conversations_worktree
ON remote_agent_conversations(worktree_path)
WHERE worktree_path IS NOT NULL;

-- ============================================================================
-- Migration 008: Add Docker Configuration
-- ============================================================================

ALTER TABLE remote_agent_codebases
ADD COLUMN IF NOT EXISTS docker_config JSONB DEFAULT NULL;

COMMENT ON COLUMN remote_agent_codebases.docker_config IS
  'Docker configuration for managing production containers. Format:
  {
    "enabled": boolean,
    "compose_project": string (e.g., "po"),
    "compose_file": string (path to docker-compose.yml),
    "containers": {
      "container_name": {
        "service": string (compose service name),
        "health_check_url": string (optional),
        "restart_policy": "auto" | "manual" | "never"
      }
    },
    "deploy": {
      "auto_deploy": boolean,
      "deploy_on_merge": boolean,
      "build_command": string (optional custom build),
      "pre_deploy_command": string (optional),
      "post_deploy_command": string (optional)
    }
  }';

CREATE INDEX IF NOT EXISTS idx_remote_agent_codebases_docker_enabled
ON remote_agent_codebases((docker_config->>'enabled'))
WHERE docker_config IS NOT NULL;
