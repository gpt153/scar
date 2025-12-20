-- Remote Coding Agent - Add Docker Configuration
-- Version: 008
-- Description: Add docker_config JSONB column to codebases for Docker management

-- Add docker_config column to codebases table
ALTER TABLE remote_agent_codebases
ADD COLUMN IF NOT EXISTS docker_config JSONB DEFAULT NULL;

-- Add comment explaining the column
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

-- Create index for quickly finding Docker-enabled codebases
CREATE INDEX IF NOT EXISTS idx_remote_agent_codebases_docker_enabled
ON remote_agent_codebases((docker_config->>'enabled'))
WHERE docker_config IS NOT NULL;
