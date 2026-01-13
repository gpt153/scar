#!/bin/bash
# Propagate timezone configuration to all workspaces
# Updates CLAUDE.md files with Stockholm timezone information

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAR_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACES_DIR="$HOME/.archon/workspaces"
WORKTREES_DIR="$HOME/.archon/worktrees"

echo "🌍 Propagating Stockholm Timezone Configuration"
echo "================================================"
echo ""

# Check if template exists
if [ ! -f "$SCAR_ROOT/.template/CLAUDE.md" ]; then
  echo "❌ Error: Template not found at $SCAR_ROOT/.template/CLAUDE.md"
  exit 1
fi

echo "✅ Template found: $SCAR_ROOT/.template/CLAUDE.md"
echo ""

# Function to update a single CLAUDE.md file
update_claude_md() {
  local workspace=$1
  local claude_md="$workspace/CLAUDE.md"

  if [ ! -f "$claude_md" ]; then
    echo "  ⏭️  No CLAUDE.md found, skipping"
    return
  fi

  # Check if timezone section already exists
  if grep -q "⏰ CRITICAL: Timezone Information" "$claude_md" 2>/dev/null; then
    echo "  ✅ Already has timezone section"
    return
  fi

  # Check if we can find the insertion point (after Project Overview)
  if grep -q "## Project Overview" "$claude_md"; then
    # Create temporary file with timezone section
    local temp_file=$(mktemp)

    # Insert timezone section after the first "---" following "## Project Overview"
    awk '
      BEGIN { in_overview=0; inserted=0 }
      /## Project Overview/ { in_overview=1 }
      /^---$/ && in_overview && !inserted {
        print
        print ""
        print "## ⏰ CRITICAL: Timezone Information"
        print ""
        print "**System Timezone: Europe/Stockholm (CET/CEST)**"
        print ""
        print "ALL timestamps, time references, and scheduling MUST use Stockholm time, NOT UTC."
        print ""
        print "**Current Date/Time:**"
        print "- **Today**: 2026-01-13 (YYYY-MM-DD format)"
        print "- **Timezone**: Europe/Stockholm (UTC+1 in winter, UTC+2 in summer)"
        print "- When logging or displaying times, ALWAYS convert from UTC to Stockholm time"
        print "- When scheduling or planning, assume Stockholm timezone unless explicitly stated otherwise"
        print ""
        print "**Examples:**"
        print "```bash"
        print "# ✅ CORRECT: Stockholm time"
        print "\"Meeting at 14:00 Stockholm time\""
        print "\"Deployed at 2026-01-13 15:30 CET\""
        print ""
        print "# ❌ WRONG: UTC without context"
        print "\"Meeting at 13:00\"  # Ambiguous - which timezone?"
        print "\"Deployed at 2026-01-13 14:30Z\"  # UTC, not Stockholm"
        print "```"
        print ""
        print "**Code Implications:**"
        print "- When generating timestamps in code: Convert to Europe/Stockholm"
        print "- When reading logs: Interpret as Stockholm time"
        print "- When comparing times: Account for timezone differences"
        print "- When displaying to user: Show Stockholm time explicitly"
        print ""
        inserted=1
        next
      }
      { print }
    ' "$claude_md" > "$temp_file"

    # Replace original file
    mv "$temp_file" "$claude_md"
    echo "  ✅ Added timezone section"
  else
    echo "  ⚠️  Could not find insertion point (## Project Overview)"
  fi
}

# Update supervision command files
update_supervision_commands() {
  local workspace=$1
  local commands_dir="$workspace/.claude/commands/supervision"

  if [ ! -d "$commands_dir" ]; then
    echo "  ⏭️  No supervision commands, skipping"
    return
  fi

  local updated=0

  for cmd_file in prime-supervisor.md supervise.md supervise-issue.md; do
    local target="$commands_dir/$cmd_file"
    local template="$SCAR_ROOT/.template/.claude/commands/supervision/$cmd_file"

    if [ ! -f "$target" ]; then
      continue
    fi

    if [ ! -f "$template" ]; then
      continue
    fi

    # Check if timezone section already exists
    if grep -q "⏰ TIMEZONE: Europe/Stockholm" "$target" 2>/dev/null; then
      continue
    fi

    # Extract timezone section from template
    local timezone_block=$(awk '/## ⏰ TIMEZONE: Europe\/Stockholm/,/^## [^⏰]/' "$template" | head -n -1)

    if [ -n "$timezone_block" ]; then
      # Insert after the header
      local temp_file=$(mktemp)
      awk -v block="$timezone_block" '
        /^# / && !inserted {
          print
          print ""
          print block
          inserted=1
          next
        }
        { print }
      ' "$target" > "$temp_file"

      mv "$temp_file" "$target"
      updated=$((updated + 1))
    fi
  done

  if [ $updated -gt 0 ]; then
    echo "  ✅ Updated $updated supervision command files"
  fi
}

# Process workspaces
if [ -d "$WORKSPACES_DIR" ]; then
  echo "📁 Processing workspaces in $WORKSPACES_DIR"
  echo ""

  workspace_count=0
  for workspace in "$WORKSPACES_DIR"/*; do
    if [ -d "$workspace" ]; then
      workspace_name=$(basename "$workspace")
      echo "  📦 $workspace_name"
      update_claude_md "$workspace" || echo "    ⚠️  Error updating CLAUDE.md"
      update_supervision_commands "$workspace" || echo "    ⚠️  Error updating supervision commands"
      workspace_count=$((workspace_count + 1))
    fi
  done

  echo ""
  echo "✅ Processed $workspace_count workspaces"
else
  echo "⚠️  No workspaces directory found at $WORKSPACES_DIR"
fi

echo ""

# Process worktrees
if [ -d "$WORKTREES_DIR" ]; then
  echo "📁 Processing worktrees in $WORKTREES_DIR"
  echo ""

  worktree_count=0
  for project_dir in "$WORKTREES_DIR"/*; do
    if [ -d "$project_dir" ]; then
      project_name=$(basename "$project_dir")
      echo "  🌳 Project: $project_name"

      for worktree in "$project_dir"/*; do
        if [ -d "$worktree" ]; then
          worktree_name=$(basename "$worktree")
          echo "    ├─ $worktree_name"
          update_claude_md "$worktree" || echo "      ⚠️  Error updating CLAUDE.md"
          update_supervision_commands "$worktree" || echo "      ⚠️  Error updating supervision commands"
          worktree_count=$((worktree_count + 1))
        fi
      done
    fi
  done

  echo ""
  echo "✅ Processed $worktree_count worktrees"
else
  echo "⚠️  No worktrees directory found at $WORKTREES_DIR"
fi

echo ""
echo "🎉 Timezone configuration propagation complete!"
echo ""
echo "Next steps:"
echo "  1. Review changes: cd to each workspace and check CLAUDE.md"
echo "  2. Commit changes in workspaces if needed"
echo "  3. Test with supervisor: /prime-supervisor to verify timezone awareness"
