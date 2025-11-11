/**
 * Remote Coding Agent - Main Entry Point
 * Telegram + Claude MVP
 */
import * as dotenv from 'dotenv';
import express from 'express';
import { TelegramAdapter } from './adapters/telegram';
import { TestAdapter } from './adapters/test';
import { GitHubAdapter } from './adapters/github';
import { ClaudeClient } from './clients/claude';
import { handleMessage } from './orchestrator/orchestrator';
import { pool } from './db/connection';

// Load environment variables
dotenv.config();

async function main(): Promise<void> {
  console.log('[App] Starting Remote Coding Agent (Telegram + Claude MVP)');

  // Validate required environment variables
  const required = ['DATABASE_URL', 'TELEGRAM_BOT_TOKEN'];
  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('[App] Missing required environment variables:', missing.join(', '));
    console.error('[App] Please check .env.example for required configuration');
    process.exit(1);
  }

  // Validate Claude credentials (API key or OAuth token)
  if (!process.env.CLAUDE_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.error(
      '[App] Missing Claude credentials. Set either CLAUDE_API_KEY or CLAUDE_CODE_OAUTH_TOKEN'
    );
    process.exit(1);
  }

  // Test database connection
  try {
    await pool.query('SELECT 1');
    console.log('[Database] Connected successfully');
  } catch (error) {
    console.error('[Database] Connection failed:', error);
    process.exit(1);
  }

  // Initialize AI assistant client (Claude)
  const claude = new ClaudeClient();

  // Initialize test adapter
  const testAdapter = new TestAdapter();
  await testAdapter.start();

  // Initialize GitHub adapter (conditional)
  let github: GitHubAdapter | null = null;
  if (process.env.GITHUB_TOKEN && process.env.WEBHOOK_SECRET) {
    github = new GitHubAdapter(process.env.GITHUB_TOKEN, process.env.WEBHOOK_SECRET);
    await github.start();
  } else {
    console.log('[GitHub] Adapter not initialized (missing GITHUB_TOKEN or WEBHOOK_SECRET)');
  }

  // Setup Express server
  const app = express();
  const port = process.env.PORT || 3000;

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
        github.handleWebhook(payload, signature, claude).catch(error => {
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

  // Test adapter endpoints
  app.post('/test/message', async (req, res) => {
    try {
      const { conversationId, message } = req.body;
      if (!conversationId || !message) {
        return res.status(400).json({ error: 'conversationId and message required' });
      }

      await testAdapter.receiveMessage(conversationId, message);

      // Process the message through orchestrator
      handleMessage(testAdapter, claude, conversationId, message).catch(error => {
        console.error('[Test] Message handling error:', error);
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

  app.delete('/test/messages/:conversationId?', (req, res) => {
    testAdapter.clearMessages(req.params.conversationId);
    res.json({ success: true });
  });

  app.listen(port, () => {
    console.log(`[Express] Health check server listening on port ${port}`);
  });

  // Initialize platform adapter (Telegram)
  const streamingMode = (process.env.TELEGRAM_STREAMING_MODE || 'stream') as 'stream' | 'batch';
  const telegram = new TelegramAdapter(process.env.TELEGRAM_BOT_TOKEN!, streamingMode);

  // Handle text messages
  telegram.getBot().on('text', async ctx => {
    const conversationId = telegram.getConversationId(ctx);
    const message = ctx.message.text;

    if (message) {
      await handleMessage(telegram, claude, conversationId, message);
    }
  });

  // Start bot
  await telegram.start();

  // Graceful shutdown
  const shutdown = (): void => {
    console.log('[App] Shutting down gracefully...');
    telegram.stop();
    pool.end().then(() => {
      console.log('[Database] Connection pool closed');
      process.exit(0);
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  console.log('[App] Remote Coding Agent is ready!');
  console.log('[App] Send messages to your Telegram bot to get started');
  console.log('[App] Test endpoint available: POST http://localhost:' + port + '/test/message');
}

// Run the application
main().catch(error => {
  console.error('[App] Fatal error:', error);
  process.exit(1);
});
