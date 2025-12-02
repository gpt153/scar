#!/bin/bash
# unregister.sh - Safely remove a worktree from the registry
#
# Usage: ./unregister.sh <branch>
#
# Example:
#   ./unregister.sh feature/auth

set -e

BRANCH="$1"

if [ -z "$BRANCH" ]; then
    echo "Usage: $0 <branch>"
    exit 1
fi

# Find repo root and registry
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
REGISTRY="$REPO_ROOT/.claude/worktree-registry.json"

if [ ! -f "$REGISTRY" ]; then
    echo "No registry found"
    exit 0
fi

# Check jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required. Install with: brew install jq"
    exit 1
fi

# Check if branch exists in registry
if ! jq -e ".worktrees[] | select(.branch == \"$BRANCH\")" "$REGISTRY" > /dev/null 2>&1; then
    echo "Branch '$BRANCH' not found in registry"
    exit 0
fi

# Remove entry atomically
TMP=$(mktemp)
jq "del(.worktrees[] | select(.branch == \"$BRANCH\"))" "$REGISTRY" > "$TMP" && mv "$TMP" "$REGISTRY"

echo "Unregistered: $BRANCH"
