#!/bin/bash

# Propagate Autonomous Supervision System to All Workspaces
#
# This script copies supervision commands and directory structures
# to all existing workspace projects.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAR_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACES_DIR="/home/samuel/.archon/workspaces"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=================================================="
echo "  Autonomous Supervision System Propagation"
echo "=================================================="
echo ""
echo "Source: $SCAR_DIR"
echo "Target: $WORKSPACES_DIR"
echo ""

# Check source files exist
if [ ! -d "$SCAR_DIR/.claude/commands/supervision" ]; then
    echo -e "${RED}ERROR: Supervision commands not found in $SCAR_DIR/.claude/commands/supervision${NC}"
    exit 1
fi

if [ ! -f "$SCAR_DIR/docs/autonomous-supervision.md" ]; then
    echo -e "${RED}ERROR: Documentation not found at $SCAR_DIR/docs/autonomous-supervision.md${NC}"
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

# Process each workspace
for workspace in "$WORKSPACES_DIR"/*; do
    if [ ! -d "$workspace" ]; then
        continue
    fi

    workspace_name=$(basename "$workspace")
    echo -e "${YELLOW}Processing: $workspace_name${NC}"

    # Skip scar itself (already has it)
    if [ "$workspace_name" = "scar" ]; then
        echo "  ⊘ Skipped (source repository)"
        SKIPPED=$((SKIPPED + 1))
        echo ""
        continue
    fi

    # Create .claude/commands/supervision directory and copy commands
    mkdir -p "$workspace/.claude/commands/supervision"

    # Copy supervision command files
    cp -r "$SCAR_DIR/.claude/commands/supervision/"* "$workspace/.claude/commands/supervision/" 2>/dev/null || {
        echo -e "  ${RED}✗ Failed to copy supervision commands${NC}"
        FAILED=$((FAILED + 1))
        echo ""
        continue
    }
    echo "  ✓ Copied supervision commands"

    # Create .agents directories
    mkdir -p "$workspace/.agents/supervision"
    mkdir -p "$workspace/.agents/discussions"

    # Copy supervision README
    cp "$SCAR_DIR/.template/.agents/supervision/README.md" "$workspace/.agents/supervision/" 2>/dev/null || {
        echo -e "  ${RED}✗ Failed to copy supervision README${NC}"
        FAILED=$((FAILED + 1))
        echo ""
        continue
    }

    # Copy discussions README
    cp "$SCAR_DIR/.template/.agents/discussions/README.md" "$workspace/.agents/discussions/" 2>/dev/null || {
        echo -e "  ${RED}✗ Failed to copy discussions README${NC}"
        FAILED=$((FAILED + 1))
        echo ""
        continue
    }

    # Copy documentation if docs/ directory exists
    if [ -d "$workspace/docs" ]; then
        cp "$SCAR_DIR/docs/autonomous-supervision.md" "$workspace/docs/" 2>/dev/null && {
            echo "  ✓ Copied documentation to docs/"
        } || {
            echo "  ⊘ Could not copy documentation (docs/ exists but copy failed)"
        }
    else
        # Create docs directory and copy
        mkdir -p "$workspace/docs"
        cp "$SCAR_DIR/docs/autonomous-supervision.md" "$workspace/docs/" 2>/dev/null && {
            echo "  ✓ Created docs/ and copied documentation"
        } || {
            echo "  ⊘ Could not create docs/ directory"
        }
    fi

    # Update CLAUDE.md if it exists
    if [ -f "$workspace/CLAUDE.md" ]; then
        # Check if supervision section already exists
        if grep -q "Autonomous Supervision System" "$workspace/CLAUDE.md"; then
            echo "  ⊘ CLAUDE.md already has supervision reference"
        else
            # Add supervision section after Issue Supervision Protocol
            # This is a simple append at the end - manual review recommended
            cat >> "$workspace/CLAUDE.md" <<'EOF'

---

## 🎯 Autonomous Supervision System

**WHEN TO USE:** Managing entire projects or complex multi-issue features autonomously.

**Commands:**
- `/prime-supervisor` - Load project context and initialize supervisor role
- `/supervise` - Supervise entire project (all issues, dependencies, parallel work)
- `/supervise-issue N` - Supervise single GitHub issue to completion

**What it does:**
- Decomposes complex features into manageable issues
- Spawns monitoring subagents (max 5 concurrent) to track SCAR progress
- Manages dependencies automatically (sequential vs parallel execution)
- Verifies implementations via `/verify-scar-phase`
- Provides strategic updates (NO CODE - user cannot code)
- Handles context handoff seamlessly when limits approach

**Working directory:** Run from **project workspace**.

**Key principles:**
- Use subagents extensively to minimize supervisor context usage
- First principles thinking - challenge assumptions, provide cost-benefit analysis
- Strategic communication only - links, lists, comparisons (NO code examples to user)
- Brutal honesty about effort vs value

**📖 Complete guide:** `docs/autonomous-supervision.md`
EOF
            echo "  ✓ Updated CLAUDE.md with supervision reference"
        fi
    else
        echo "  ⊘ No CLAUDE.md found (not a problem)"
    fi

    echo -e "  ${GREEN}✓ Completed${NC}"
    UPDATED=$((UPDATED + 1))
    echo ""
done

# Summary
echo "=================================================="
echo "  Propagation Complete"
echo "=================================================="
echo ""
echo -e "${GREEN}Updated: $UPDATED workspaces${NC}"
echo -e "${YELLOW}Skipped: $SKIPPED workspaces${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed:  $FAILED workspaces${NC}"
fi
echo ""
echo "What was added to each workspace:"
echo "  • .claude/commands/supervision/* (5 command files)"
echo "  • .agents/supervision/README.md"
echo "  • .agents/discussions/README.md"
echo "  • docs/autonomous-supervision.md"
echo "  • CLAUDE.md supervision reference (if CLAUDE.md existed)"
echo ""
echo "Commands available in each workspace:"
echo "  /prime-supervisor, /supervise, /supervise-issue"
echo ""
echo "Done! 🎉"
