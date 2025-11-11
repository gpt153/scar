/**
 * Orchestrator - Main conversation handler
 * Routes slash commands and AI messages appropriately
 */
import { readFile } from 'fs/promises';
import { join } from 'path';
import { IPlatformAdapter, IAssistantClient } from '../types';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';
import * as commandHandler from '../handlers/command-handler';
import { formatToolCall } from '../utils/tool-formatter';
import { substituteVariables } from '../utils/variable-substitution';

export async function handleMessage(
  platform: IPlatformAdapter,
  aiClient: IAssistantClient,
  conversationId: string,
  message: string
): Promise<void> {
  try {
    console.log(`[Orchestrator] Handling message for conversation ${conversationId}`);

    // Get or create conversation
    let conversation = await db.getOrCreateConversation('telegram', conversationId);

    // Handle slash commands (except /command-invoke which needs AI)
    if (message.startsWith('/')) {
      if (!message.startsWith('/command-invoke')) {
        console.log(`[Orchestrator] Processing slash command: ${message}`);
        const result = await commandHandler.handleCommand(conversation, message);
        await platform.sendMessage(conversationId, result.message);

        // Reload conversation if modified
        if (result.modified) {
          conversation = await db.getOrCreateConversation('telegram', conversationId);
        }
        return;
      }
      // /command-invoke falls through to AI handling
    }

    // Parse /command-invoke if applicable
    let promptToSend = message;
    let commandName: string | null = null;

    if (message.startsWith('/command-invoke')) {
      const parts = message.split(/\s+/);
      if (parts.length < 2) {
        await platform.sendMessage(conversationId, 'Usage: /command-invoke <name> [args...]');
        return;
      }

      commandName = parts[1];
      const args = parts.slice(2);

      if (!conversation.codebase_id) {
        await platform.sendMessage(conversationId, 'No codebase configured. Use /clone first.');
        return;
      }

      // Look up command definition
      const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
      if (!codebase) {
        await platform.sendMessage(conversationId, 'Codebase not found.');
        return;
      }

      const commandDef = codebase.commands[commandName];
      if (!commandDef) {
        await platform.sendMessage(conversationId, `Command '${commandName}' not found. Use /commands to see available.`);
        return;
      }

      // Read command file
      const cwd = conversation.cwd || codebase.default_cwd;
      const commandFilePath = join(cwd, commandDef.path);

      try {
        const commandText = await readFile(commandFilePath, 'utf-8');

        // Substitute variables (no metadata needed - file-based workflow)
        promptToSend = substituteVariables(commandText, args);

        console.log(`[Orchestrator] Executing '${commandName}' with ${args.length} args`);
      } catch (error) {
        const err = error as Error;
        await platform.sendMessage(conversationId, `Failed to read command file: ${err.message}`);
        return;
      }
    } else {
      // Regular message - require codebase
      if (!conversation.codebase_id) {
        await platform.sendMessage(conversationId, 'No codebase configured. Use /clone first.');
        return;
      }
    }

    console.log(`[Orchestrator] Starting AI conversation`);

    // Get or create session (handle plan→execute transition)
    let session = await sessionDb.getActiveSession(conversation.id);
    const codebase = await codebaseDb.getCodebase(conversation.codebase_id);
    const cwd = conversation.cwd || codebase?.default_cwd || '/workspace';

    // Check for plan→execute transition (requires NEW session per PRD)
    const needsNewSession = commandName === 'execute' && session?.metadata?.lastCommand === 'plan';

    if (needsNewSession) {
      console.log(`[Orchestrator] Plan→Execute transition: creating new session`);

      if (session) {
        await sessionDb.deactivateSession(session.id);
      }

      session = await sessionDb.createSession({
        conversation_id: conversation.id,
        codebase_id: conversation.codebase_id
      });
    } else if (!session) {
      console.log(`[Orchestrator] Creating new session`);
      session = await sessionDb.createSession({
        conversation_id: conversation.id,
        codebase_id: conversation.codebase_id
      });
    } else {
      console.log(`[Orchestrator] Resuming session ${session.id}`);
    }

    // Send to AI and stream responses
    const mode = platform.getStreamingMode();
    console.log(`[Orchestrator] Streaming mode: ${mode}`);

    if (mode === 'stream') {
      // Stream mode: Send each chunk immediately
      for await (const msg of aiClient.sendQuery(promptToSend, cwd, session.assistant_session_id || undefined)) {
        if (msg.type === 'assistant' && msg.content) {
          await platform.sendMessage(conversationId, msg.content);
        } else if (msg.type === 'tool' && msg.toolName) {
          // Format and send tool call notification
          const toolMessage = formatToolCall(msg.toolName, msg.toolInput);
          await platform.sendMessage(conversationId, toolMessage);
        } else if (msg.type === 'result' && msg.sessionId) {
          // Save session ID for resume
          await sessionDb.updateSession(session.id, msg.sessionId);
        }
      }
    } else {
      // Batch mode: Accumulate chunks, send final response
      const buffer: string[] = [];
      for await (const msg of aiClient.sendQuery(promptToSend, cwd, session.assistant_session_id || undefined)) {
        if (msg.type === 'assistant' && msg.content) {
          buffer.push(msg.content);
        } else if (msg.type === 'tool' && msg.toolName) {
          // Format and add tool call notification to buffer
          const toolMessage = formatToolCall(msg.toolName, msg.toolInput);
          buffer.push(toolMessage);
        } else if (msg.type === 'result' && msg.sessionId) {
          await sessionDb.updateSession(session.id, msg.sessionId);
        }
      }

      if (buffer.length > 0) {
        await platform.sendMessage(conversationId, buffer.join('\n\n'));
      }
    }

    // Track last command in metadata (for plan→execute detection)
    if (commandName) {
      await sessionDb.updateSessionMetadata(session.id, { lastCommand: commandName });
    }

    console.log(`[Orchestrator] Message handling complete`);
  } catch (error) {
    console.error('[Orchestrator] Error:', error);
    await platform.sendMessage(
      conversationId,
      '⚠️ An error occurred. Try /reset to start a fresh session.'
    );
  }
}
