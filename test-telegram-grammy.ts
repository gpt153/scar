/**
 * Grammy Bot Test - Modern alternative to Telegraf
 * Usage: npx tsx test-telegram-grammy.ts
 */
import 'dotenv/config';
import { Bot } from 'grammy';

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('[Grammy] TELEGRAM_BOT_TOKEN not found');
  process.exit(1);
}

console.log('[Grammy] Creating bot...');
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

console.log('[Grammy] Testing authentication...');
bot.api.getMe().then(me => {
  console.log(`[Grammy] ✅ Bot authenticated: @${me.username} (${me.first_name})`);
}).catch(err => {
  console.error('[Grammy] ❌ Authentication failed:', err);
  process.exit(1);
});

// Simple message handler
bot.on('message:text', ctx => {
  console.log(`[Grammy] Message: "${ctx.message.text}"`);
  ctx.reply(`Echo: ${ctx.message.text}`).catch(err => {
    console.error('[Grammy] Reply failed:', err);
  });
});

console.log('[Grammy] Starting bot...');
const startTime = Date.now();

// Grammy uses different approach - might work better
bot.start({
  drop_pending_updates: true,
  onStart: (info) => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Grammy] ✅ Bot started in ${elapsed}s: @${info.username}`);
    console.log('[Grammy] Send a message to test!');
  },
});

// Progress indicator
const progressInterval = setInterval(() => {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  process.stdout.write(`\r[Grammy] Starting... ${elapsed}s`);
}, 1000);

// Timeout check
setTimeout(() => {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.error(`\n[Grammy] ❌ Bot start timed out after ${elapsed}s`);
  clearInterval(progressInterval);
  process.exit(1);
}, 30000);

// Error handling
bot.catch(err => {
  console.error('[Grammy] Bot error:', err);
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n[Grammy] Shutting down...');
  clearInterval(progressInterval);
  bot.stop();
  process.exit(0);
});
