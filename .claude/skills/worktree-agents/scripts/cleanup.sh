#!/bin/bash
# cleanup.sh - Full cleanup of a worktree (port, directory, registry, optionally branch)
#
# Usage: ./cleanup.sh <branch> [--delete-branch]
#
# Examples:
#   ./cleanup.sh feature/auth                    # Cleanup worktree only
#   ./cleanup.sh feature/auth --delete-branch   # Also delete git branch

set -e

BRANCH="$1"
DELETE_BRANCH="${2:-}"

if [ -z "$BRANCH" ]; then
    echo "Usage: $0 <branch> [--delete-branch]"
    exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
REGISTRY="$REPO_ROOT/.claude/worktree-registry.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Cleaning up: $BRANCH"
echo "─────────────────────────────────"

# Step 1: Get port from registry (if exists)
PORT=""
if [ -f "$REGISTRY" ] && command -v jq &> /dev/null; then
    PORT=$(jq -r ".worktrees[] | select(.branch == \"$BRANCH\") | .port" "$REGISTRY" 2>/dev/null || echo "")
fi

# Step 2: Kill process on port
if [ -n "$PORT" ] && [ "$PORT" != "null" ]; then
    echo "Killing processes on port $PORT..."
    lsof -ti:"$PORT" | xargs kill -9 2>/dev/null && echo "  Killed" || echo "  No process found"
else
    echo "No port registered, skipping port cleanup"
fi

# Step 3: Remove git worktree
WORKTREE_PATH="$REPO_ROOT/worktrees/$BRANCH"
if [ -d "$WORKTREE_PATH" ]; then
    echo "Removing worktree directory..."
    git worktree remove "$WORKTREE_PATH" --force 2>/dev/null && echo "  Removed" || echo "  Failed (may already be removed)"
else
    echo "Worktree directory not found, skipping"
fi

# Step 4: Prune stale worktree references
echo "Pruning stale references..."
git worktree prune

# Step 5: Unregister from registry
if [ -f "$REGISTRY" ]; then
    echo "Unregistering from registry..."
    "$SCRIPT_DIR/unregister.sh" "$BRANCH"
fi

# Step 6: Delete branch (if requested)
if [ "$DELETE_BRANCH" = "--delete-branch" ]; then
    echo "Deleting local branch..."
    git branch -D "$BRANCH" 2>/dev/null && echo "  Deleted local" || echo "  Local branch not found"

    echo "Deleting remote branch..."
    git push origin --delete "$BRANCH" 2>/dev/null && echo "  Deleted remote" || echo "  Remote branch not found or already deleted"
fi

echo "─────────────────────────────────"
echo "Cleanup complete: $BRANCH"
