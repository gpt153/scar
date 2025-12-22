/**
 * Claude Agent SDK wrapper
 * Provides async generator interface for streaming Claude responses
 *
 * Type Safety Pattern:
 * - Uses `Options` type from SDK for query configuration
 * - SDK message types (SDKMessage, SDKAssistantMessage, etc.) have strict
 *   type checking that requires explicit type handling for content blocks
 * - Content blocks are typed via inline assertions for clarity
 */
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { IAssistantClient, MessageChunk, ImageAttachment } from '../types';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * MCP Server configuration types
 */
interface McpServerStdio {
  type: 'stdio';
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpServerHttp {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

type McpServer = McpServerStdio | McpServerHttp;

/**
 * Content block type for assistant messages
 * Represents text or tool_use blocks from Claude API responses
 */
interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * Generate a hash of MCP configuration for session validation
 * Returns a string representing the current MCP server setup
 */
export function getMcpConfigHash(): string {
  const config = {
    archon: process.env.ENABLE_ARCHON_MCP === 'true',
    playwright: process.env.ENABLE_PLAYWRIGHT_MCP === 'true',
    github: process.env.ENABLE_GITHUB_MCP === 'true',
    custom: process.env.MCP_HTTP_SERVERS || '',
  };
  return JSON.stringify(config);
}

/**
 * Build MCP server configuration from environment variables
 * Enables Archon, Playwright, and other MCP servers for bot-spawned Claude instances
 */
function buildMcpServers(): Record<string, McpServer> {
  const mcpServers: Record<string, McpServer> = {};

  // Archon MCP - Task management
  // Requires: Archon running via Docker on port 8051 (or custom port)
  // Set ENABLE_ARCHON_MCP=true and ARCHON_MCP_URL to enable
  if (process.env.ENABLE_ARCHON_MCP === 'true') {
    const url = process.env.ARCHON_MCP_URL || 'http://localhost:8051/mcp';
    const headers: Record<string, string> = {};

    if (process.env.ARCHON_TOKEN) {
      headers.Authorization = `Bearer ${process.env.ARCHON_TOKEN}`;
    }

    mcpServers.archon = {
      type: 'http',
      url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
    console.log(`[Claude] Archon MCP enabled (HTTP: ${url})`);
  }

  // Playwright MCP - Browser automation
  if (process.env.ENABLE_PLAYWRIGHT_MCP === 'true') {
    mcpServers.playwright = {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp'],
    };
    console.log('[Claude] Playwright MCP enabled');
  }

  // GitHub MCP - GitHub API integration
  if (process.env.ENABLE_GITHUB_MCP === 'true' && process.env.GITHUB_TOKEN) {
    mcpServers.github = {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      },
    };
    console.log('[Claude] GitHub MCP enabled');
  }

  // Custom HTTP MCP servers via environment variable
  // Format: MCP_HTTP_SERVERS=name1:url1:header1=value1,name2:url2
  if (process.env.MCP_HTTP_SERVERS) {
    const servers = process.env.MCP_HTTP_SERVERS.split(',');
    for (const serverConfig of servers) {
      const [name, url, ...headerPairs] = serverConfig.split(':');
      if (name && url) {
        const headers: Record<string, string> = {};
        for (const pair of headerPairs) {
          const [key, value] = pair.split('=');
          if (key && value) {
            headers[key] = value;
          }
        }
        mcpServers[name] = {
          type: 'http',
          url,
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
        };
        console.log(`[Claude] Custom HTTP MCP enabled: ${name}`);
      }
    }
  }

  return mcpServers;
}

/**
 * Claude AI assistant client
 * Implements generic IAssistantClient interface
 */
export class ClaudeClient implements IAssistantClient {
  /**
   * Send a query to Claude and stream responses
   * @param prompt - User message or prompt
   * @param cwd - Working directory for Claude
   * @param resumeSessionId - Optional session ID to resume
   */
  async *sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string,
    images?: ImageAttachment[]
  ): AsyncGenerator<MessageChunk> {
    // Build MCP server configuration
    const mcpServers = buildMcpServers();

    const options: Options = {
      cwd,
      env: {
        PATH: process.env.PATH,
        ...process.env,
      },
      mcpServers, // Enable MCP servers for bot-spawned Claude instances
      permissionMode: 'bypassPermissions', // YOLO mode - auto-approve all tools
      stderr: (data: string) => {
        // Capture and log Claude Code stderr - but filter out informational messages
        const output = data.trim();
        if (!output) return;

        // Only log actual errors, not informational messages
        // Filter out: "Spawning Claude Code process:", debug info, etc.
        const isError =
          output.toLowerCase().includes('error') ||
          output.toLowerCase().includes('fatal') ||
          output.toLowerCase().includes('failed') ||
          output.toLowerCase().includes('exception') ||
          output.includes('at ') || // Stack trace lines
          output.includes('Error:');

        const isInfoMessage =
          output.includes('Spawning Claude Code') ||
          output.includes('--output-format') ||
          output.includes('--permission-mode');

        if (isError && !isInfoMessage) {
          console.error(`[Claude stderr] ${output}`);
        }
      },
    };

    if (resumeSessionId) {
      options.resume = resumeSessionId;
      console.log(`[Claude] Resuming session: ${resumeSessionId}`);
    } else {
      console.log(`[Claude] Starting new session in ${cwd}`);
    }

    // Handle images by saving them to the working directory
    // Claude Code SDK can then reference these files
    let enhancedPrompt = prompt;
    if (images && images.length > 0) {
      const imageDir = join(cwd, '.screenshots');
      try {
        await mkdir(imageDir, { recursive: true });
      } catch (error) {
        console.warn('[Claude] Failed to create screenshots directory:', error);
      }

      const imagePaths: string[] = [];
      for (const image of images) {
        const filename = image.filename || `screenshot_${randomUUID()}.jpg`;
        const imagePath = join(imageDir, filename);

        try {
          await writeFile(imagePath, image.data);
          imagePaths.push(imagePath);
          console.log(`[Claude] Saved image to ${imagePath}`);
        } catch (error) {
          console.error(`[Claude] Failed to save image ${filename}:`, error);
        }
      }

      if (imagePaths.length > 0) {
        enhancedPrompt = `${prompt}\n\n📸 Screenshots attached (${imagePaths.length} image${imagePaths.length > 1 ? 's' : ''}):\n${imagePaths.map(p => `- ${p}`).join('\n')}\n\nPlease analyze the screenshot${imagePaths.length > 1 ? 's' : ''} using the Read tool to view the image${imagePaths.length > 1 ? 's' : ''}.`;
      }
    }

    try {
      for await (const msg of query({ prompt: enhancedPrompt, options })) {
        if (msg.type === 'assistant') {
          // Process assistant message content blocks
          // Type assertion needed: SDK's strict types require explicit handling
          const message = msg as { message: { content: ContentBlock[] } };
          const content = message.message.content;

          for (const block of content) {
            // Text blocks - assistant responses
            if (block.type === 'text' && block.text) {
              yield { type: 'assistant', content: block.text };
            }

            // Tool use blocks - tool calls
            else if (block.type === 'tool_use' && block.name) {
              yield {
                type: 'tool',
                toolName: block.name,
                toolInput: block.input ?? {},
              };
            }
          }
        } else if (msg.type === 'result') {
          // Extract session ID for persistence
          const resultMsg = msg as { session_id?: string };
          yield { type: 'result', sessionId: resultMsg.session_id };
        }
        // Ignore other message types (system, thinking, tool_result, etc.)
      }
    } catch (error) {
      console.error('[Claude] Query error:', error);
      throw error;
    }
  }

  /**
   * Get the assistant type identifier
   */
  getType(): string {
    return 'claude';
  }
}
