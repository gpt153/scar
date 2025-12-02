#!/bin/bash
# status.sh - Show status of all managed worktrees
#
# Usage: ./status.sh
#
# Reads from .claude/worktree-registry.json and cross-references with:
# - git worktree list (actual worktrees)
# - gh pr list (PR status)
# - lsof (port usage)

set -e

# Find repo root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
    echo "Error: Not in a git repository"
    exit 1
fi

REGISTRY="$REPO_ROOT/.claude/worktree-registry.json"

# Check if registry exists
if [ ! -f "$REGISTRY" ]; then
    echo "No worktree registry found at: $REGISTRY"
    echo ""
    echo "Git worktrees (unmanaged):"
    git worktree list
    exit 0
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed"
    echo "Install with: brew install jq"
    exit 1
fi

echo "═══════════════════════════════════════════════════════════════════"
echo "                     WORKTREE AGENT STATUS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Parse registry
WORKTREES=$(jq -c '.worktrees[]' "$REGISTRY" 2>/dev/null || echo "")

if [ -z "$WORKTREES" ]; then
    echo "No worktrees registered."
    echo ""
    echo "Git worktrees (unmanaged):"
    git worktree list
    exit 0
fi

# Print header
printf "%-30s %-6s %-8s %-30s %s\n" "BRANCH" "PORT" "PR" "TASK" "LAUNCHED"
printf "%-30s %-6s %-8s %-30s %s\n" "──────────────────────────────" "──────" "────────" "──────────────────────────────" "────────────"

# Process each worktree
echo "$WORKTREES" | while read -r wt; do
    BRANCH=$(echo "$wt" | jq -r '.branch')
    PORT=$(echo "$wt" | jq -r '.port')
    TASK=$(echo "$wt" | jq -r 'if .task == null then "-" else .task end')
    PR=$(echo "$wt" | jq -r 'if .prNumber == null then "-" else .prNumber end')
    LAUNCHED=$(echo "$wt" | jq -r 'if .agentLaunchedAt == null then "-" else .agentLaunchedAt end')
    PATH_WT=$(echo "$wt" | jq -r '.path')

    # Truncate task if too long
    if [ ${#TASK} -gt 28 ]; then
        TASK="${TASK:0:25}..."
    fi

    # Format launched time (show relative if recent)
    if [ "$LAUNCHED" != "-" ]; then
        # Just show time portion for brevity
        LAUNCHED=$(echo "$LAUNCHED" | cut -d'T' -f2 | cut -d'.' -f1 | cut -d':' -f1-2)
    fi

    # Check if PR exists (if not set)
    if [ "$PR" = "-" ]; then
        PR_INFO=$(gh pr list --head "$BRANCH" --json number,state --jq 'if length > 0 then .[0] | "\(.number):\(.state)" else "" end' 2>/dev/null || echo "")
        if [ -n "$PR_INFO" ]; then
            PR_NUM=$(echo "$PR_INFO" | cut -d':' -f1)
            PR_STATE=$(echo "$PR_INFO" | cut -d':' -f2)
            case "$PR_STATE" in
                "OPEN") PR="#$PR_NUM" ;;
                "MERGED") PR="#$PR_NUM ✓" ;;
                "CLOSED") PR="#$PR_NUM ✗" ;;
                *) PR="#$PR_NUM" ;;
            esac
        fi
    else
        PR="#$PR"
    fi

    # Check if port is in use
    PORT_STATUS=""
    if lsof -i :"$PORT" &>/dev/null; then
        PORT_STATUS="$PORT*"
    else
        PORT_STATUS="$PORT"
    fi

    # Check if worktree directory exists
    if [ ! -d "$REPO_ROOT/$PATH_WT" ]; then
        BRANCH="$BRANCH (missing)"
    fi

    printf "%-30s %-6s %-8s %-30s %s\n" "$BRANCH" "$PORT_STATUS" "$PR" "$TASK" "$LAUNCHED"
done

echo ""
echo "Legend: * = port in use, ✓ = merged, ✗ = closed"
echo ""

# Show any unmanaged worktrees
echo "───────────────────────────────────────────────────────────────────"
echo "Git worktrees (all):"
git worktree list
