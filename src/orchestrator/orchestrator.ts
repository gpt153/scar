/**
 * Orchestrator - Main conversation handler
 * Routes slash commands and AI messages appropriately
 */
import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { IPlatformAdapter, ImageAttachment } from '../types';
import * as db from '../db/conversations';
import * as codebaseDb from '../db/codebases';
import * as sessionDb from '../db/sessions';
import * as templateDb from '../db/command-templates';
import * as messagesDb from '../db/messages';
import * as commandHandler from '../handlers/command-handler';
import { formatToolCall } from '../utils/tool-formatter';
import { substituteVariables } from '../utils/variable-substitution';
import { classifyAndFormatError } from '../utils/error-formatter';
import { getAssistantClient } from '../clients/factory';
import { getMcpConfigHash } from '../clients/claude';
import { TelegramAdapter } from '../adapters/telegram';
import {
  analyzeAndPrepareArchonInstructions,
  isArchonMcpEnabled,
} from './archon-auto-research';

/**
 * Wraps command content with execution context to signal the AI should execute immediately
 * @param commandName - The name of the command being invoked (e.g., 'create-pr')
 * @param content - The command template content after variable substitution
 * @returns Content wrapped with execution context
 */
function wrapCommandForExecution(commandName: string, content: string): string {
  return `The user invoked the \`/${commandName}\` command. Execute the following instructions immediately without asking for confirmation:

---

${content}

---

Remember: The user already decided to run this command. Take action now.`;
}

export async function handleMessage(
  platform: IPlatformAdapter,
  conversationId: string,
  message: string,
  issueContext?: string, // Optional GitHub issue/PR context to append AFTER command loading
  threadContext?: string, // Optional thread message history for context
  parentConversationId?: string, // Optional parent channel ID for thread inheritance
  images?: ImageAttachment[] // Optional image attachments (e.g., screenshots from Telegram)
): Promise<void> {
  try {
    console.log(`[Orchestrator] Handling message for conversation ${conversationId}`);

    // Get or create conversation (with optional parent context for thread inheritance)
    let conversation = await db.getOrCreateConversation(
      platform.getPlatformType(),
      conversationId,
      undefined,
      parentConversationId
    );

    // If new thread conversation, inherit context from parent
    if (parentConversationId && !conversation.codebase_id) {
      const parentConversation = await db.getConversationByPlatformId(
        platform.getPlatformType(),
        parentConversationId
      );
      if (parentConversation?.codebase_id) {
        await db.updateConversation(conversation.id, {
          codebase_id: parentConversation.codebase_id,
          cwd: parentConversation.cwd,
        });
        // Reload conversation with inherited values
        conversation = await db.getOrCreateConversation(platform.getPlatformType(), conversationId);
        console.log('[Orchestrator] Thread inherited context from parent channel');
      }
    }

    // Check if this is Telegram general chat (no topic)
    const isGeneralChat =
      platform.getPlatformType() === 'telegram' && !conversationId.includes(':');

    // Load codebase info for message tagging
    const codebaseForMessages = conversation.codebase_id
      ? await codebaseDb.getCodebase(conversation.codebase_id)
      : null;

    // Save user message to history (with platform and project tagging)
    try {
      // Convert ImageAttachment[] to match DB schema (filename may be optional)
      const imageMetadata = images?.map(img => ({
        filename: img.filename || 'image',
        mimeType: img.mimeType
      }));

      await messagesDb.createMessage(
        conversation.id,
        platform.getPlatformType() as 'github' | 'telegram' | 'cli' | 'slack' | 'discord' | 'web',
        codebaseForMessages?.id || null,
        codebaseForMessages?.name || null,
        'user',
        message,
        imageMetadata
      );
      console.log('[Orchestrator] Saved user message to history');
    } catch (error) {
      console.error('[Orchestrator] Failed to save user message:', error);
      // Don't fail the request if message saving fails
    }

    // Parse command upfront if it's a slash command
    let promptToSend = message;
    let commandName: string | null = null;

    if (message.startsWith('/')) {
      const { command, args } = commandHandler.parseCommand(message);

      // If general chat, only allow specific commands
      if (isGeneralChat) {
        const allowedInGeneralChat = ['new-topic', 'help', 'status', 'commands', 'templates'];

        if (!allowedInGeneralChat.includes(command)) {
          await platform.sendMessage(
            conversationId,
            '❌ This command can only be used in project topics, not general chat.\n\nUse /new-topic to create a project topic, then run commands there.'
          );
          return;
        }
      }

      // List of deterministic commands (handled by command-handler, no AI)
      const deterministicCommands = [
        'help',
        'status',
        'getcwd',
        'setcwd',
        'clone',
        'repos',
        'repo',
        'repo-remove',
        'reset',
        'reset-context',
        'resume',
        'command-set',
        'load-commands',
        'commands',
        'template-add',
        'template-list',
        'templates',
        'template-delete',
        'worktree',
        'new-topic',
      ];

      if (deterministicCommands.includes(command)) {
        console.log(`[Orchestrator] Processing slash command: ${message}`);

        // Get bot instance for Telegram (needed for /new-topic)
        const bot =
          platform.getPlatformType() === 'telegram'
            ? (platform as TelegramAdapter).getBot()
            : undefined;

        const result = await commandHandler.handleCommand(conversation, message, bot);
        await platform.sendMessage(conversationId, result.message);

        // Reload conversation if modified
        if (result.modified) {
          conversation = await db.getOrCreateConversation(
            platform.getPlatformType(),
            conversationId
          );
        }
        return;
      }

      // Handle /command-invoke (codebase-specific commands)
      if (command === 'command-invoke') {
        if (args.length < 1) {
          await platform.sendMessage(conversationId, 'Usage: /command-invoke <name> [args...]');
          return;
        }

        commandName = args[0];
        const commandArgs = args.slice(1);

        if (!conversation.codebase_id) {
          await platform.sendMessage(
            conversationId,
            'No codebase configured. Use /clone for a new repo or /repos to list your current repos you can switch to.'
          );
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
          await platform.sendMessage(
            conversationId,
            `Command '${commandName}' not found. Use /commands to see available.`
          );
          return;
        }

        // Read command file
        const cwd = conversation.worktree_path ?? conversation.cwd ?? codebase.default_cwd;
        const commandFilePath = join(cwd, commandDef.path);

        try {
          const commandText = await readFile(commandFilePath, 'utf-8');

          // Substitute variables (no metadata needed - file-based workflow)
          const substituted = substituteVariables(commandText, commandArgs);
          promptToSend = wrapCommandForExecution(commandName, substituted);

          // Append issue/PR context AFTER command loading (if provided)
          if (issueContext) {
            promptToSend = promptToSend + '\n\n---\n\n' + issueContext;
            console.log('[Orchestrator] Appended issue/PR context to command prompt');
          }

          console.log(
            `[Orchestrator] Executing '${commandName}' with ${String(commandArgs.length)} args`
          );
        } catch (error) {
          const err = error as Error;
          await platform.sendMessage(conversationId, `Failed to read command file: ${err.message}`);
          return;
        }
      } else {
        // Check if it's a global template command
        const template = await templateDb.getTemplate(command);
        if (template) {
          console.log(`[Orchestrator] Found template: ${command}`);
          commandName = command;
          const substituted = substituteVariables(template.content, args);
          promptToSend = wrapCommandForExecution(commandName, substituted);

          if (issueContext) {
            promptToSend = promptToSend + '\n\n---\n\n' + issueContext;
            console.log('[Orchestrator] Appended issue/PR context to template prompt');
          }

          console.log(
            `[Orchestrator] Executing template '${command}' with ${String(args.length)} args`
          );
        } else {
          // Unknown command
          await platform.sendMessage(
            conversationId,
            `Unknown command: /${command}\n\nType /help for available commands or /templates for command templates.`
          );
          return;
        }
      }
    } else {
      // Regular message - route through router template
      if (!conversation.codebase_id) {
        await platform.sendMessage(
          conversationId,
          'No codebase configured. Use /clone for a new repo or /repos to list your current repos you can switch to.'
        );
        return;
      }

      // Load router template for natural language routing
      const routerTemplate = await templateDb.getTemplate('router');
      if (routerTemplate) {
        console.log('[Orchestrator] Routing through router template');
        commandName = 'router';
        // Pass the entire message as $ARGUMENTS for the router
        promptToSend = substituteVariables(routerTemplate.content, [message]);
      }
      // If no router template, message passes through as-is (backward compatible)
    }

    // Prepend thread context if provided
    if (threadContext) {
      promptToSend = `## Thread Context (previous messages)\n\n${threadContext}\n\n---\n\n## Current Request\n\n${promptToSend}`;
      console.log('[Orchestrator] Prepended thread context to prompt');
    }

    // Inject system-wide workflow intelligence
    const systemContextTemplate = await templateDb.getTemplate('system-context');
    if (systemContextTemplate) {
      promptToSend = `${systemContextTemplate.content}\n\n---\n\n${promptToSend}`;
      console.log('[Orchestrator] Injected system-wide workflow intelligence');
    }

    // Inject Archon auto-research instructions if enabled
    if (isArchonMcpEnabled()) {
      const archonInstructions = analyzeAndPrepareArchonInstructions(message);
      if (archonInstructions) {
        promptToSend = `${archonInstructions}${promptToSend}`;
        console.log('[Orchestrator] Injected Archon auto-research instructions');
      }
    }

    console.log('[Orchestrator] Starting AI conversation');

    // Dynamically get the appropriate AI client based on conversation's assistant type
    const aiClient = getAssistantClient(conversation.ai_assistant_type);
    console.log(`[Orchestrator] Using ${conversation.ai_assistant_type} assistant`);

    // Get or create session (handle plan→execute transition)
    let session = await sessionDb.getActiveSession(conversation.id);
    const codebase = conversation.codebase_id
      ? await codebaseDb.getCodebase(conversation.codebase_id)
      : null;
    let cwd =
      conversation.worktree_path ?? conversation.cwd ?? codebase?.default_cwd ?? '/workspace';

    // Validate cwd exists - handle stale worktree paths gracefully
    try {
      await access(cwd);
    } catch {
      console.warn(`[Orchestrator] Working directory ${cwd} does not exist`);

      // Deactivate stale session to force fresh start
      if (session) {
        await sessionDb.deactivateSession(session.id);
        session = null;
        console.log('[Orchestrator] Deactivated session with stale worktree');
      }

      // Clear stale worktree reference from conversation
      if (conversation.worktree_path) {
        await db.updateConversation(conversation.id, {
          worktree_path: null,
          cwd: codebase?.default_cwd ?? '/workspace',
        });
        console.log('[Orchestrator] Cleared stale worktree path from conversation');
      }

      // Use default cwd for this request
      cwd = codebase?.default_cwd ?? '/workspace';
    }

    // Check for plan→execute transition (requires NEW session per PRD)
    // Supports both regular and GitHub workflows:
    // - plan-feature → execute (regular workflow)
    // - plan-feature-github → execute-github (GitHub workflow with staging)
    const needsNewSession =
      (commandName === 'execute' && session?.metadata?.lastCommand === 'plan-feature') ||
      (commandName === 'execute-github' &&
        session?.metadata?.lastCommand === 'plan-feature-github');

    if (needsNewSession) {
      console.log('[Orchestrator] Plan→Execute transition: creating new session');

      if (session) {
        await sessionDb.deactivateSession(session.id);
      }

      session = await sessionDb.createSession({
        conversation_id: conversation.id,
        codebase_id: conversation.codebase_id ?? undefined,
        ai_assistant_type: conversation.ai_assistant_type,
      });
      // Store MCP config hash for session validation
      await sessionDb.updateSessionMetadata(session.id, {
        mcpConfigHash: getMcpConfigHash(),
      });
    } else if (!session) {
      console.log('[Orchestrator] Creating new session');
      session = await sessionDb.createSession({
        conversation_id: conversation.id,
        codebase_id: conversation.codebase_id ?? undefined,
        ai_assistant_type: conversation.ai_assistant_type,
      });
      // Store MCP config hash for session validation
      await sessionDb.updateSessionMetadata(session.id, {
        mcpConfigHash: getMcpConfigHash(),
      });
    } else {
      console.log(`[Orchestrator] Resuming session ${session.id}`);

      // Validate MCP configuration hasn't changed (prevents Claude Code crashes)
      const currentMcpConfig = getMcpConfigHash();
      const sessionMcpConfig = session.metadata?.mcpConfigHash;

      if (sessionMcpConfig && sessionMcpConfig !== currentMcpConfig) {
        console.warn('[Orchestrator] MCP config mismatch detected - creating new session');
        console.log(`[Orchestrator] Old config: ${sessionMcpConfig}`);
        console.log(`[Orchestrator] New config: ${currentMcpConfig}`);

        // Deactivate old session to prevent crashes
        await sessionDb.deactivateSession(session.id);

        // Create new session with current MCP config
        session = await sessionDb.createSession({
          conversation_id: conversation.id,
          codebase_id: conversation.codebase_id ?? undefined,
          ai_assistant_type: conversation.ai_assistant_type,
        });
        await sessionDb.updateSessionMetadata(session.id, {
          mcpConfigHash: currentMcpConfig,
        });
      }
    }

    // Check if session has resumed history context (from /resume command)
    if (session?.metadata?.resumedWithHistory && session.metadata.historyContext) {
      // Prepend history context to prompt
      const contextPrompt = session.metadata.historyContext as string;
      promptToSend = `${contextPrompt}\n\nCurrent message: ${promptToSend}`;
      console.log('[Orchestrator] Prepended conversation history context');

      // Clear the flag so we don't send it again on next message
      await sessionDb.updateSessionMetadata(session.id, {
        ...session.metadata,
        resumedWithHistory: false,
        historyContext: undefined,
      });
    }

    // Send to AI and stream responses
    const mode = platform.getStreamingMode();
    console.log(`[Orchestrator] Streaming mode: ${mode}`);

    // Send "starting" message in batch mode to provide feedback
    if (mode === 'batch') {
      const botName = process.env.BOT_DISPLAY_NAME ?? 'The agent';
      await platform.sendMessage(conversationId, `${botName} is on the case...`);
    }

    if (mode === 'stream') {
      // Stream mode: Send each chunk immediately, accumulate for history
      let fullResponse = '';
      for await (const msg of aiClient.sendQuery(
        promptToSend,
        cwd,
        session.assistant_session_id ?? undefined,
        images
      )) {
        if (msg.type === 'assistant' && msg.content) {
          fullResponse += msg.content;
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

      // Save complete AI response to history
      if (fullResponse) {
        try {
          await messagesDb.createMessage(
            conversation.id,
            platform.getPlatformType() as 'github' | 'telegram' | 'cli' | 'slack' | 'discord' | 'web',
            codebaseForMessages?.id || null,
            codebaseForMessages?.name || null,
            'assistant',
            fullResponse
          );
          console.log('[Orchestrator] Saved assistant response to history');
        } catch (error) {
          console.error('[Orchestrator] Failed to save assistant response:', error);
        }
      }
    } else {
      // Batch mode: Accumulate all chunks for logging, send only final clean summary
      const allChunks: { type: string; content: string }[] = [];
      const assistantMessages: string[] = [];

      for await (const msg of aiClient.sendQuery(
        promptToSend,
        cwd,
        session.assistant_session_id ?? undefined,
        images
      )) {
        if (msg.type === 'assistant' && msg.content) {
          assistantMessages.push(msg.content);
          allChunks.push({ type: 'assistant', content: msg.content });
        } else if (msg.type === 'tool' && msg.toolName) {
          // Format and log tool call for observability
          const toolMessage = formatToolCall(msg.toolName, msg.toolInput);
          allChunks.push({ type: 'tool', content: toolMessage });
          console.log(`[Orchestrator] Tool call: ${msg.toolName}`);
        } else if (msg.type === 'result' && msg.sessionId) {
          await sessionDb.updateSession(session.id, msg.sessionId);
        }
      }

      // Log all chunks for observability
      console.log(`[Orchestrator] Received ${String(allChunks.length)} chunks total`);
      console.log(`[Orchestrator] Assistant messages: ${String(assistantMessages.length)}`);

      // Join all assistant messages and filter tool indicators
      // Tool indicators from Claude Code: 🔧, 💭, etc.
      // These appear at the start of lines showing tool usage
      let finalMessage = '';

      if (assistantMessages.length > 0) {
        // Join all messages with separator (preserves context from all responses)
        const allMessages = assistantMessages.join('\n\n---\n\n');

        // Split by double newlines to separate tool sections from content
        const sections = allMessages.split('\n\n');

        // Filter out sections that start with tool indicators
        // Using alternation for emojis with variation selectors
        const toolIndicatorRegex =
          /^(?:\u{1F527}|\u{1F4AD}|\u{1F4DD}|\u{270F}\u{FE0F}|\u{1F5D1}\u{FE0F}|\u{1F4C2}|\u{1F50D})/u;
        const cleanSections = sections.filter(section => {
          const trimmed = section.trim();
          return !toolIndicatorRegex.exec(trimmed);
        });

        // Join remaining sections
        finalMessage = cleanSections.join('\n\n').trim();

        // If we filtered everything out, fall back to all messages joined
        if (!finalMessage) {
          finalMessage = allMessages;
        }
      }

      if (finalMessage) {
        console.log(`[Orchestrator] Sending final message (${String(finalMessage.length)} chars)`);
        await platform.sendMessage(conversationId, finalMessage);

        // Save AI response to history (batch mode)
        try {
          await messagesDb.createMessage(
            conversation.id,
            platform.getPlatformType() as 'github' | 'telegram' | 'cli' | 'slack' | 'discord' | 'web',
            codebaseForMessages?.id || null,
            codebaseForMessages?.name || null,
            'assistant',
            finalMessage
          );
          console.log('[Orchestrator] Saved assistant response to history (batch mode)');
        } catch (error) {
          console.error('[Orchestrator] Failed to save assistant response:', error);
        }
      }
    }

    // Track last command in metadata (for plan→execute detection)
    if (commandName) {
      await sessionDb.updateSessionMetadata(session.id, { lastCommand: commandName });
    }

    console.log('[Orchestrator] Message handling complete');
  } catch (error) {
    const err = error as Error;
    console.error('[Orchestrator] Error:', error);
    const userMessage = classifyAndFormatError(err);
    await platform.sendMessage(conversationId, userMessage);
  }
}
