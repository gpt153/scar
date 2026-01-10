/**
 * Core type definitions for the Remote Coding Agent platform
 */

export interface Conversation {
  id: string;
  platform_type: string;
  platform_conversation_id: string;
  codebase_id: string | null;
  cwd: string | null;
  worktree_path: string | null;
  ai_assistant_type: string;
  created_at: Date;
  updated_at: Date;
}

export interface Codebase {
  id: string;
  name: string;
  repository_url: string | null;
  default_cwd: string;
  ai_assistant_type: string;
  commands: Record<string, { path: string; description: string }>;
  port_config?: {
    primary_port?: number;
    service_ports?: Record<string, number>;
  };
  docker_config?: DockerConfig;
  gcp_config?: GCPConfig;
  created_at: Date;
  updated_at: Date;
}

/**
 * Docker configuration for managing production containers
 */
export interface DockerConfig {
  enabled: boolean;
  compose_project: string;
  compose_file: string;
  containers: Record<string, ContainerConfig>;
  deploy?: DeployConfig;
}

export interface ContainerConfig {
  service: string;
  health_check_url?: string;
  restart_policy: 'auto' | 'manual' | 'never';
}

export interface DeployConfig {
  auto_deploy: boolean;
  deploy_on_merge: boolean;
  build_command?: string;
  pre_deploy_command?: string;
  post_deploy_command?: string;
}

export interface Session {
  id: string;
  conversation_id: string;
  codebase_id: string | null;
  ai_assistant_type: string;
  assistant_session_id: string | null;
  active: boolean;
  metadata: Record<string, unknown>;
  started_at: Date;
  ended_at: Date | null;
}

export interface CommandTemplate {
  id: string;
  name: string;
  description: string | null;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface CommandResult {
  success: boolean;
  message: string;
  modified?: boolean; // Indicates if conversation state was modified
  archonFollowup?: {
    // Archon project creation needed after command completes
    projectName: string;
    githubUrl: string;
    workspacePath: string;
    codebaseId: string;
  };
}

/**
 * Generic platform adapter interface
 * Allows supporting multiple platforms (Telegram, Slack, GitHub, etc.)
 */
export interface IPlatformAdapter {
  /**
   * Send a message to the platform
   */
  sendMessage(conversationId: string, message: string): Promise<void>;

  /**
   * Get the configured streaming mode
   */
  getStreamingMode(): 'stream' | 'batch';

  /**
   * Get the platform type identifier (e.g., 'telegram', 'github', 'slack')
   */
  getPlatformType(): string;

  /**
   * Start the platform adapter (e.g., begin polling, start webhook server)
   */
  start(): Promise<void>;

  /**
   * Stop the platform adapter gracefully
   */
  stop(): void;
}

/**
 * Image attachment for AI assistant
 */
export interface ImageAttachment {
  data: Buffer; // Image file data
  mimeType: string; // e.g., 'image/jpeg', 'image/png'
  filename?: string; // Optional filename
}

/**
 * Message chunk from AI assistant
 */
export interface MessageChunk {
  type: 'assistant' | 'result' | 'system' | 'tool' | 'thinking';
  content?: string;
  sessionId?: string;

  // For tool calls
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

/**
 * Generic AI assistant client interface
 * Allows supporting multiple AI assistants (Claude, Codex, etc.)
 */
export interface IAssistantClient {
  /**
   * Send a message and get streaming response
   * @param prompt - User message or prompt
   * @param cwd - Working directory for the assistant
   * @param resumeSessionId - Optional session ID to resume
   * @param images - Optional array of image attachments
   */
  sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string,
    images?: ImageAttachment[]
  ): AsyncGenerator<MessageChunk>;

  /**
   * Get the assistant type identifier
   */
  getType(): string;
}

/**
 * Port allocation tracking
 */
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

export interface PortAllocationFilters {
  codebase_id?: string;
  conversation_id?: string;
  worktree_path?: string;
  environment?: 'dev' | 'production' | 'test';
  status?: 'allocated' | 'active' | 'released';
}

/**
 * GCP Cloud Run configuration
 */
export interface GCPConfig {
  enabled: boolean;
  project_id: string;
  region: string;
  service_name: string;
  env_vars_file?: string;
  container_registry?: 'gcr' | 'artifact-registry';
  registry_url?: string;
  build_config?: {
    dockerfile?: string;
    context?: string;
    build_args?: Record<string, string>;
  };
  service_config?: {
    memory?: string;
    cpu?: string;
    timeout?: number;
    max_instances?: number;
    min_instances?: number;
    concurrency?: number;
    ingress?: 'all' | 'internal' | 'internal-and-cloud-load-balancing';
  };
  deploy?: {
    auto_deploy?: boolean;
    pre_deploy_command?: string;
    post_deploy_command?: string;
  };
}

/**
 * Cloud Run service status
 */
export interface CloudRunService {
  name: string;
  region: string;
  url: string;
  ready: boolean;
  latestRevision: string;
  latestDeployed: Date;
  image: string;
  traffic: {
    revision: string;
    percent: number;
  }[];
  conditions: {
    type: string;
    status: string;
    message?: string;
  }[];
}

/**
 * Cloud Run deployment result
 */
export interface CloudRunDeploymentResult {
  success: boolean;
  message: string;
  serviceUrl?: string;
  revision?: string;
  steps: {
    build: boolean;
    push: boolean;
    deploy: boolean;
  };
  errors: string[];
}
