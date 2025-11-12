/**
 * Codex SDK wrapper
 * Provides async generator interface for streaming Codex responses
 */
import { IAssistantClient, MessageChunk } from '../types';

// Type definition for Codex SDK (ESM import)
type CodexSDK = typeof import('@openai/codex-sdk');
type Codex = InstanceType<CodexSDK['Codex']>;

// Singleton Codex instance
let codexInstance: Codex | null = null;
let CodexClass: CodexSDK['Codex'] | null = null;

// Dynamic import that bypasses TypeScript transpilation
// This prevents TS from converting import() to require() when module=commonjs
const importDynamic = new Function('modulePath', 'return import(modulePath)');

/**
 * Get or create Codex SDK instance (uses dynamic import for ESM compatibility)
 */
async function getCodex(): Promise<Codex> {
  if (!codexInstance) {
    if (!CodexClass) {
      // Dynamic import to handle ESM-only package (bypasses TS transpilation)
      const { Codex: ImportedCodex } = await importDynamic('@openai/codex-sdk') as CodexSDK;
      CodexClass = ImportedCodex;
    }
    codexInstance = new CodexClass();
  }
  return codexInstance;
}

/**
 * Codex AI assistant client
 * Implements generic IAssistantClient interface
 */
export class CodexClient implements IAssistantClient {
  /**
   * Send a query to Codex and stream responses
   * @param prompt - User message or prompt
   * @param cwd - Working directory for Codex
   * @param resumeSessionId - Optional thread ID to resume
   */
  async *sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<MessageChunk> {
    const codex = await getCodex();

    // Get or create thread (synchronous operations!)
    let thread;
    if (resumeSessionId) {
      console.log(`[Codex] Resuming thread: ${resumeSessionId}`);
      try {
        // NOTE: resumeThread is synchronous, not async
        // IMPORTANT: Must pass options when resuming!
        thread = codex.resumeThread(resumeSessionId, {
          workingDirectory: cwd,
          skipGitRepoCheck: true,
        });
      } catch (error) {
        console.error(`[Codex] Failed to resume thread ${resumeSessionId}, creating new one:`, error);
        // Fall back to creating new thread
        thread = codex.startThread({
          workingDirectory: cwd,
          skipGitRepoCheck: true,
        });
      }
    } else {
      console.log(`[Codex] Starting new thread in ${cwd}`);
      // NOTE: startThread is synchronous, not async
      thread = codex.startThread({
        workingDirectory: cwd,
        skipGitRepoCheck: true,
      });
    }

    try {
      // Run streamed query (this IS async)
      const result = await thread.runStreamed(prompt);

      // Process streaming events
      for await (const event of result.events) {
        // Handle error events
        if (event.type === 'error') {
          console.error('[Codex] Stream error:', event.message);
          // Don't send MCP timeout errors (they're optional)
          if (!event.message.includes('MCP client')) {
            yield { type: 'system', content: `⚠️ ${event.message}` };
          }
          continue;
        }

        // Handle turn failed events
        if (event.type === 'turn.failed') {
          console.error('[Codex] Turn failed:', event.error?.message);
          yield {
            type: 'system',
            content: `❌ Turn failed: ${event.error?.message || 'Unknown error'}`,
          };
          break;
        }

        // Handle item.completed events - map to MessageChunk types
        if (event.type === 'item.completed') {
          const item = event.item;

          switch (item.type) {
            case 'agent_message':
              // Agent text response
              if (item.text) {
                yield { type: 'assistant', content: item.text };
              }
              break;

            case 'command_execution':
              // Tool/command execution
              if (item.command) {
                yield { type: 'tool', toolName: item.command };
              }
              break;

            case 'reasoning':
              // Agent reasoning/thinking
              if (item.text) {
                yield { type: 'thinking', content: item.text };
              }
              break;

            // Other item types are ignored (like file edits, etc.)
          }
        }

        // Handle turn.completed event
        if (event.type === 'turn.completed') {
          console.log('[Codex] Turn completed');
          // Yield result with thread ID for persistence
          yield { type: 'result', sessionId: thread.id || undefined };
          // CRITICAL: Break out of event loop - turn is complete!
          // Without this, the loop waits for stream to end (causes 90s timeout)
          break;
        }
      }
    } catch (error) {
      console.error('[Codex] Query error:', error);
      throw new Error(`Codex query failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get the assistant type identifier
   */
  getType(): string {
    return 'codex';
  }
}
