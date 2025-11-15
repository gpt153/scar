# Architecture Guide

Comprehensive guide to understanding and extending the Remote Coding Agent platform.

**Navigation:** [Overview](#system-overview) • [Adding Platforms](#adding-platform-adapters) • [Adding AI Assistants](#adding-ai-assistant-clients) • [Commands](#command-system) • [Streaming](#streaming-modes) • [Database](#database-schema)

---

## System Overview

The Remote Coding Agent is a **platform-agnostic AI coding assistant orchestrator** that connects messaging platforms (Telegram, GitHub, Slack) to AI coding assistants (Claude Code, Codex) via a unified interface.

### Core Architecture

```
┌─────────────────────────────────────────────┐
│   Platform Adapters (Telegram, GitHub)      │
│   • IPlatformAdapter interface              │
│   • Handle platform-specific messaging      │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│            Orchestrator                     │
│   • Route slash commands → Command Handler  │
│   • Route AI queries → Assistant Clients    │
│   • Manage session lifecycle                │
│   • Stream responses back to platforms      │
└──────────────┬──────────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌─────────────┐  ┌─────────────────────┐
│  Command    │  │  AI Assistant       │
│  Handler    │  │  Clients            │
│             │  │  • IAssistantClient │
│  (Slash     │  │  • Factory pattern  │
│  commands)  │  │  • Streaming API    │
└─────────────┘  └────────┬────────────┘
       │                  │
       └────────┬─────────┘
                ▼
┌─────────────────────────────────────────────┐
│        PostgreSQL (3 Tables)                │
│  • Codebases  • Conversations  • Sessions   │
└─────────────────────────────────────────────┘
```

### Key Design Principles

1. **Interface-driven**: Both platform adapters and AI clients implement strict interfaces for swappability
2. **Streaming-first**: All AI responses stream through async generators for real-time delivery
3. **Session persistence**: AI sessions survive container restarts via database storage
4. **Generic commands**: Users define commands in Git-versioned markdown files, not hardcoded
5. **Platform-specific streaming**: Each platform controls whether to stream or batch responses

---

## Adding Platform Adapters

Platform adapters connect messaging platforms to the orchestrator. Implement the `IPlatformAdapter` interface to add new platforms.

### IPlatformAdapter Interface

**Location:** `src/types/index.ts:49-74`

```typescript
export interface IPlatformAdapter {
  // Send a message to the platform
  sendMessage(conversationId: string, message: string): Promise<void>;

  // Get the configured streaming mode
  getStreamingMode(): 'stream' | 'batch';

  // Get the platform type identifier
  getPlatformType(): string;

  // Start the platform adapter (e.g., begin polling, start webhook server)
  start(): Promise<void>;

  // Stop the platform adapter gracefully
  stop(): void;
}
```

### Implementation Guide

**1. Create adapter file:** `src/adapters/your-platform.ts`

**2. Implement the interface:**

```typescript
import { IPlatformAdapter } from '../types';

export class YourPlatformAdapter implements IPlatformAdapter {
  private streamingMode: 'stream' | 'batch';

  constructor(config: YourPlatformConfig, mode: 'stream' | 'batch' = 'stream') {
    this.streamingMode = mode;
    // Initialize your platform SDK/client
  }

  async sendMessage(conversationId: string, message: string): Promise<void> {
    // Platform-specific message sending logic
    // Handle message length limits, formatting, etc.
  }

  getStreamingMode(): 'stream' | 'batch' {
    return this.streamingMode;
  }

  getPlatformType(): string {
    return 'your-platform'; // Used as platform_type in database
  }

  async start(): Promise<void> {
    // Start polling, webhook server, WebSocket connection, etc.
    // Example: this.client.startPolling();
  }

  stop(): void {
    // Cleanup: stop polling, close connections
  }
}
```

**3. Register in main app:** `src/index.ts`

```typescript
import { YourPlatformAdapter } from './adapters/your-platform';

// Read environment variables
const yourPlatformToken = process.env.YOUR_PLATFORM_TOKEN;
const yourPlatformMode = (process.env.YOUR_PLATFORM_STREAMING_MODE || 'stream') as 'stream' | 'batch';

if (yourPlatformToken) {
  const adapter = new YourPlatformAdapter(yourPlatformToken, yourPlatformMode);

  // Set up message handler
  adapter.onMessage(async (conversationId, message) => {
    await handleMessage(adapter, conversationId, message);
  });

  await adapter.start();
  console.log('[YourPlatform] Adapter started');
}
```

**4. Add environment variables:** `.env.example`

```env
# Your Platform
YOUR_PLATFORM_TOKEN=<token>
YOUR_PLATFORM_STREAMING_MODE=stream  # stream | batch
```

### Platform-Specific Considerations

#### Conversation ID Format

Each platform must provide a unique, stable conversation ID:

- **Telegram**: `chat_id` (e.g., `"123456789"`)
- **GitHub**: `owner/repo#issue_number` (e.g., `"user/repo#42"`)
- **Slack**: `thread_ts` or `channel_id+thread_ts`

#### Message Length Limits

Handle platform-specific message limits in `sendMessage()`:

```typescript
async sendMessage(conversationId: string, message: string): Promise<void> {
  const MAX_LENGTH = 4096; // Telegram's limit

  if (message.length <= MAX_LENGTH) {
    await this.client.sendMessage(conversationId, message);
  } else {
    // Split long messages intelligently (by lines, paragraphs, etc.)
    const chunks = splitMessage(message, MAX_LENGTH);
    for (const chunk of chunks) {
      await this.client.sendMessage(conversationId, chunk);
    }
  }
}
```

**Reference:** `src/adapters/telegram.ts:28-55`

#### Polling vs Webhooks

**Polling** (Telegram pattern):
```typescript
async start(): Promise<void> {
  this.bot.on('message', async (ctx) => {
    const conversationId = this.getConversationId(ctx);
    const message = ctx.message.text;
    await this.onMessageHandler(conversationId, message);
  });

  await this.bot.launch({ dropPendingUpdates: true });
}
```

**Webhooks** (GitHub pattern):
```typescript
// In src/index.ts, add Express route
app.post('/webhooks/your-platform', async (req, res) => {
  const signature = req.headers['x-signature'];
  const payload = req.body;

  await adapter.handleWebhook(payload, signature);
  res.sendStatus(200);
});

// In adapter
async handleWebhook(payload: any, signature: string): Promise<void> {
  // Verify signature
  if (!this.verifySignature(payload, signature)) return;

  // Parse event, extract conversationId and message
  const { conversationId, message } = this.parseEvent(payload);

  // Route to orchestrator
  await handleMessage(this, conversationId, message);
}
```

**Reference:** `src/adapters/github.ts:378-491`

---

## Adding AI Assistant Clients

AI assistant clients wrap AI SDKs and provide a unified streaming interface. Implement the `IAssistantClient` interface to add new assistants.

### IAssistantClient Interface

**Location:** `src/types/index.ts:93-106`

```typescript
export interface IAssistantClient {
  // Send a query and get streaming response
  sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<MessageChunk>;

  // Get the assistant type identifier
  getType(): string;
}
```

### MessageChunk Types

```typescript
interface MessageChunk {
  type: 'assistant' | 'result' | 'system' | 'tool' | 'thinking';
  content?: string;       // Text content for assistant/system/thinking
  sessionId?: string;     // Session ID for result type
  toolName?: string;      // Tool name for tool type
  toolInput?: Record<string, unknown>; // Tool parameters
}
```

### Implementation Guide

**1. Create client file:** `src/clients/your-assistant.ts`

**2. Implement the interface:**

```typescript
import { IAssistantClient, MessageChunk } from '../types';

export class YourAssistantClient implements IAssistantClient {
  async *sendQuery(
    prompt: string,
    cwd: string,
    resumeSessionId?: string
  ): AsyncGenerator<MessageChunk> {
    // Initialize or resume session
    let session;
    if (resumeSessionId) {
      console.log(`[YourAssistant] Resuming session: ${resumeSessionId}`);
      session = await this.resumeSession(resumeSessionId);
    } else {
      console.log(`[YourAssistant] Starting new session in ${cwd}`);
      session = await this.startSession(cwd);
    }

    // Send query to AI and stream responses
    for await (const event of this.sdk.streamQuery(session, prompt)) {
      // Map SDK events to MessageChunk types
      if (event.type === 'text_response') {
        yield { type: 'assistant', content: event.text };
      } else if (event.type === 'tool_call') {
        yield {
          type: 'tool',
          toolName: event.tool,
          toolInput: event.parameters,
        };
      } else if (event.type === 'thinking') {
        yield { type: 'thinking', content: event.reasoning };
      }
    }

    // Yield session ID for persistence
    yield { type: 'result', sessionId: session.id };
  }

  getType(): string {
    return 'your-assistant';
  }
}
```

**3. Register in factory:** `src/clients/factory.ts`

```typescript
import { YourAssistantClient } from './your-assistant';

export function getAssistantClient(type: string): IAssistantClient {
  switch (type) {
    case 'claude':
      return new ClaudeClient();
    case 'codex':
      return new CodexClient();
    case 'your-assistant':
      return new YourAssistantClient();
    default:
      throw new Error(`Unknown assistant type: ${type}`);
  }
}
```

**4. Add environment variables:** `.env.example`

```env
# Your Assistant
YOUR_ASSISTANT_API_KEY=<key>
YOUR_ASSISTANT_MODEL=<model-name>
```

### Session Management

**Key concepts:**

- **Session ID persistence**: Store `assistant_session_id` in database to resume context
- **New session trigger**: Only on plan→execute transition (per PRD requirement)
- **Session resume**: All other commands resume existing active session

**Orchestrator logic** (`src/orchestrator/orchestrator.ts:122-145`):

```typescript
// Check for plan→execute transition (requires NEW session)
const needsNewSession =
  commandName === 'execute' &&
  session?.metadata?.lastCommand === 'plan-feature';

if (needsNewSession) {
  // Deactivate old session, create new one
  await sessionDb.deactivateSession(session.id);
  session = await sessionDb.createSession({...});
} else if (!session) {
  // No session exists - create one
  session = await sessionDb.createSession({...});
} else {
  // Resume existing session
  console.log(`Resuming session ${session.id}`);
}
```

### Streaming Event Mapping

Different SDKs use different event types. Map them to MessageChunk types:

**Claude Code SDK** (`src/clients/claude.ts:74-99`):

```typescript
for await (const msg of query({ prompt, options })) {
  if (msg.type === 'assistant') {
    for (const block of msg.message.content) {
      if (block.type === 'text') {
        yield { type: 'assistant', content: block.text };
      } else if (block.type === 'tool_use') {
        yield {
          type: 'tool',
          toolName: block.name,
          toolInput: block.input,
        };
      }
    }
  } else if (msg.type === 'result') {
    yield { type: 'result', sessionId: msg.session_id };
  }
}
```

**Codex SDK** (`src/clients/codex.ts:88-148`):

```typescript
for await (const event of result.events) {
  if (event.type === 'item.completed') {
    switch (event.item.type) {
      case 'agent_message':
        yield { type: 'assistant', content: event.item.text };
        break;
      case 'command_execution':
        yield { type: 'tool', toolName: event.item.command };
        break;
      case 'reasoning':
        yield { type: 'thinking', content: event.item.text };
        break;
    }
  } else if (event.type === 'turn.completed') {
    yield { type: 'result', sessionId: thread.id };
    break; // CRITICAL: Exit loop on turn completion
  }
}
```

### Error Handling

**Wrap SDK calls in try-catch:**

```typescript
try {
  for await (const event of this.sdk.streamQuery(...)) {
    yield mapEventToChunk(event);
  }
} catch (error) {
  console.error('[YourAssistant] Query error:', error);
  throw new Error(`Query failed: ${error.message}`);
}
```

**Handle SDK-specific errors:**

```typescript
if (event.type === 'error') {
  // Log but don't crash - some errors are non-fatal
  console.error('[YourAssistant] Stream error:', event.message);

  // Only yield user-facing errors
  if (!event.message.includes('internal')) {
    yield { type: 'system', content: `⚠️ ${event.message}` };
  }
}
```

---

## Command System

The command system allows users to define custom workflows in Git-versioned markdown files.

### Architecture

```
User: /command-invoke plan "Add dark mode"
           ↓
Orchestrator: Parse command + args
           ↓
Read file: .claude/commands/plan.md
           ↓
Variable substitution: $1 → "Add dark mode"
           ↓
Send to AI client: Injected prompt
           ↓
Stream responses back to platform
```

### Command Storage

**Database schema** (JSONB in `remote_agent_codebases` table):

```json
{
  "prime": {
    "path": ".claude/commands/prime.md",
    "description": "Research codebase"
  },
  "plan": {
    "path": ".claude/commands/plan-feature.md",
    "description": "Create implementation plan"
  }
}
```

**File-based**: Commands are markdown files in the repository, **not** stored in database. Only paths and metadata are stored.

### Command Registration

**Manual registration** (`/command-set`):

```bash
/command-set analyze .claude/commands/analyze.md
```

**Bulk loading** (`/load-commands`):

```bash
/load-commands .claude/commands
# Loads all .md files: prime.md → prime, plan.md → plan
```

**Auto-detection** (on `/clone` or GitHub webhook):

```typescript
// Detect command folders
const commandFolders = ['.claude/commands', '.agents/commands'];

for (const folder of commandFolders) {
  if (await folderExists(join(repoPath, folder))) {
    await autoLoadCommands(folder, codebaseId);
    break;
  }
}
```

**Reference:** `src/adapters/github.ts:266-293`

### Variable Substitution

**Supported variables:**

- `$1`, `$2`, `$3`, ... - Positional arguments
- `$ARGUMENTS` - All arguments as single string
- `\$` - Escaped dollar sign (literal `$`)

**Implementation** (`src/utils/variable-substitution.ts`):

```typescript
export function substituteVariables(
  text: string,
  args: string[],
  metadata: Record<string, unknown> = {}
): string {
  let result = text;

  // Replace $1, $2, $3, etc.
  args.forEach((arg, index) => {
    result = result.replace(new RegExp(`\\$${index + 1}`, 'g'), arg);
  });

  // Replace $ARGUMENTS
  result = result.replace(/\$ARGUMENTS/g, args.join(' '));

  // Replace escaped dollar signs
  result = result.replace(/\\\$/g, '$');

  return result;
}
```

**Example:**

```markdown
<!-- .claude/commands/analyze.md -->
Analyze the following aspect of the codebase: $1

Focus on: $ARGUMENTS

Provide recommendations for improvement.
```

```bash
/command-invoke analyze "security" "authentication" "authorization"
# Becomes:
# Analyze the following aspect of the codebase: security
# Focus on: security authentication authorization
# Provide recommendations for improvement.
```

### Slash Command Routing

**Orchestrator logic** (`src/orchestrator/orchestrator.ts:28-42`):

```typescript
if (message.startsWith('/')) {
  if (!message.startsWith('/command-invoke')) {
    // Handle deterministic commands (help, status, clone, etc.)
    const result = await commandHandler.handleCommand(conversation, message);
    await platform.sendMessage(conversationId, result.message);
    return;
  }
  // /command-invoke falls through to AI handling
}
```

**Command categories:**

1. **Deterministic** (handled by Command Handler):
   - `/help`, `/status`, `/getcwd`, `/setcwd`
   - `/clone`, `/repos`
   - `/command-set`, `/load-commands`, `/commands`
   - `/reset`

2. **AI-invoked** (handled by Orchestrator):
   - `/command-invoke <name> [args...]` - Loads command file and sends to AI

### Command Handler Implementation

**Reference:** `src/handlers/command-handler.ts`

**Key patterns:**

```typescript
export async function handleCommand(
  conversation: Conversation,
  message: string
): Promise<CommandResult> {
  const { command, args } = parseCommand(message);

  switch (command) {
    case 'clone':
      // Clone repo, create codebase, update conversation
      return { success: true, message: '...', modified: true };

    case 'setcwd':
      // Update working directory, reset session
      await db.updateConversation(conversation.id, { cwd: args[0] });
      await sessionDb.deactivateSession(session.id);
      return { success: true, message: '...', modified: true };

    case 'load-commands':
      // Scan folder, register all .md files
      const files = await readdir(folderPath).filter(f => f.endsWith('.md'));
      await codebaseDb.updateCodebaseCommands(codebase.id, commands);
      return { success: true, message: `Loaded ${files.length} commands` };
  }
}
```

**Important:** `modified: true` flag signals orchestrator to reload conversation state.

---

## Streaming Modes

Streaming modes control how AI responses are delivered to users: real-time (stream) or accumulated (batch).

### Configuration

**Environment variables** (per-platform):

```env
TELEGRAM_STREAMING_MODE=stream  # Default: stream (real-time chat)
GITHUB_STREAMING_MODE=batch     # Default: batch (single comment)
SLACK_STREAMING_MODE=stream     # Default: stream (real-time chat)
```

### Mode Comparison

| Mode | Behavior | Pros | Cons | Best For |
|------|----------|------|------|----------|
| **stream** | Send each chunk immediately as AI generates | Real-time feedback, engaging, see progress | Many API calls, potential rate limits | Chat platforms (Telegram, Slack) |
| **batch** | Accumulate all chunks, send final summary | Single message, no spam, clean | No progress indication, longer wait | Issue trackers (GitHub, Jira) |

### Implementation

**Orchestrator logic** (`src/orchestrator/orchestrator.ts:148-228`):

```typescript
const mode = platform.getStreamingMode();

if (mode === 'stream') {
  // Send each chunk immediately
  for await (const msg of aiClient.sendQuery(...)) {
    if (msg.type === 'assistant' && msg.content) {
      await platform.sendMessage(conversationId, msg.content);
    } else if (msg.type === 'tool' && msg.toolName) {
      const toolMessage = formatToolCall(msg.toolName, msg.toolInput);
      await platform.sendMessage(conversationId, toolMessage);
    }
  }
} else {
  // Batch: Accumulate all chunks
  const assistantMessages: string[] = [];

  for await (const msg of aiClient.sendQuery(...)) {
    if (msg.type === 'assistant' && msg.content) {
      assistantMessages.push(msg.content);
    }
    // Tool calls logged but not sent to user
  }

  // Extract clean summary (filter out tool indicators)
  const finalMessage = extractCleanSummary(assistantMessages);
  await platform.sendMessage(conversationId, finalMessage);
}
```

### Tool Call Formatting

**Stream mode**: Display tool calls in real-time

```
🔧 BASH
git status

🔧 READ
Reading: src/index.ts

🔧 EDIT
Editing: src/components/Header.tsx
```

**Batch mode**: Filter out tool indicators from final response

```typescript
// Tool indicators: 🔧, 💭, 📝, ✏️, 🗑️, 📂, 🔍
const toolIndicatorRegex = /^(?:\u{1F527}|\u{1F4AD}|\u{1F4DD}|...)/u;

const cleanSections = sections.filter(section => {
  return !toolIndicatorRegex.exec(section.trim());
});

const finalMessage = cleanSections.join('\n\n').trim();
```

**Reference:** `src/orchestrator/orchestrator.ts:197-222`

### Tool Formatter Utility

**Location:** `src/utils/tool-formatter.ts`

```typescript
export function formatToolCall(
  toolName: string,
  toolInput?: Record<string, unknown>
): string {
  let message = `🔧 ${toolName.toUpperCase()}`;

  // Add context-specific info
  if (toolName === 'Bash' && toolInput?.command) {
    message += `\n${toolInput.command}`;
  } else if (toolName === 'Read' && toolInput?.file_path) {
    message += `\nReading: ${toolInput.file_path}`;
  } else if (toolName === 'Edit' && toolInput?.file_path) {
    message += `\nEditing: ${toolInput.file_path}`;
  }

  return message;
}
```

---

## Database Schema

The platform uses a minimal 3-table schema with `remote_agent_` prefix.

### Schema Overview

```sql
remote_agent_codebases
├── id (UUID)
├── name (VARCHAR)
├── repository_url (VARCHAR)
├── default_cwd (VARCHAR)
├── ai_assistant_type (VARCHAR) -- 'claude' | 'codex'
└── commands (JSONB) -- {command_name: {path, description}}

remote_agent_conversations
├── id (UUID)
├── platform_type (VARCHAR) -- 'telegram' | 'github' | 'slack'
├── platform_conversation_id (VARCHAR) -- Platform-specific ID
├── codebase_id (UUID → remote_agent_codebases.id)
├── cwd (VARCHAR) -- Current working directory
├── ai_assistant_type (VARCHAR) -- LOCKED at creation
└── UNIQUE(platform_type, platform_conversation_id)

remote_agent_sessions
├── id (UUID)
├── conversation_id (UUID → remote_agent_conversations.id)
├── codebase_id (UUID → remote_agent_codebases.id)
├── ai_assistant_type (VARCHAR) -- Must match conversation
├── assistant_session_id (VARCHAR) -- SDK session ID for resume
├── active (BOOLEAN) -- Only one active per conversation
└── metadata (JSONB) -- {lastCommand: "plan-feature", ...}
```

### Database Operations

**Location:** `src/db/`

**Codebases** (`src/db/codebases.ts`):
- `createCodebase()` - Create codebase record
- `getCodebase(id)` - Get by ID
- `findCodebaseByRepoUrl(url)` - Find by repository URL
- `registerCommand(id, name, def)` - Add single command
- `updateCodebaseCommands(id, commands)` - Bulk update commands
- `getCodebaseCommands(id)` - Get all commands

**Conversations** (`src/db/conversations.ts`):
- `getOrCreateConversation(platform, id)` - Idempotent get/create
- `updateConversation(id, data)` - Update fields

**Sessions** (`src/db/sessions.ts`):
- `createSession(data)` - Create new session
- `getActiveSession(conversationId)` - Get active session for conversation
- `updateSession(id, sessionId)` - Update `assistant_session_id`
- `updateSessionMetadata(id, metadata)` - Update metadata JSONB
- `deactivateSession(id)` - Mark session inactive

### Session Lifecycle

**Normal flow:**

```
1. User sends message
   → getOrCreateConversation()
   → getActiveSession() // null if first message

2. No session exists
   → createSession({ active: true })

3. Send to AI, get session ID
   → updateSession(session.id, aiSessionId)

4. User sends another message
   → getActiveSession() // returns existing
   → Resume with assistant_session_id

5. User sends /reset
   → deactivateSession(session.id)
   → Next message creates new session
```

**Plan→Execute transition:**

```
1. /command-invoke plan-feature "Add dark mode"
   → createSession() or resumeSession()
   → updateSessionMetadata({ lastCommand: 'plan-feature' })

2. /command-invoke execute
   → getActiveSession() // check metadata.lastCommand
   → lastCommand === 'plan-feature' → needsNewSession = true
   → deactivateSession(oldSession.id)
   → createSession({ active: true })
   → Fresh context for implementation
```

**Reference:** `src/orchestrator/orchestrator.ts:122-145`

---

## Message Flow Examples

### Telegram Chat Flow

```
User types: /clone https://github.com/user/repo
         ↓
TelegramAdapter receives update
         ↓
Extract conversationId = chat_id
         ↓
Orchestrator.handleMessage(adapter, chatId, "/clone ...")
         ↓
Command Handler: /clone
  - Execute git clone
  - Create codebase record
  - Update conversation.codebase_id
  - Detect .claude/commands/
         ↓
Send response: "Repository cloned! Found: .claude/commands/"
```

```
User types: /command-invoke prime
         ↓
Orchestrator: Parse command
         ↓
Load command file: .claude/commands/prime.md
         ↓
Variable substitution (no args in this case)
         ↓
Get or create session
         ↓
ClaudeClient.sendQuery(prompt, cwd, sessionId)
         ↓
Stream mode: Send each chunk immediately
  - "🔧 GLOB" → user sees tool call
  - "I'm analyzing..." → user sees text
  - "🔧 READ" → user sees file read
  - "Here's what I found..." → user sees summary
         ↓
Save session ID for next message
```

### GitHub Webhook Flow

```
User comments: @remote-agent /command-invoke prime
         ↓
GitHub sends webhook to POST /webhooks/github
         ↓
GitHubAdapter.handleWebhook(payload, signature)
  - Verify HMAC signature
  - Parse event: issue_comment.created
  - Extract: owner/repo#42, comment text
  - Check for @remote-agent mention
         ↓
First mention on this issue?
  - Yes → Clone repo, create codebase, load commands
  - No → Use existing codebase
         ↓
Strip @remote-agent from comment
         ↓
Orchestrator.handleMessage(adapter, "user/repo#42", "/command-invoke prime")
         ↓
Load command file, substitute variables
         ↓
Get or create session
         ↓
CodexClient.sendQuery(prompt, cwd, sessionId)
         ↓
Batch mode: Accumulate all chunks
  - Log tool calls for observability
  - Collect all assistant messages
         ↓
Extract clean summary (filter tool indicators)
         ↓
Post single comment on issue with summary
```

---

## Extension Checklist

### Adding a New Platform Adapter

- [ ] Create `src/adapters/your-platform.ts`
- [ ] Implement `IPlatformAdapter` interface
- [ ] Handle message length limits in `sendMessage()`
- [ ] Implement conversation ID extraction
- [ ] Set up polling or webhook handling
- [ ] Add to `src/index.ts` with environment variable check
- [ ] Add environment variables to `.env.example`
- [ ] Update README with setup instructions
- [ ] Test with both stream and batch modes

### Adding a New AI Assistant Client

- [ ] Create `src/clients/your-assistant.ts`
- [ ] Implement `IAssistantClient` interface
- [ ] Map SDK events to `MessageChunk` types
- [ ] Handle session creation and resumption
- [ ] Implement error handling and recovery
- [ ] Add to `src/clients/factory.ts`
- [ ] Add environment variables to `.env.example`
- [ ] Update README with authentication setup
- [ ] Test session persistence across restarts
- [ ] Test plan→execute transition (new session)

### Modifying Command System

- [ ] Update `substituteVariables()` for new variable types
- [ ] Add command to Command Handler for deterministic logic
- [ ] Update `/help` command output
- [ ] Document new command in README
- [ ] Add example command file to `.claude/commands/`
- [ ] Test variable substitution with edge cases

---

## Common Patterns

### Idempotent Operations

```typescript
// Get or create - never fails
const conversation = await db.getOrCreateConversation(platform, id);

// Find or create codebase (GitHub adapter pattern)
const existing = await codebaseDb.findCodebaseByRepoUrl(url);
if (existing) return existing;
return await codebaseDb.createCodebase({...});
```

### Session Safety

```typescript
// Always check for active session
const session = await sessionDb.getActiveSession(conversationId);

// Deactivate before creating new
if (session) {
  await sessionDb.deactivateSession(session.id);
}

// Create new session
const newSession = await sessionDb.createSession({...});
```

### Streaming Error Handling

```typescript
try {
  for await (const msg of aiClient.sendQuery(...)) {
    if (msg.type === 'assistant') {
      await platform.sendMessage(conversationId, msg.content);
    }
  }
} catch (error) {
  console.error('[Orchestrator] Error:', error);
  await platform.sendMessage(
    conversationId,
    '⚠️ An error occurred. Try /reset.'
  );
}
```

### Context Injection

```typescript
// GitHub: Inject issue/PR context for first message
let finalMessage = command;
if (isFirstCommandInvoke && issue) {
  const context = `GitHub Issue #${issue.number}: "${issue.title}"`;
  finalMessage = finalMessage + '\n\n---\n\n' + context;
}

await handleMessage(adapter, conversationId, finalMessage);
```

**Reference:** `src/adapters/github.ts:441-479`

---

## Key Takeaways

1. **Interfaces enable extensibility**: Both `IPlatformAdapter` and `IAssistantClient` allow adding platforms and AI assistants without modifying core logic

2. **Async generators for streaming**: All AI clients return `AsyncGenerator<MessageChunk>` for unified streaming across different SDKs

3. **Session persistence is critical**: Store `assistant_session_id` in database to maintain context across restarts

4. **Platform-specific streaming**: Each platform controls its own streaming mode via environment variables

5. **Commands are file-based**: Store only paths in database, actual commands in Git-versioned files

6. **Plan→execute is special**: Only transition requiring new session (prevents token bloat during implementation)

7. **Factory pattern for clients**: Single factory function (`getAssistantClient()`) instantiates correct client based on conversation's `ai_assistant_type`

8. **Error recovery**: Always provide `/reset` escape hatch for users when sessions get stuck

---

**For detailed implementation examples, see:**
- Platform adapter: `src/adapters/telegram.ts`, `src/adapters/github.ts`
- AI client: `src/clients/claude.ts`, `src/clients/codex.ts`
- Orchestrator: `src/orchestrator/orchestrator.ts`
- Command handler: `src/handlers/command-handler.ts`
