# Message History with /resume Command - Implementation Plan

## Overview

Implement persistent message history storage with explicit platform/project tagging, enabling crash recovery and context continuity across VM restarts.

## Design Decisions

### ✅ Key Features

1. **Explicit Tagging**: Messages tagged with platform (github/telegram/cli) and project (codebase)
2. **Smart Loading**: Only load history on `/resume` command, not every message
3. **50 Message Limit**: Optimal balance (~6k-12k tokens, 3-6% of context window)
4. **Full Traceability**: Easy queries to trace conversation across platforms

### 📊 Schema Enhancement

**New Columns in `remote_agent_messages`:**
- `platform_type` - Source platform (github, telegram, cli, slack, discord, web)
- `codebase_id` - Which project/repo
- `codebase_name` - Cached name for easy display

**Benefits:**
- No joins needed for queries
- Clear traceability without confusion
- Fast filtering by platform or project

---

## Implementation Steps

### Step 1: Run Enhanced Migration

```bash
# Apply the enhanced schema
docker exec scar-postgres-1 psql -U postgres -d remote_coding_agent \
  -f /home/samuel/scar/migrations/005_add_message_history_enhanced.sql

# Verify table creation
docker exec scar-postgres-1 psql -U postgres -d remote_coding_agent \
  -c "\d remote_agent_messages"
```

### Step 2: Update Database Functions

Replace `src/db/messages.ts` with enhanced version:
- Add platform_type, codebase_id, codebase_name parameters
- Update interface to include new fields
- Add helper functions for platform/project queries

### Step 3: Integrate Message Saving in Orchestrator

**File: `src/orchestrator/orchestrator.ts`**

```typescript
import * as messagesDb from '../db/messages-enhanced';
import * as codebaseDb from '../db/codebases';

export async function handleMessage(
  platform: IPlatformAdapter,
  conversationId: string,
  message: string,
  issueContext?: string,
  threadContext?: string,
  parentConversationId?: string,
  images?: ImageAttachment[]
): Promise<void> {
  // Load conversation and codebase
  const conversation = await db.getOrCreateConversation(...);
  const codebase = conversation.codebase_id
    ? await codebaseDb.getCodebase(conversation.codebase_id)
    : null;

  // Save user message to history
  await messagesDb.createMessage(
    conversation.id,
    platform.getPlatformType() as any, // 'github' | 'telegram' | etc.
    codebase?.id || null,
    codebase?.name || null,
    'user',
    message,
    images
  );

  // Handle slash command or AI query...
  // ... (existing logic)

  // After AI responds, save assistant message
  if (mode === 'stream') {
    let fullResponse = '';
    for await (const msg of aiClient.sendQuery(...)) {
      if (msg.type === 'assistant' && msg.content) {
        fullResponse += msg.content;
        await platform.sendMessage(conversationId, msg.content);
      }
    }

    // Save complete assistant response
    if (fullResponse) {
      await messagesDb.createMessage(
        conversation.id,
        platform.getPlatformType() as any,
        codebase?.id || null,
        codebase?.name || null,
        'assistant',
        fullResponse
      );
    }
  } else {
    // Batch mode - save final message
    // ... (similar logic)
  }
}
```

### Step 4: Add /resume Command

**File: `src/handlers/command-handler.ts`**

```typescript
case 'resume':
  // Load last 50 messages
  const history = await messagesDb.getMessageHistory(conversation.id, 50);

  if (history.length === 0) {
    return {
      success: true,
      message: '📜 No previous messages found. Starting fresh!',
    };
  }

  // Format as context
  const contextPrompt = messagesDb.formatMessagesAsContext(history);

  // Deactivate current session and create new one with context
  if (session) {
    await sessionDb.deactivateSession(session.id);
  }

  // Store context in session metadata
  const newSession = await sessionDb.createSession({
    conversation_id: conversation.id,
    codebase_id: conversation.codebase_id,
    ai_assistant_type: conversation.ai_assistant_type,
    active: true,
    metadata: {
      resumedWithHistory: true,
      historyMessageCount: history.length,
      historyContext: contextPrompt,
    },
  });

  return {
    success: true,
    message: `📜 Loaded last ${history.length} messages from conversation history.\n\n` +
             `🔍 Projects: ${Array.from(new Set(history.map(m => m.codebase_name).filter(Boolean))).join(', ')}\n` +
             `📱 Platforms: ${Array.from(new Set(history.map(m => m.platform_type))).join(', ')}\n\n` +
             `Context is now active. Continue the conversation!`,
    modified: true,
  };
```

### Step 5: Send Context to AI on First Message After Resume

**File: `src/orchestrator/orchestrator.ts`**

```typescript
// Check if session has resumed context
if (session?.metadata?.resumedWithHistory && session.metadata.historyContext) {
  // Prepend history context to first message
  const contextPrompt = session.metadata.historyContext as string;
  promptToSend = `${contextPrompt}\n\nCurrent message: ${promptToSend}`;

  // Clear the flag so we don't send it again
  await sessionDb.updateSessionMetadata(session.id, {
    ...session.metadata,
    resumedWithHistory: false,
    historyContext: undefined,
  });
}
```

---

## Example Usage Scenarios

### Scenario 1: Telegram Crash Recovery

```
# Before crash
User (Telegram, topic "scar"): "Implement message history feature"
AI: "I'll add a messages table with platform tagging..."
[VM crashes]

# After restart
User (Telegram): "/resume"
Bot: "📜 Loaded last 50 messages from conversation history.
     🔍 Projects: scar
     📱 Platforms: telegram

     Context is now active. Continue the conversation!"

User: "Did you finish the implementation?"
AI: "Yes, I was implementing the message history feature before the crash.
     I had just added the schema with platform_type and codebase_id columns..."
```

### Scenario 2: Cross-Platform Work

```
# Work on GitHub
User (GitHub, issue #42): "@scar implement login fix"
AI: "I'll fix the authentication bug..."

# Later on Telegram
User (Telegram): "/resume"
Bot: "📜 Loaded last 50 messages
     🔍 Projects: my-app
     📱 Platforms: github, telegram"

User: "What was I working on?"
AI: "You were working on issue #42 - fixing the login authentication bug.
     I implemented the fix in auth.ts..."
```

### Scenario 3: CLI Claude Code Usage

```bash
# From scar directory
cd /home/samuel/scar

# SCAR conversations are available but NOT auto-loaded for CLI
# CLI Claude has its own session management

# To check what SCAR bot was working on:
# Query the database directly or use SCAR's /status command via Telegram
```

**Note:** CLI Claude Code sessions are separate. Message history is for SCAR bot instances only.

---

## SQL Query Examples for Tracing History

### Query 1: All messages for a project across platforms

```sql
SELECT
  created_at,
  platform_type,
  sender,
  LEFT(content, 100) as preview
FROM remote_agent_messages
WHERE codebase_name = 'scar'
ORDER BY created_at DESC
LIMIT 20;
```

**Example Output:**
```
2026-01-05 10:30 | telegram | user      | "Implement message history"
2026-01-05 10:31 | telegram | assistant | "I'll add a messages table..."
2026-01-05 11:00 | github   | user      | "@scar review the implementation"
2026-01-05 11:01 | github   | assistant | "The implementation looks good..."
```

### Query 2: Conversation statistics

```sql
SELECT
  codebase_name,
  platform_type,
  COUNT(*) as message_count
FROM remote_agent_messages
GROUP BY codebase_name, platform_type
ORDER BY message_count DESC;
```

**Example Output:**
```
scar          | telegram | 145
health-agent  | telegram |  89
scar          | github   |  34
my-app        | github   |  12
```

### Query 3: Recent activity across all projects

```sql
SELECT
  codebase_name,
  platform_type,
  COUNT(*) as messages_today
FROM remote_agent_messages
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY codebase_name, platform_type;
```

---

## Configuration

**Environment Variables:**

```env
# Message History Settings
ENABLE_MESSAGE_HISTORY=true        # Toggle feature on/off
MESSAGE_HISTORY_LIMIT=50           # Number of messages for /resume
MESSAGE_RETENTION_DAYS=30          # Auto-delete old messages (future)
```

---

## Testing Plan

### Test 1: Message Saving

```bash
# Via Telegram
User: "Hello SCAR"
# Verify in DB
docker exec scar-postgres-1 psql -U postgres -d remote_coding_agent \
  -c "SELECT * FROM remote_agent_messages ORDER BY created_at DESC LIMIT 5;"
```

### Test 2: /resume Command

```bash
# Have a conversation
User: "Implement feature X"
AI: "I'll start by..."
User: "Add tests too"
AI: "Here are the tests..."

# Use /resume
User: "/resume"
Bot: "📜 Loaded last 50 messages..."

# Verify context
User: "What were we working on?"
AI: "We were implementing feature X and I added tests..."
```

### Test 3: Cross-Platform Tracing

```bash
# Work on GitHub
@scar "Start feature implementation"

# Switch to Telegram
User: "/resume"
# Should see GitHub messages in context

# Query DB to verify
SELECT platform_type, sender, content
FROM remote_agent_messages
WHERE codebase_name = 'my-app'
ORDER BY created_at;
```

---

## Migration Path

### For Existing Installations

1. **Backup database** (optional but recommended)
2. **Run migration 005 enhanced**
3. **Replace messages.ts with messages-enhanced.ts**
4. **Update orchestrator to save messages**
5. **Add /resume command to command handler**
6. **Restart SCAR**
7. **Test with Telegram conversation**

### For Fresh Installations

1. **Update 000_combined.sql** to include enhanced message schema
2. **Use messages-enhanced.ts from the start**
3. **Message history works out of the box**

---

## Future Enhancements

### Phase 2: Automatic Retention

- Cron job to delete messages older than 30 days
- Keep only last 1000 messages per conversation
- Compress old messages into summaries

### Phase 3: Message Search

- Full-text search across messages
- `/search "authentication bug"` - find relevant conversations
- Export conversation history as markdown

### Phase 4: Smart Context Loading

- Detect conversation topics
- Only load relevant messages (semantic search)
- Summarize very old messages

---

## Pros & Cons Summary

### ✅ Pros

- **Crash Recovery**: Never lose conversation context
- **Clear Traceability**: Know exactly which platform/project each message came from
- **Efficient**: Only loads on `/resume`, not every message
- **50 Message Sweet Spot**: Good context without token waste
- **Fast Queries**: Explicit columns = no joins needed

### ⚠️ Potential Concerns

- **Storage Growth**: Long conversations accumulate messages (mitigation: retention policy)
- **Privacy**: Messages stored in DB (mitigation: already using PostgreSQL, same security)
- **Token Usage**: 50 messages ≈ 6-12k tokens (mitigation: only ~5% of context window)
- **CLI Claude Separation**: CLI sessions not integrated (mitigation: feature is for SCAR bot only)

---

## Implementation Checklist

- [ ] Run enhanced migration (005_add_message_history_enhanced.sql)
- [ ] Replace src/db/messages.ts with enhanced version
- [ ] Update Message interface in src/types/index.ts
- [ ] Add message saving in orchestrator (user messages)
- [ ] Add message saving in orchestrator (AI responses)
- [ ] Implement /resume command in command-handler.ts
- [ ] Add context loading in orchestrator
- [ ] Test with Telegram conversation
- [ ] Test with GitHub issue
- [ ] Test cross-platform scenario
- [ ] Update CLAUDE.md with /resume documentation
- [ ] Add env vars to .env.example

---

## Next Steps

Ready to implement? The plan is:

1. **Run migration** (2 min)
2. **Update database layer** (5 min)
3. **Integrate saving in orchestrator** (10 min)
4. **Add /resume command** (10 min)
5. **Test everything** (5 min)

**Total time**: ~30 minutes

Let me know when you're ready to proceed!
