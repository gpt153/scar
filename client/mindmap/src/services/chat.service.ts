import Anthropic from '@anthropic-ai/sdk';
import type { MindMapContext } from '@/types/mindmap.types';

/**
 * Chat service abstraction for AI conversations
 * Allows swapping between direct Claude API (MVP) and remote-coding-agent backend (future)
 */

export interface ChatService {
  sendMessage(
    message: string,
    context: MindMapContext,
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string>;
  streamResponse(
    message: string,
    context: MindMapContext,
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): AsyncGenerator<string, void, unknown>;
}

/**
 * Direct Claude API implementation (MVP)
 * TODO: Move API key to environment variable or backend
 */
export class DirectClaudeChat implements ChatService {
  private client: Anthropic;
  private systemPrompt: string;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    this.systemPrompt = `You are an AI assistant for interactive mind mapping of software projects.

**YOUR PRIMARY GOAL**: Help users build a visual mind map by creating nodes as they describe their project.

**CRITICAL BEHAVIOR**: When the user describes ANY features, components, or parts of their project, you MUST output JSON to create nodes. Be proactive - don't wait to be asked!

**How to create nodes** - Output this EXACT format in a code block:

\`\`\`json
{
  "action": "create_nodes",
  "nodes": [
    {
      "label": "Short Feature Name",
      "description": "Detailed description of what this does"
    }
  ]
}
\`\`\`

**Examples of when to CREATE nodes:**

User: "I need authentication, a dashboard, and user settings"
You: Great! Let me create those features for you.

\`\`\`json
{
  "action": "create_nodes",
  "nodes": [
    {"label": "Authentication", "description": "User login and session management"},
    {"label": "Dashboard", "description": "Main user interface with overview"},
    {"label": "User Settings", "description": "User preferences and account management"}
  ]
}
\`\`\`

---

User: "What would I need for a todo app?"
You: A todo app typically needs these core components:

\`\`\`json
{
  "action": "create_nodes",
  "nodes": [
    {"label": "Task Management", "description": "Create, edit, delete tasks"},
    {"label": "Task Lists", "description": "Organize tasks into lists/projects"},
    {"label": "User Accounts", "description": "Save tasks per user"}
  ]
}
\`\`\`

---

User: "Break down the authentication feature"
You: [User selected the "Authentication" node, so create child nodes under it]

\`\`\`json
{
  "action": "create_nodes",
  "nodes": [
    {"label": "Login Flow", "description": "Email/password authentication"},
    {"label": "Registration", "description": "New user signup"},
    {"label": "Password Reset", "description": "Forgot password functionality"},
    {"label": "Session Management", "description": "JWT token handling"}
  ]
}
\`\`\`

**When NOT to create nodes:**
- User is just chatting: "How's it going?"
- Asking for general advice: "What's the best database?"
- Clarifying existing nodes: "Tell me more about authentication"

**Key Rules:**
1. **Be proactive** - Create nodes when features are mentioned, even if user doesn't explicitly ask
2. **Keep labels short** - 2-5 words max for node labels
3. **Make descriptions detailed** - Explain what the feature does
4. **You can add explanatory text** before/after the JSON to guide the user

Remember: The user is building a visual mind map. Your job is to help them see their project structure!`;
  }

  async sendMessage(
    message: string,
    context: MindMapContext,
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const contextPrompt = this.buildContextPrompt(context);

    // Build message history including context in first message
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (chatHistory && chatHistory.length > 0) {
      // Add previous conversation history
      messages.push(...chatHistory);
    }

    // Add current message (with context if this is the first message)
    if (messages.length === 0) {
      messages.push({
        role: 'user',
        content: `${contextPrompt}\n\n${message}`,
      });
    } else {
      messages.push({
        role: 'user',
        content: message,
      });
    }

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: this.systemPrompt,
      messages,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text;
    }

    return 'Sorry, I could not process that request.';
  }

  async *streamResponse(
    message: string,
    context: MindMapContext,
    chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): AsyncGenerator<string, void, unknown> {
    const contextPrompt = this.buildContextPrompt(context);

    // Build message history including context in first message
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (chatHistory && chatHistory.length > 0) {
      // Add previous conversation history
      messages.push(...chatHistory);
    }

    // Add current message (with context if this is the first message)
    if (messages.length === 0) {
      messages.push({
        role: 'user',
        content: `${contextPrompt}\n\n${message}`,
      });
    } else {
      messages.push({
        role: 'user',
        content: message,
      });
    }

    const stream = await this.client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: this.systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    }
  }

  private buildContextPrompt(context: MindMapContext): string {
    let prompt = 'Current Context:\n';

    if (context.currentNode) {
      prompt += `\nSelected Node: "${context.currentNode.label}"\n`;
      prompt += `Description: ${context.currentNode.description}\n`;
    }

    if (context.parentNode) {
      prompt += `\nParent Node: "${context.parentNode.label}"\n`;
    }

    if (context.childNodes.length > 0) {
      prompt += `\nExisting Child Nodes:\n`;
      context.childNodes.forEach(child => {
        prompt += `- ${child.label}\n`;
      });
    }

    return prompt;
  }
}

/**
 * Future implementation: Remote-coding-agent backend
 * Will call Express server instead of Claude API directly
 */
export class RemoteAgentChat implements ChatService {
  async sendMessage(
    _message: string,
    _context: MindMapContext,
    _chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    // Future: POST to http://localhost:3000/api/mindmap/chat
    throw new Error('Not implemented - use DirectClaudeChat for MVP');
  }

  async *streamResponse(
    _message: string,
    _context: MindMapContext,
    _chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): AsyncGenerator<string, void, unknown> {
    // Future: WebSocket connection to remote-coding-agent
    throw new Error('Not implemented - use DirectClaudeChat for MVP');
    yield ''; // Make TypeScript happy
  }
}

// Get API key from environment variable
const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY || '';

if (!CLAUDE_API_KEY) {
  console.warn('VITE_CLAUDE_API_KEY not set - chat functionality will not work');
}

// Export singleton instance
export const chatService: ChatService = new DirectClaudeChat(CLAUDE_API_KEY);
