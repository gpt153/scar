#!/bin/bash

# Propagate Updated CLAUDE.md to All Workspaces
#
# This script updates CLAUDE.md in all existing workspace projects
# with the new role clarity section for SCAR bot.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAR_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACES_DIR="/home/samuel/.archon/workspaces"
TEMPLATE_CLAUDE="$SCAR_DIR/.template/CLAUDE.md"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=================================================="
echo "  CLAUDE.md Role Clarity Propagation"
echo "=================================================="
echo ""
echo "Source template: $TEMPLATE_CLAUDE"
echo "Target: $WORKSPACES_DIR"
echo ""

# Check source template exists
if [ ! -f "$TEMPLATE_CLAUDE" ]; then
    echo -e "${RED}ERROR: Template CLAUDE.md not found at $TEMPLATE_CLAUDE${NC}"
    exit 1
fi

# Count workspaces
WORKSPACE_COUNT=$(ls -1 "$WORKSPACES_DIR" 2>/dev/null | wc -l)
echo "Found $WORKSPACE_COUNT workspaces to update"
echo ""

# Counters
UPDATED=0
SKIPPED=0
FAILED=0
NO_CLAUDE=0

# The role section we're looking for (to check if already updated)
ROLE_MARKER="## 🎯 YOUR ROLE"

# Process each workspace
for workspace in "$WORKSPACES_DIR"/*; do
    if [ ! -d "$workspace" ]; then
        continue
    fi

    workspace_name=$(basename "$workspace")
    echo -e "${YELLOW}Processing: $workspace_name${NC}"

    # Skip scar itself (it's not a workspace, it's the source repo)
    if [ "$workspace_name" = "scar" ]; then
        echo "  ⊘ Skipped (source repository)"
        SKIPPED=$((SKIPPED + 1))
        echo ""
        continue
    fi

    # Check if CLAUDE.md exists
    if [ ! -f "$workspace/CLAUDE.md" ]; then
        echo "  ⊘ No CLAUDE.md found (will not create one)"
        NO_CLAUDE=$((NO_CLAUDE + 1))
        echo ""
        continue
    fi

    # Check if already has the role section
    if grep -q "$ROLE_MARKER" "$workspace/CLAUDE.md"; then
        echo "  ✓ Already has role section (skipping)"
        SKIPPED=$((SKIPPED + 1))
        echo ""
        continue
    fi

    # Extract project-specific variables from existing CLAUDE.md
    PROJECT_NAME=$(grep -E "^# " "$workspace/CLAUDE.md" | head -1 | sed 's/^# //' || echo "$workspace_name")
    GITHUB_URL=$(grep -oP '(?<=\*\*Repository:\*\* ).*' "$workspace/CLAUDE.md" || echo "")
    ARCHON_ID=$(grep -oP '(?<=\*\*Archon Project:\*\* ).*' "$workspace/CLAUDE.md" || echo "")
    WORKSPACE_PATH=$(grep -oP '(?<=\*\*Workspace:\*\* ).*' "$workspace/CLAUDE.md" || echo "$workspace")

    # If variables not found, use workspace name
    if [ -z "$PROJECT_NAME" ]; then
        PROJECT_NAME="$workspace_name"
    fi

    # Create updated CLAUDE.md with project-specific values
    echo "  → Updating CLAUDE.md with role section..."

    # Use template but preserve project-specific values
    sed "s|{{PROJECT_NAME}}|$PROJECT_NAME|g; \
         s|{{GITHUB_URL}}|$GITHUB_URL|g; \
         s|{{ARCHON_PROJECT_ID}}|$ARCHON_ID|g; \
         s|{{WORKSPACE_PATH}}|$WORKSPACE_PATH|g; \
         s|{{PROJECT_DESCRIPTION}}|$PROJECT_NAME - Workspace project|g; \
         s|{{CUSTOM_NOTES}}|Project-specific notes|g" \
        "$TEMPLATE_CLAUDE" > "$workspace/CLAUDE.md.new"

    # Backup old CLAUDE.md
    cp "$workspace/CLAUDE.md" "$workspace/CLAUDE.md.backup"

    # Replace with new version
    mv "$workspace/CLAUDE.md.new" "$workspace/CLAUDE.md"

    echo "  ✓ Updated (backup saved as CLAUDE.md.backup)"
    UPDATED=$((UPDATED + 1))
    echo ""
done

# Summary
echo "=================================================="
echo "  Propagation Complete"
echo "=================================================="
echo ""
echo -e "${GREEN}✓ Updated: $UPDATED workspaces${NC}"
echo -e "${YELLOW}⊘ Skipped: $SKIPPED workspaces (already updated)${NC}"
echo -e "${BLUE}ℹ No CLAUDE.md: $NO_CLAUDE workspaces${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}✗ Failed: $FAILED workspaces${NC}"
fi
echo ""
echo "What was updated in each workspace:"
echo "  • Added '🎯 YOUR ROLE' section (SCAR bot clarity)"
echo "  • Preserved project-specific metadata"
echo "  • Original backed up as CLAUDE.md.backup"
echo ""
echo "To review changes in a workspace:"
echo "  cd /path/to/workspace"
echo "  diff CLAUDE.md.backup CLAUDE.md"
echo ""
echo "Done! 🎉"
