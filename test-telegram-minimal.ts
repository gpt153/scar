/**
 * Minimal Telegram Bot Test
 * Tests if Telegraf can connect without any custom features
 * Usage: npx tsx test-telegram-minimal.ts
 */
import 'dotenv/config';
import { Telegraf } from 'telegraf';

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('[Test] TELEGRAM_BOT_TOKEN not found in environment');
  process.exit(1);
}

console.log('[Test] Creating bot with token:', process.env.TELEGRAM_BOT_TOKEN.slice(0, 8) + '...');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  handlerTimeout: Infinity,
});

console.log('[Test] Testing bot authentication...');
bot.telegram
  .getMe()
  .then(me => {
    console.log(`[Test] ✅ Bot authenticated: @${me.username} (${me.first_name})`);
  })
  .catch(err => {
    console.error('[Test] ❌ Authentication failed:', err);
    process.exit(1);
  });

// Register simple message handler
bot.on('message', ctx => {
  if ('text' in ctx.message) {
    const message = ctx.message.text;
    console.log(`[Test] Message received: "${message}"`);
    ctx.reply(`Echo: ${message}`).catch(err => {
      console.error('[Test] Reply failed:', err);
    });
  }
});

// Track launch progress
console.log('[Test] Launching bot with long-polling...');
const startTime = Date.now();

// Add timeout to detect hang
const timeoutId = setTimeout(() => {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.error(`[Test] ❌ Bot launch timed out after ${elapsed} seconds`);
  console.error('[Test] This indicates a network/environment issue blocking Telegram polling');
  process.exit(1);
}, 30000); // 30 second timeout

bot
  .launch({
    dropPendingUpdates: true,
  })
  .then(() => {
    clearTimeout(timeoutId);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Test] ✅ Bot launched successfully in ${elapsed} seconds`);
    console.log('[Test] Bot is now listening for messages. Send a message to test.');
  })
  .catch(err => {
    clearTimeout(timeoutId);
    console.error('[Test] ❌ Bot launch failed:', err);
    if (err.message?.includes('409')) {
      console.error('[Test] 409 Conflict: Another bot instance is already running');
      console.error('[Test] Kill all node processes and wait 60 seconds before retrying');
    }
    process.exit(1);
  });

// Progress indicator
const progressInterval = setInterval(() => {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  process.stdout.write(`\r[Test] Waiting for launch... ${elapsed}s`);
}, 1000);

bot.catch(err => {
  console.error('[Test] Bot error:', err);
});

// Graceful shutdown
const shutdown = () => {
  console.log('\n[Test] Shutting down...');
  clearTimeout(timeoutId);
  clearInterval(progressInterval);
  bot.stop();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
