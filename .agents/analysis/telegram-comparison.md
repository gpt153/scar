# Telegram Adapter Comparison Analysis

**Date:** 2025-12-17
**Original Repo:** https://github.com/dynamous-community/remote-coding-agent.git
**Current Branch:** main (commit 0432b4f)

## Executive Summary

The Telegram bot hanging issue **predates the Web UI work**. The timeout mechanism was added as a workaround, not a fix. Comparison with the original repo reveals significant custom features added, but none appear to directly cause the hanging.

## Key Finding: The Hang Issue Timeline

1. **Original repo**: Simple `await this.bot.launch({ dropPendingUpdates: true })`
2. **Current repo (before timeout)**: Same launch code, but bot hung indefinitely
3. **Current repo (with timeout)**: Added 45-second timeout as symptom fix (commit 27777dd)
4. **After reverting**: Bot still hangs at same point (proves Web UI didn't cause it)

**Conclusion:** The hang is a pre-existing Telegraf library or environment issue, NOT caused by custom features or Web UI work.

## Custom Adaptations Found

### 1. Screenshot/Image Support ✅ KEEP
**Files affected:**
- `src/types/index.ts` - Added `ImageAttachment` interface
- `src/adapters/telegram.ts` - Photo message handling (lines 268-297)
- `src/index.ts` - Pass images to handleMessage

**Implementation:**
```typescript
// Handle photo messages (screenshots)
if ('photo' in ctx.message && ctx.message.photo) {
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const fileLink = await ctx.telegram.getFileLink(photo.file_id);
  const response = await fetch(fileLink.href);
  const buffer = Buffer.from(await response.arrayBuffer());

  images.push({
    data: buffer,
    mimeType: 'image/jpeg',
    filename: `telegram_photo_${photo.file_id}.jpg`,
  });
}
```

**Recommendation:** KEEP - Valuable feature, no risk to bot launch.

---

### 2. Topic Filtering System ✅ KEEP
**Files affected:**
- `src/adapters/telegram.ts` - Topic filter parsing (lines 57-76), filtering logic (lines 312-351)

**Modes:**
- `TELEGRAM_TOPIC_FILTER=all` - Respond to all topics (default)
- `TELEGRAM_TOPIC_FILTER=none` - Only general chat
- `TELEGRAM_TOPIC_FILTER=123,456` - Whitelist specific topics
- `TELEGRAM_TOPIC_FILTER=!123,456` - Blacklist topics

**Implementation:**
```typescript
private topicFilter: 'all' | 'none' | number[];

// Parse configuration
const filterConfig = process.env.TELEGRAM_TOPIC_FILTER ?? 'all';
if (filterConfig.startsWith('!')) {
  // Blacklist mode
  const excludeIds = filterConfig.substring(1).split(',').map(id => parseInt(id.trim()));
  this.topicFilter = excludeIds.map(id => -id);
} else {
  // Whitelist mode
  this.topicFilter = filterConfig.split(',').map(id => parseInt(id.trim()));
}

// Apply filter before processing messages
const threadId = 'message' in ctx && ctx.message?.message_thread_id;
if (this.topicFilter === 'none' && threadId) {
  return; // Ignore topics
}
// ...more filtering logic
```

**Recommendation:** KEEP - Useful for multi-bot groups, no risk to bot launch.

---

### 3. Group Chat & Thread ID Support ✅ KEEP
**Files affected:**
- `src/adapters/telegram.ts` - Store groupChatId (line 52), parse thread ID in conversationId (lines 229-242), thread ID in sendMessage (lines 92-99)

**Changes:**
- Added `private groupChatId: string | null`
- Conversation ID format: `chatId:threadId` for topics
- Pass `message_thread_id` to all sendMessage calls

**Implementation:**
```typescript
// Parse conversation ID with optional thread
getConversationId(ctx: Context): string {
  const chatId = ctx.chat.id.toString();
  const threadId = 'message' in ctx && ctx.message?.message_thread_id;
  if (threadId) {
    return `${chatId}:${String(threadId)}`;
  }
  return chatId;
}

// Send to correct thread
async sendMessage(chatId: string, message: string): Promise<void> {
  const parts = chatId.split(':');
  const id = parseInt(parts[0]);
  const threadId = parts[1] ? parseInt(parts[1]) : undefined;

  await this.bot.telegram.sendMessage(id, formatted, {
    parse_mode: 'MarkdownV2',
    message_thread_id: threadId,
  });
}
```

**Recommendation:** KEEP - Essential for topics feature, no risk to bot launch.

---

### 4. Forced Batch Mode ⚠️ CONSIDER REVERTING
**Files affected:**
- `src/index.ts` - Line 385

**Original:**
```typescript
const streamingMode = (process.env.TELEGRAM_STREAMING_MODE ?? 'stream') as 'stream' | 'batch';
```

**Current:**
```typescript
// Force batch mode for non-technical summaries (topics feature)
const streamingMode = 'batch';
```

**Recommendation:** REVERT - No technical reason to force batch mode. Let users configure via env var.

---

### 5. Message Handler Signature Change ✅ KEEP
**Files affected:**
- `src/adapters/telegram.ts` - TelegramMessageContext interface (line 19)
- `src/index.ts` - onMessage callback (line 389)

**Changes:**
- Added `images?: ImageAttachment[]` to context
- Pass images to handleMessage: `handleMessage(telegram!, conversationId, message, undefined, undefined, undefined, images)`

**Recommendation:** KEEP - Required for screenshot support.

---

### 6. Removed ensureThread Method ⚠️ CHECK IMPACT
**Files affected:**
- `src/adapters/telegram.ts` - Removed method (was lines 188-191 in original)

**Original:**
```typescript
async ensureThread(originalConversationId: string, _messageContext?: unknown): Promise<string> {
  return originalConversationId;
}
```

**Current:** Method completely removed

**Impact:** If other code calls `telegram.ensureThread()`, this will break.

**Recommendation:** CHECK - Verify no callers exist, or restore as no-op.

---

## Root Cause Investigation: The Hang

### Evidence

**Log Analysis (`/tmp/telegram-final-test.log`):**
1. First run (lines 39-46):
   ```
   [Telegram] Launching bot (with 45s timeout)...
   [Telegram] Failed to launch bot: Error: Bot launch timeout after 45 seconds
   [Telegram] This is likely a Telegraf library issue or network problem
   ```

2. Second run after tsx watch reload (lines 91-109):
   ```
   [Telegram] Failed to launch bot: TelegramError: 409: Conflict: terminated by other getUpdates request
   ```

### Analysis

**409 Conflict Error:**
- Caused by multiple bot instances running simultaneously
- First instance holds the polling connection
- Second instance gets rejected by Telegram API
- This is NOT the root cause - it's a consequence of the hang

**The Real Problem:**
- When `bot.launch()` is called, it tries to start long-polling
- Something in the environment/network prevents the connection from completing
- Bot hangs indefinitely waiting for polling to start
- Timeout mechanism detects hang and throws error

**Possible Root Causes:**
1. **Network/Firewall Issue** - Long-polling requests being blocked
2. **Telegraf Library Bug** - Incompatibility with current Node.js version
3. **Environment Issue** - Something in the container/VM preventing WebSocket-like connections
4. **Rate Limiting** - Telegram API throttling the bot token

### Recommendations

**Option 1: Switch to Webhook Mode (RECOMMENDED)**
```typescript
// Instead of polling
await this.bot.launch({
  dropPendingUpdates: true
});

// Use webhook
await this.bot.launch({
  webhook: {
    domain: process.env.TELEGRAM_WEBHOOK_DOMAIN,
    port: parseInt(process.env.TELEGRAM_WEBHOOK_PORT ?? '8443'),
  }
});
```

**Pros:**
- More reliable than polling in production
- No hanging issues with long-polling
- Better for high-traffic bots

**Cons:**
- Requires public HTTPS endpoint
- More complex deployment (ngrok for local dev)

---

**Option 2: Test with Original Simple Implementation**

Temporarily revert to original's simple implementation:
1. Remove all custom features temporarily
2. Test if bot launches successfully
3. Add features back one by one to identify culprit

**File: test-original-telegram.ts**
```typescript
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!, {
  handlerTimeout: Infinity,
});

bot.on('message', ctx => {
  console.log('Message received:', ctx.message);
});

bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('Bot started'))
  .catch(err => console.error('Bot failed:', err));

process.once('SIGINT', () => bot.stop());
```

---

**Option 3: Use grammy Library Instead**

grammy is a modern alternative to Telegraf with better error handling:

```bash
npm install grammy
```

```typescript
import { Bot } from 'grammy';

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

bot.on('message', ctx => {
  console.log('Message received');
});

bot.start(); // More robust than Telegraf
```

---

**Option 4: Debug Telegraf Internals**

Add deep logging to understand what's blocking:

```typescript
import { Telegraf } from 'telegraf';

const bot = new Telegraf(token, {
  handlerTimeout: Infinity,
});

// Hook into Telegraf's internal polling
console.log('[Debug] Creating bot...');
bot.telegram.getMe().then(me => {
  console.log('[Debug] Bot authenticated:', me.username);
}).catch(err => {
  console.error('[Debug] Auth failed:', err);
});

console.log('[Debug] Launching bot...');
const launchPromise = bot.launch({ dropPendingUpdates: true });

launchPromise
  .then(() => console.log('[Debug] Launch completed'))
  .catch(err => console.error('[Debug] Launch failed:', err));

// Check if promise ever resolves
setTimeout(() => {
  console.log('[Debug] 5 seconds elapsed, still waiting...');
}, 5000);
```

---

## Summary of Recommendations

### Keep These Custom Features ✅
1. **Screenshot/Image Support** - Valuable, safe
2. **Topic Filtering System** - Useful for multi-bot groups
3. **Group Chat & Thread ID Support** - Essential for topics feature
4. **Message Handler with Images** - Required for screenshots

### Revert or Fix These ⚠️
1. **Forced Batch Mode** - Revert to configurable via env var
2. **Removed ensureThread** - Check if anything calls it, restore as no-op if needed

### Investigate the Hang 🔍
Priority order:
1. **Test webhook mode** (most likely to fix permanently)
2. **Test original simple implementation** (isolate if custom code is culprit)
3. **Test grammy library** (modern alternative with better error handling)
4. **Deep debug Telegraf** (understand exactly what's blocking)

### Next Steps

**Immediate:**
1. Verify no code calls `telegram.ensureThread()` - if so, restore method
2. Revert forced batch mode to respect `TELEGRAM_STREAMING_MODE` env var

**Investigation:**
1. Try webhook mode (requires ngrok for local dev, or public deployment)
2. Create minimal test script with original implementation
3. Add deep logging to isolate exact blocking point

**Long-term:**
1. Consider switching to grammy for better reliability
2. Document webhook setup for production deployment
3. Add health checks for Telegram connection status

---

## Files to Modify

### 1. Restore Configurable Streaming Mode
**File:** `src/index.ts:385`
```typescript
// Change from:
const streamingMode = 'batch';

// To:
const streamingMode = (process.env.TELEGRAM_STREAMING_MODE ?? 'stream') as 'stream' | 'batch';
```

### 2. Check for ensureThread Callers
```bash
grep -r "ensureThread" src/
```

If any callers exist, restore method:
```typescript
// Add to src/adapters/telegram.ts
async ensureThread(originalConversationId: string, _messageContext?: unknown): Promise<string> {
  return originalConversationId; // Telegram doesn't need thread creation
}
```

---

## Testing Plan

### Phase 1: Verify Custom Features Don't Break
```bash
# 1. Apply recommended fixes
git checkout main
# Edit src/index.ts to restore streaming mode config

# 2. Test bot with current implementation
npm run dev

# 3. Verify in logs:
# - "Telegram streaming mode: stream" (or "batch" if env set)
# - No errors about missing methods
```

### Phase 2: Test Webhook Mode
```bash
# 1. Install ngrok
brew install ngrok  # or download from ngrok.com

# 2. Start ngrok tunnel
ngrok http 3000

# 3. Set webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<ngrok-url>/webhooks/telegram"}'

# 4. Update code to use webhook instead of polling
# (see webhook code example above)

# 5. Test bot responsiveness
```

### Phase 3: Isolate with Original Implementation
```bash
# 1. Create test file
cat > test-telegram-original.ts << 'EOF'
import 'dotenv/config';
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!, {
  handlerTimeout: Infinity,
});

bot.on('message', ctx => {
  if ('text' in ctx.message) {
    console.log(`[Test] Message: ${ctx.message.text}`);
    ctx.reply('Echo: ' + ctx.message.text);
  }
});

console.log('[Test] Launching bot...');
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('[Test] Bot started successfully'))
  .catch(err => {
    console.error('[Test] Bot failed:', err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop());
EOF

# 2. Run test
npx tsx test-telegram-original.ts

# 3. If it works: Custom features are culprit
# 4. If it hangs: Environment/network issue
```

---

## Conclusion

The Telegram hanging issue is **NOT caused by**:
- Web UI implementation
- Custom screenshot support
- Topic filtering
- Thread ID support
- Any of the identified custom features

The issue is **LIKELY caused by**:
- Network/firewall blocking long-polling
- Telegraf library incompatibility
- Environment configuration preventing WebSocket-like connections

**Recommended Fix Path:**
1. Apply immediate fixes (restore streaming mode config, check ensureThread)
2. Test webhook mode (most reliable solution)
3. If webhook not possible, debug with minimal test script
4. Consider switching to grammy library for better reliability
