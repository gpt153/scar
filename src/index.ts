/**
 * Remote Coding Agent - Main Entry Point
 * Telegram + Claude MVP
 */

// Load environment variables FIRST - using 'dotenv/config' ensures
// it runs during import phase, before other modules are evaluated
import 'dotenv/config';

import express from 'express';
import { createServer } from 'http';
import { resolve } from 'path';
import { TelegramAdapter } from './adapters/telegram';
import { TestAdapter } from './adapters/test';
import { GitHubAdapter } from './adapters/github';
import { DiscordAdapter } from './adapters/discord';
import { SlackAdapter } from './adapters/slack';
import { WebAdapter } from './adapters/web';
import { handleMessage } from './orchestrator/orchestrator';
import { pool } from './db/connection';
import * as messagesDb from './db/messages';
import * as cliEventsDb from './db/cli-events';
import { ConversationLockManager } from './utils/conversation-lock';
import { classifyAndFormatError } from './utils/error-formatter';
import { seedDefaultCommands } from './scripts/seed-commands';

async function main(): Promise<void> {
  console.log('[App] Starting Remote Coding Agent');

  // Validate required environment variables
  const required = ['DATABASE_URL'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('[App] Missing required environment variables:', missing.join(', '));
    console.error('[App] Please check .env.example for required configuration');
    process.exit(1);
  }

  // Validate AI assistant credentials (warn if missing, don't fail)
  // Using || intentionally: empty string should be treated as missing credential
  const hasClaudeCredentials = Boolean(
    process.env.CLAUDE_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN
  );
  const hasCodexCredentials = process.env.CODEX_ID_TOKEN && process.env.CODEX_ACCESS_TOKEN;

  if (!hasClaudeCredentials && !hasCodexCredentials) {
    console.error('[App] No AI assistant credentials found. Set Claude or Codex credentials.');
    process.exit(1);
  }

  if (!hasClaudeCredentials) {
    console.warn('[App] Claude credentials not found. Claude assistant will be unavailable.');
  }
  if (!hasCodexCredentials) {
    console.warn('[App] Codex credentials not found. Codex assistant will be unavailable.');
  }

  // Test database connection
  try {
    await pool.query('SELECT 1');
    console.log('[Database] Connected successfully');
  } catch (error) {
    console.error('[Database] Connection failed:', error);
    process.exit(1);
  }

  // Warn if WORKSPACE_PATH is inside project directory
  const workspacePath = resolve(process.env.WORKSPACE_PATH ?? '/workspace');
  const projectRoot = resolve(__dirname, '..');
  if (workspacePath.startsWith(projectRoot + '/') || workspacePath === projectRoot) {
    console.warn('⚠️  WARNING: WORKSPACE_PATH is inside project directory');
    console.warn('   This can cause nested repository issues when working on this repo.');
    console.warn(`   Current: ${workspacePath}`);
    console.warn('   Recommended: /tmp/scar-workspace or ~/scar-workspace');
    console.warn('');
  }

  // Seed default command templates
  await seedDefaultCommands();

  // Initialize conversation lock manager
  const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_CONVERSATIONS ?? '10');
  const lockManager = new ConversationLockManager(maxConcurrent);
  console.log(`[App] Lock manager initialized (max concurrent: ${String(maxConcurrent)})`);

  // Initialize test adapter
  const testAdapter = new TestAdapter();
  await testAdapter.start();

  // Check that at least one platform is configured
  const hasTelegram = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const hasDiscord = Boolean(process.env.DISCORD_BOT_TOKEN);
  const hasGitHub = Boolean(process.env.GITHUB_TOKEN && process.env.WEBHOOK_SECRET);

  if (!hasTelegram && !hasDiscord && !hasGitHub) {
    console.error('[App] No platform adapters configured.');
    console.error('[App] You must configure at least one platform:');
    console.error('[App]   - Telegram: Set TELEGRAM_BOT_TOKEN');
    console.error('[App]   - Discord: Set DISCORD_BOT_TOKEN');
    console.error('[App]   - GitHub: Set GITHUB_TOKEN and WEBHOOK_SECRET');
    process.exit(1);
  }

  // Initialize GitHub adapter (conditional)
  let github: GitHubAdapter | null = null;
  if (process.env.GITHUB_TOKEN && process.env.WEBHOOK_SECRET) {
    const botMention = process.env.GITHUB_BOT_MENTION ?? process.env.BOT_DISPLAY_NAME;
    github = new GitHubAdapter(process.env.GITHUB_TOKEN, process.env.WEBHOOK_SECRET, botMention);
    await github.start();
  } else {
    console.log('[GitHub] Adapter not initialized (missing GITHUB_TOKEN or WEBHOOK_SECRET)');
  }

  // Initialize Discord adapter (conditional)
  let discord: DiscordAdapter | null = null;
  if (process.env.DISCORD_BOT_TOKEN) {
    const discordStreamingMode = (process.env.DISCORD_STREAMING_MODE ?? 'batch') as
      | 'stream'
      | 'batch';
    discord = new DiscordAdapter(process.env.DISCORD_BOT_TOKEN, discordStreamingMode);

    // Register message handler
    discord.onMessage(async message => {
      const conversationId = discord!.getConversationId(message);

      // Skip if no content
      if (!message.content) return;

      // Check if bot was mentioned (required for activation)
      // Exception: DMs don't require mention
      const isDM = !message.guild;
      if (!isDM && !discord!.isBotMentioned(message)) {
        return; // Ignore messages that don't mention the bot
      }

      // Strip the bot mention from the message
      const content = discord!.stripBotMention(message);
      if (!content) return; // Message was only a mention with no content

      // Check for thread context
      let threadContext: string | undefined;
      let parentConversationId: string | undefined;

      if (discord!.isThread(message)) {
        // Fetch thread history for context
        const history = await discord!.fetchThreadHistory(message);
        if (history.length > 0) {
          // Exclude the current message from history (it's included in fetch)
          const historyWithoutCurrent = history.slice(0, -1);
          if (historyWithoutCurrent.length > 0) {
            threadContext = historyWithoutCurrent.join('\n');
          }
        }

        // Get parent channel ID for context inheritance
        parentConversationId = discord!.getParentChannelId(message) ?? undefined;
      }

      // Fire-and-forget: handler returns immediately, processing happens async
      lockManager
        .acquireLock(conversationId, async () => {
          await handleMessage(
            discord!,
            conversationId,
            content,
            undefined,
            threadContext,
            parentConversationId
          );
        })
        .catch(async error => {
          console.error('[Discord] Failed to process message:', error);
          try {
            const userMessage = classifyAndFormatError(error as Error);
            await discord!.sendMessage(conversationId, userMessage);
          } catch (sendError) {
            console.error('[Discord] Failed to send error message to user:', sendError);
          }
        });
    });

    await discord.start();
  } else {
    console.log('[Discord] Adapter not initialized (missing DISCORD_BOT_TOKEN)');
  }

  // Initialize Slack adapter (conditional)
  let slack: SlackAdapter | null = null;
  if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN) {
    const slackStreamingMode = (process.env.SLACK_STREAMING_MODE ?? 'batch') as 'stream' | 'batch';
    slack = new SlackAdapter(
      process.env.SLACK_BOT_TOKEN,
      process.env.SLACK_APP_TOKEN,
      slackStreamingMode
    );

    // Register message handler
    slack.onMessage(async event => {
      const conversationId = slack!.getConversationId(event);

      // Skip if no text
      if (!event.text) return;

      // Strip the bot mention from the message
      const content = slack!.stripBotMention(event.text);
      if (!content) return; // Message was only a mention with no content

      // Check for thread context
      let threadContext: string | undefined;
      let parentConversationId: string | undefined;

      if (slack!.isThread(event)) {
        // Fetch thread history for context
        const history = await slack!.fetchThreadHistory(event);
        if (history.length > 0) {
          // Exclude the current message from history
          const historyWithoutCurrent = history.slice(0, -1);
          if (historyWithoutCurrent.length > 0) {
            threadContext = historyWithoutCurrent.join('\n');
          }
        }

        // Get parent conversation ID for context inheritance
        parentConversationId = slack!.getParentConversationId(event) ?? undefined;
      }

      // Fire-and-forget: handler returns immediately, processing happens async
      lockManager
        .acquireLock(conversationId, async () => {
          await handleMessage(
            slack!,
            conversationId,
            content,
            undefined,
            threadContext,
            parentConversationId
          );
        })
        .catch(async error => {
          console.error('[Slack] Failed to process message:', error);
          try {
            const userMessage = classifyAndFormatError(error as Error);
            await slack!.sendMessage(conversationId, userMessage);
          } catch (sendError) {
            console.error('[Slack] Failed to send error message to user:', sendError);
          }
        });
    });

    await slack.start();
  } else {
    console.log('[Slack] Adapter not initialized (missing SLACK_BOT_TOKEN or SLACK_APP_TOKEN)');
  }

  // Setup Express server
  const app = express();
  const port = process.env.PORT ?? 3000;

  // GitHub webhook endpoint (must use raw body for signature verification)
  // IMPORTANT: Register BEFORE express.json() to prevent body parsing
  if (github) {
    app.post('/webhooks/github', express.raw({ type: 'application/json' }), async (req, res) => {
      try {
        const signature = req.headers['x-hub-signature-256'] as string;
        if (!signature) {
          return res.status(400).json({ error: 'Missing signature header' });
        }

        const payload = (req.body as Buffer).toString('utf-8');

        // Process async (fire-and-forget for fast webhook response)
        // Note: github.handleWebhook() has internal error handling that notifies users
        // This catch is a fallback for truly unexpected errors (e.g., signature verification bugs)
        github.handleWebhook(payload, signature).catch(error => {
          console.error('[GitHub] Webhook processing error:', error);
        });

        return res.status(200).send('OK');
      } catch (error) {
        console.error('[GitHub] Webhook endpoint error:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
    console.log('[Express] GitHub webhook endpoint registered');
  }

  // JSON parsing for all other endpoints
  app.use(express.json());

  // Serve web UI
  const webDist = resolve(__dirname, '../client/web/dist');
  app.use('/web', express.static(webDist));
  // Catch-all route for SPA (must be after static middleware)
  app.get(/^\/web\/.*/, (_req, res) => {
    res.sendFile(resolve(webDist, 'index.html'));
  });

  console.log('[Express] Web UI served at /web');

  // Health check endpoints
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/db', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch (_error) {
      res.status(500).json({ status: 'error', database: 'disconnected' });
    }
  });

  app.get('/health/concurrency', (_req, res) => {
    try {
      const stats = lockManager.getStats();
      res.json({
        status: 'ok',
        ...stats,
      });
    } catch (_error) {
      res.status(500).json({ status: 'error', reason: 'Failed to get stats' });
    }
  });

  // Test adapter endpoints
  app.post('/test/message', async (req, res) => {
    try {
      const { conversationId, message } = req.body as {
        conversationId?: unknown;
        message?: unknown;
      };
      if (typeof conversationId !== 'string' || typeof message !== 'string') {
        return res.status(400).json({ error: 'conversationId and message must be strings' });
      }
      if (!conversationId || !message) {
        return res.status(400).json({ error: 'conversationId and message required' });
      }

      await testAdapter.receiveMessage(conversationId, message);

      // Process the message through orchestrator (non-blocking)
      lockManager
        .acquireLock(conversationId, async () => {
          await handleMessage(testAdapter, conversationId, message);
        })
        .catch(async error => {
          console.error('[Test] Message handling error:', error);
          try {
            const userMessage = classifyAndFormatError(error as Error);
            await testAdapter.sendMessage(conversationId, userMessage);
          } catch (sendError) {
            console.error('[Test] Failed to send error message to user:', sendError);
          }
        });

      return res.json({ success: true, conversationId, message });
    } catch (error) {
      console.error('[Test] Endpoint error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/test/messages/:conversationId', (req, res) => {
    const messages = testAdapter.getSentMessages(req.params.conversationId);
    res.json({ conversationId: req.params.conversationId, messages });
  });

  // Express 5 optional parameter syntax - handles both /test/messages and /test/messages/:id
  app.delete('/test/messages{/:conversationId}', (req, res) => {
    testAdapter.clearMessages(req.params.conversationId);
    res.json({ success: true });
  });

  // Set test adapter streaming mode
  app.put('/test/mode', (req, res) => {
    const { mode } = req.body as { mode?: unknown };
    if (mode !== 'stream' && mode !== 'batch') {
      return res.status(400).json({ error: 'mode must be "stream" or "batch"' });
    }
    testAdapter.setStreamingMode(mode);
    return res.json({ success: true, mode });
  });

  // API endpoints for Web UI
  app.get('/api/topics', async (_req, res) => {
    try {
      const result = await pool.query(
        `SELECT c.*, cb.name as codebase_name
         FROM remote_agent_conversations c
         LEFT JOIN remote_agent_codebases cb ON c.codebase_id = cb.id
         WHERE c.platform_type = 'telegram'
         AND c.platform_conversation_id LIKE '%:%'
         ORDER BY c.updated_at DESC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error('[API] Failed to fetch topics:', error);
      res.status(500).json({ error: 'Failed to fetch topics' });
    }
  });

  app.get('/api/messages/:conversationId', async (req, res) => {
    try {
      const messages = await messagesDb.getMessageHistory(req.params.conversationId, 100);
      res.json(messages);
    } catch (error) {
      console.error('[API] Failed to fetch messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.get('/api/cli-events/:conversationId', async (req, res) => {
    try {
      const events = await cliEventsDb.getCLIEventHistory(req.params.conversationId, 100);
      // Map database fields to frontend format (created_at -> timestamp)
      const formattedEvents = events.map((event) => ({
        id: event.id,
        timestamp: event.created_at.toISOString(),
        type: event.type,
        content: event.content,
        metadata: event.metadata,
      }));
      res.json(formattedEvents);
    } catch (error) {
      console.error('[API] Failed to fetch CLI events:', error);
      res.status(500).json({ error: 'Failed to fetch CLI events' });
    }
  });

  // Create HTTP server and initialize Socket.io
  const httpServer = createServer(app);
  const webStreamingMode = (process.env.WEB_STREAMING_MODE ?? 'stream') as 'stream' | 'batch';
  const web = new WebAdapter(httpServer, webStreamingMode);

  // Register Web adapter message handler
  web.onMessage(async ({ conversationId, content, images }) => {
    // Fire-and-forget: handler returns immediately, processing happens async
    lockManager
      .acquireLock(conversationId, async () => {
        await handleMessage(web, conversationId, content, undefined, undefined, undefined, images);
      })
      .catch(async (error) => {
        console.error('[Web] Failed to process message:', error);
        try {
          const userMessage = classifyAndFormatError(error as Error);
          await web.sendMessage(conversationId, userMessage);
        } catch (sendError) {
          console.error('[Web] Failed to send error message to user:', sendError);
        }
      });
  });

  // Start Socket.io
  await web.start();

  // Start HTTP server (NOT awaited - callback-based API)
  httpServer.listen(port, () => {
    console.log(`[Express] Server listening on port ${String(port)}`);
  });

  // Initialize Telegram adapter (conditional)
  let telegram: TelegramAdapter | null = null;
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const streamingMode = (process.env.TELEGRAM_STREAMING_MODE ?? 'stream') as 'stream' | 'batch';
    telegram = new TelegramAdapter(process.env.TELEGRAM_BOT_TOKEN, streamingMode);

    // Register message handler (auth is handled internally by adapter)
    telegram.onMessage(async ({ conversationId, message, images }) => {
      // Fire-and-forget: handler returns immediately, processing happens async
      lockManager
        .acquireLock(conversationId, async () => {
          await handleMessage(telegram!, conversationId, message, undefined, undefined, undefined, images);
        })
        .catch(async error => {
          console.error('[Telegram] Failed to process message:', error);
          try {
            const userMessage = classifyAndFormatError(error as Error);
            await telegram!.sendMessage(conversationId, userMessage);
          } catch (sendError) {
            console.error('[Telegram] Failed to send error message to user:', sendError);
          }
        });
    });

    // Start bot
    await telegram.start();
  } else {
    console.log('[Telegram] Adapter not initialized (missing TELEGRAM_BOT_TOKEN)');
  }

  // Graceful shutdown
  const shutdown = (): void => {
    console.log('[App] Shutting down gracefully...');
    telegram?.stop();
    discord?.stop();
    slack?.stop();
    web.stop();
    void pool.end().then(() => {
      console.log('[Database] Connection pool closed');
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  // Show active platforms
  const activePlatforms = [];
  if (telegram) activePlatforms.push('Telegram');
  if (discord) activePlatforms.push('Discord');
  if (slack) activePlatforms.push('Slack');
  if (github) activePlatforms.push('GitHub');

  console.log('[App] Remote Coding Agent is ready!');
  console.log(`[App] Active platforms: ${activePlatforms.join(', ')}`);
  console.log(
    '[App] Test endpoint available: POST http://localhost:' + String(port) + '/test/message'
  );
}

// Run the application
main().catch(error => {
  console.error('[App] Fatal error:', error);
  process.exit(1);
});
