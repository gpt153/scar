/**
 * Setup Telegram topic for sams-remote-coding-agent
 */
import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { pool } from './src/db/connection';

const GROUP_CHAT_ID = '-1003484800871';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CODEBASE_ID = 'f83d8b14-6925-4634-84ea-b0ad5a61c34d';
const PROJECT_NAME = 'sams-remote-coding-agent';
const PROJECT_PATH = '/home/samuel/remote-coding-agent';

async function main(): Promise<void> {
  console.log(`🚀 Setting up Telegram topic for ${PROJECT_NAME}...\n`);

  const bot = new Telegraf(BOT_TOKEN);

  try {
    // 1. Create Telegram topic
    console.log(`  → Creating Telegram topic...`);
    const topic = await bot.telegram.createForumTopic(parseInt(GROUP_CHAT_ID), PROJECT_NAME);
    console.log(`  ✓ Topic created: ID ${String(topic.message_thread_id)}`);

    // 2. Create conversation record
    console.log(`  → Creating conversation record...`);
    const conversationId = `${GROUP_CHAT_ID}:${String(topic.message_thread_id)}`;
    await pool.query(
      `INSERT INTO remote_agent_conversations (platform_type, platform_conversation_id, codebase_id, cwd, ai_assistant_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (platform_type, platform_conversation_id) DO UPDATE
       SET codebase_id = EXCLUDED.codebase_id, cwd = EXCLUDED.cwd`,
      ['telegram', conversationId, CODEBASE_ID, PROJECT_PATH, 'claude']
    );
    console.log(`  ✓ Conversation record created`);

    console.log(`\n✅ Setup complete!`);
    console.log(`   📁 Codebase ID: ${CODEBASE_ID}`);
    console.log(`   💬 Topic ID: ${String(topic.message_thread_id)}`);
    console.log(`   🔗 Conversation ID: ${conversationId}`);
    console.log(`\nNow create Archon project manually with MCP tools`);
  } catch (error) {
    console.error(`\n❌ Setup failed:`, error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
