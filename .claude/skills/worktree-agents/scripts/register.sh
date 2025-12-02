#!/bin/bash
# register.sh - Safely add a worktree to the registry
#
# Usage: ./register.sh <branch> <path> <port> [task]
#
# Examples:
#   ./register.sh feature/auth worktrees/feature/auth 8124
#   ./register.sh feature/auth worktrees/feature/auth 8124 "Implement OAuth"

set -e

BRANCH="$1"
PATH_WT="$2"
PORT="$3"
TASK="${4:-null}"

# Validate inputs
if [ -z "$BRANCH" ] || [ -z "$PATH_WT" ] || [ -z "$PORT" ]; then
    echo "Usage: $0 <branch> <path> <port> [task]"
    exit 1
fi

# Find repo root and registry
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
REGISTRY="$REPO_ROOT/.claude/worktree-registry.json"

# Check jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required. Install with: brew install jq"
    exit 1
fi

# Initialize registry if it doesn't exist
if [ ! -f "$REGISTRY" ]; then
    echo '{"worktrees": []}' > "$REGISTRY"
fi

# Check if branch already registered
if jq -e ".worktrees[] | select(.branch == \"$BRANCH\")" "$REGISTRY" > /dev/null 2>&1; then
    echo "Warning: Branch '$BRANCH' already registered. Updating..."
    # Remove existing entry first
    TMP=$(mktemp)
    jq "del(.worktrees[] | select(.branch == \"$BRANCH\"))" "$REGISTRY" > "$TMP" && mv "$TMP" "$REGISTRY"
fi

# Format task (quote string or use null)
if [ "$TASK" = "null" ]; then
    TASK_JSON="null"
else
    TASK_JSON="\"$TASK\""
fi

# Add new entry atomically
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TMP=$(mktemp)
jq ".worktrees += [{
    \"branch\": \"$BRANCH\",
    \"path\": \"$PATH_WT\",
    \"port\": $PORT,
    \"createdAt\": \"$TIMESTAMP\",
    \"agentLaunchedAt\": null,
    \"task\": $TASK_JSON,
    \"prNumber\": null
}]" "$REGISTRY" > "$TMP" && mv "$TMP" "$REGISTRY"

echo "Registered: $BRANCH on port $PORT"
