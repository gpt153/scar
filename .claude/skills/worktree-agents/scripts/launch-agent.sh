#!/bin/bash
# launch-agent.sh - Launch Claude Code in a new terminal for a worktree
#
# Usage: ./launch-agent.sh <worktree-path> [task-description]
#
# Reads config from: .claude/skills/worktree-agents/config.json
# Supports: ghostty, iterm2, tmux
#
# Examples:
#   ./launch-agent.sh worktrees/feature/auth
#   ./launch-agent.sh worktrees/feature/auth "Implement OAuth login flow"

set -e

WORKTREE_PATH="$1"
TASK="$2"

# Validate input
if [ -z "$WORKTREE_PATH" ]; then
    echo "Error: Worktree path required"
    echo "Usage: $0 <worktree-path> [task-description]"
    exit 1
fi

# Find script directory and config
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config.json"

# Load config (with defaults)
if [ -f "$CONFIG_FILE" ] && command -v jq &> /dev/null; then
    TERMINAL=$(jq -r '.terminal // "ghostty"' "$CONFIG_FILE")
    SHELL_CMD=$(jq -r '.shell // "fish"' "$CONFIG_FILE")
    CLAUDE_CMD=$(jq -r '.claudeCommand // "cc"' "$CONFIG_FILE")
else
    # Defaults if no config or no jq
    TERMINAL="ghostty"
    SHELL_CMD="fish"
    CLAUDE_CMD="cc"
fi

# Convert to absolute path if relative
if [[ "$WORKTREE_PATH" != /* ]]; then
    WORKTREE_PATH="$(pwd)/$WORKTREE_PATH"
fi

# Verify worktree exists
if [ ! -d "$WORKTREE_PATH" ]; then
    echo "Error: Worktree directory does not exist: $WORKTREE_PATH"
    exit 1
fi

# Verify it's a git worktree (has .git file or directory)
if [ ! -e "$WORKTREE_PATH/.git" ]; then
    echo "Error: Not a git worktree: $WORKTREE_PATH"
    exit 1
fi

# Get branch name
BRANCH=$(cd "$WORKTREE_PATH" && git branch --show-current 2>/dev/null || basename "$WORKTREE_PATH")

# Build the command to run in the new terminal
if [ -n "$TASK" ]; then
    INNER_CMD="cd '$WORKTREE_PATH' && echo '🤖 Agent task: $TASK' && $CLAUDE_CMD"
else
    INNER_CMD="cd '$WORKTREE_PATH' && $CLAUDE_CMD"
fi

# Launch based on terminal type
case "$TERMINAL" in
    ghostty)
        if ! command -v ghostty &> /dev/null && [ ! -d "/Applications/Ghostty.app" ]; then
            echo "Error: Ghostty not found"
            exit 1
        fi
        open -na "Ghostty.app" --args -e "$SHELL_CMD" -c "$INNER_CMD"
        ;;

    iterm2|iterm)
        osascript <<EOF
tell application "iTerm2"
    create window with default profile
    tell current session of current window
        write text "cd '$WORKTREE_PATH' && $CLAUDE_CMD"
    end tell
end tell
EOF
        ;;

    tmux)
        if ! command -v tmux &> /dev/null; then
            echo "Error: tmux not found"
            exit 1
        fi
        SESSION_NAME="wt-$(echo "$BRANCH" | tr '/' '-')"
        tmux new-session -d -s "$SESSION_NAME" -c "$WORKTREE_PATH" "$SHELL_CMD -c '$CLAUDE_CMD'"
        echo "   tmux session: $SESSION_NAME (attach with: tmux attach -t $SESSION_NAME)"
        ;;

    *)
        echo "Error: Unknown terminal type: $TERMINAL"
        echo "Supported: ghostty, iterm2, tmux"
        exit 1
        ;;
esac

echo "✅ Launched Claude Code agent"
echo "   Terminal: $TERMINAL"
echo "   Branch: $BRANCH"
echo "   Path: $WORKTREE_PATH"
if [ -n "$TASK" ]; then
    echo "   Task: $TASK"
fi
