# CLI Claude Code Message History Integration

## Problem

User runs CLI Claude from `/home/samuel/scar` but may discuss multiple projects:
- "Add auth to health-agent"
- "Fix bug in scar"
- "Deploy my-app"

How do we tag these messages with the correct project?

## Proposed Solution: Hybrid Tagging

### 1. Primary Project (from Git)

```typescript
// utils/cli-project-detector.ts
import { execSync } from 'child_process';
import { resolve } from 'path';

export function detectPrimaryProject(cwd: string): {
  projectName: string | null;
  source: 'git' | 'directory' | 'none';
} {
  try {
    // Try to get git repo name
    const gitRemote = execSync('git remote get-url origin', { cwd, encoding: 'utf-8' }).trim();
    // Extract: git@github.com:user/scar.git -> scar
    const match = gitRemote.match(/\/([^/]+?)(?:\.git)?$/);
    if (match) {
      return { projectName: match[1], source: 'git' };
    }
  } catch {
    // Not a git repo
  }

  // Fallback: Use directory name
  const dirName = resolve(cwd).split('/').pop();
  if (dirName && dirName !== 'home') {
    return { projectName: dirName, source: 'directory' };
  }

  return { projectName: null, source: 'none' };
}
```

### 2. Secondary Projects (from AI Analysis)

```typescript
// After saving message, extract mentioned projects
const mentionedProjects = await extractMentionedProjects(message);

// Update message metadata
await pool.query(
  `UPDATE remote_agent_messages
   SET metadata = jsonb_set(metadata, '{mentioned_projects}', $1)
   WHERE id = $2`,
  [JSON.stringify(mentionedProjects), messageId]
);
```

### 3. Schema Enhancement

Add `metadata` JSONB column to messages table:

```sql
ALTER TABLE remote_agent_messages
ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;

-- Example metadata:
{
  "primary_project": "scar",           -- From git/cwd
  "mentioned_projects": ["health-agent", "my-app"],  -- From AI analysis
  "detection_method": "git"            -- git | directory | manual
}
```

### 4. CLI Integration

**Option A: Hook into Claude Code** (if possible)
- Intercept messages before/after Claude processes them
- Save to SCAR database

**Option B: Wrapper Script**
```bash
#!/bin/bash
# ~/.local/bin/claude-scar

# Detect project
PROJECT=$(git remote get-url origin 2>/dev/null | grep -oP '[^/]+(?=\.git$)')
export CLAUDE_PROJECT=${PROJECT:-$(basename $PWD)}

# Run Claude with logging
claude "$@" | tee >(logger-to-scar)
```

**Option C: Post-Conversation Save**
- After conversation ends, parse `~/.claude/history.jsonl`
- Extract messages from last session
- Save to SCAR with project tags

---

## Implementation Steps

### Phase 1: Basic Detection (No AI Analysis)

1. Add `metadata` column to messages table
2. Create `detectPrimaryProject()` utility
3. Update message saving to include primary project
4. Query: "Show CLI messages about scar project"

### Phase 2: AI Analysis (Optional)

1. After saving message, extract mentioned projects
2. Update metadata with `mentioned_projects`
3. Query: "Show all messages that mentioned health-agent"

### Phase 3: CLI Integration (Choose approach)

- Wrapper script that logs to SCAR
- OR post-conversation import from `~/.claude/history.jsonl`
- OR Claude Code hooks (if available)

---

## Query Examples with Metadata

**All CLI messages about current project**:
```sql
SELECT * FROM remote_agent_messages
WHERE platform_type = 'cli'
  AND codebase_name = 'scar'
ORDER BY created_at DESC;
```

**All messages that mentioned health-agent** (from any platform):
```sql
SELECT * FROM remote_agent_messages
WHERE metadata @> '{"mentioned_projects": ["health-agent"]}'
   OR codebase_name = 'health-agent'
ORDER BY created_at DESC;
```

**CLI messages with uncertain project tagging**:
```sql
SELECT * FROM remote_agent_messages
WHERE platform_type = 'cli'
  AND (codebase_name IS NULL OR metadata->>'detection_method' = 'directory')
ORDER BY created_at DESC;
```

---

## Pros & Cons

### Pros
- ✅ CLI conversations saved for crash recovery
- ✅ Unified history across all interfaces
- ✅ Can /resume CLI conversations from Telegram
- ✅ Better project tracking across platforms

### Cons
- ⚠️ Primary project detection not always accurate
- ⚠️ AI analysis adds complexity/cost
- ⚠️ Requires CLI integration work
- ⚠️ Duplicate history (SCAR DB + ~/.claude/history.jsonl)

---

## Recommendation

**For now: Keep CLI separate**

Reasons:
1. CLI Claude already has excellent history (`~/.claude/history.jsonl`)
2. Project detection is tricky without AI analysis
3. User likely knows context when switching between CLI and Telegram

**Future: Implement if needed**

If user frequently loses context switching CLI↔Telegram:
1. Start with Phase 1 (basic git detection)
2. Add Phase 2 if project detection insufficient
3. Use wrapper script (Option B) for CLI integration

---

## Alternative: Manual Context Bridge

Instead of automatic saving, provide commands:

```bash
# In Telegram after CLI work
/cli-summary

# Bot response:
"I don't have access to your CLI conversations.

 To share context:
 1. Copy relevant parts of CLI conversation
 2. Paste here with /context-set
 3. Or use /resume to load past Telegram conversations"
```

**Simpler, more explicit, less magical.**
