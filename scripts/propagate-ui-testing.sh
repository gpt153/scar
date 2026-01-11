#!/bin/bash

# Propagate UI Testing System to All Projects
# Copies UI testing commands and documentation from SCAR to all workspace projects

set -e

SCAR_DIR="/home/samuel/scar"
WORKSPACES_DIR="$HOME/.archon/workspaces"

# Source files
UI_COMMANDS=(
  "ui-test-supervise.md"
  "ui-test-suite-runner.md"
  "ui-fix-retest-monitor.md"
  "ui-regression-test.md"
)

echo "🚀 Propagating UI Testing System to all projects..."
echo ""

# Get list of project directories
cd "$WORKSPACES_DIR"
PROJECTS=$(find . -maxdepth 1 -type d -not -name '.' -not -name '..' | sed 's|^\./||' | sort)

PROPAGATED=0
SKIPPED=0

for project in $PROJECTS; do
  # Skip .scar-projects.json and other non-directory entries
  if [ ! -d "$WORKSPACES_DIR/$project" ]; then
    continue
  fi

  # Skip if it's a file, not a directory
  if [ -f "$WORKSPACES_DIR/$project" ]; then
    continue
  fi

  echo "📦 Processing: $project"

  PROJECT_DIR="$WORKSPACES_DIR/$project"

  # Create directories if they don't exist
  mkdir -p "$PROJECT_DIR/.claude/commands/supervision"
  mkdir -p "$PROJECT_DIR/docs"

  # Copy UI testing commands
  for cmd in "${UI_COMMANDS[@]}"; do
    if [ -f "$SCAR_DIR/.claude/commands/supervision/$cmd" ]; then
      cp "$SCAR_DIR/.claude/commands/supervision/$cmd" "$PROJECT_DIR/.claude/commands/supervision/"
      echo "  ✅ Copied $cmd"
    else
      echo "  ⚠️  Warning: $cmd not found in SCAR"
    fi
  done

  # Copy documentation
  if [ -f "$SCAR_DIR/docs/ui-testing-system.md" ]; then
    cp "$SCAR_DIR/docs/ui-testing-system.md" "$PROJECT_DIR/docs/"
    echo "  ✅ Copied ui-testing-system.md"
  fi

  if [ -f "$SCAR_DIR/docs/autonomous-supervision.md" ]; then
    cp "$SCAR_DIR/docs/autonomous-supervision.md" "$PROJECT_DIR/docs/"
    echo "  ✅ Copied autonomous-supervision.md"
  fi

  PROPAGATED=$((PROPAGATED + 1))
  echo "  ✅ Complete"
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Propagation Complete"
echo ""
echo "Projects updated: $PROPAGATED"
echo ""
echo "Files propagated to each project:"
echo "  - .claude/commands/supervision/ui-test-supervise.md"
echo "  - .claude/commands/supervision/ui-test-suite-runner.md"
echo "  - .claude/commands/supervision/ui-fix-retest-monitor.md"
echo "  - .claude/commands/supervision/ui-regression-test.md"
echo "  - docs/ui-testing-system.md"
echo "  - docs/autonomous-supervision.md"
echo ""
echo "To commit changes in each project:"
echo "  cd ~/.archon/workspaces/<project> && git add . && git commit -m 'feat: Add UI testing system'"
