/**
 * Grammy Live Test - No timeout, just run and wait for messages
 */
import 'dotenv/config';
import { Bot } from 'grammy';

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

bot.on('message:text', ctx => {
  const msg = ctx.message.text;
  console.log(`\n📨 [${new Date().toISOString()}] Message received: "${msg}"`);
  ctx.reply(`✅ Received: ${msg}`);
});

bot.start({
  drop_pending_updates: true,
  onStart: (info) => {
    console.log(`✅ Bot @${info.username} is listening for messages...`);
    console.log(`Send a message to test!`);
  },
});

process.once('SIGINT', () => bot.stop());
