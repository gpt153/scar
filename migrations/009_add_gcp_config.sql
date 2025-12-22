-- Remote Coding Agent - Add GCP Cloud Run Configuration
-- Version: 009
-- Description: Add gcp_config JSONB column to codebases for Cloud Run deployment

-- Add gcp_config column to codebases table
ALTER TABLE remote_agent_codebases
ADD COLUMN IF NOT EXISTS gcp_config JSONB DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN remote_agent_codebases.gcp_config IS
  'GCP Cloud Run configuration for deploying services. Format:
  {
    "enabled": boolean,
    "project_id": string (e.g., "openhorizon-cc"),
    "region": string (e.g., "europe-west1"),
    "service_name": string (Cloud Run service name),
    "env_vars_file": string (path to env file for Cloud Run),
    "container_registry": "gcr" | "artifact-registry" (default: gcr),
    "registry_url": string (optional override, e.g., "europe-west1-docker.pkg.dev"),
    "build_config": {
      "dockerfile": string (path to Dockerfile, default: "Dockerfile"),
      "context": string (build context path, default: "."),
      "build_args": object (build arguments)
    },
    "service_config": {
      "memory": string (e.g., "1Gi"),
      "cpu": string (e.g., "1"),
      "timeout": number (request timeout in seconds),
      "max_instances": number,
      "min_instances": number,
      "concurrency": number (requests per container),
      "ingress": "all" | "internal" | "internal-and-cloud-load-balancing"
    },
    "deploy": {
      "auto_deploy": boolean (deploy on push to main),
      "pre_deploy_command": string (optional),
      "post_deploy_command": string (optional)
    }
  }';

-- Create index for quickly finding GCP-enabled codebases
CREATE INDEX IF NOT EXISTS idx_remote_agent_codebases_gcp_enabled
ON remote_agent_codebases((gcp_config->>'enabled'))
WHERE gcp_config IS NOT NULL;
