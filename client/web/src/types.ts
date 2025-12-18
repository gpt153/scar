export interface Topic {
  id: string;
  platform_type: string;
  platform_conversation_id: string;
  codebase_id: string | null;
  codebase_name: string | null;
  cwd: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  images?: Array<{ filename: string; mimeType: string }>;
  created_at: string;
}

export interface WebSocketMessage {
  conversationId: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: string;
}

export interface CLIEvent {
  id: string;
  timestamp: string;
  type: 'message' | 'tool_call' | 'tool_result' | 'thinking' | 'error' | 'status';
  content: string;
  metadata?: {
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    exitCode?: number;
    duration?: number;
  };
}
