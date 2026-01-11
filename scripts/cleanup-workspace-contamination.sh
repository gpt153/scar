#!/bin/bash
# SCAR Workspace Cleanup Script
# Removes SCAR-specific documentation from project workspaces
#
# Usage:
#   ./scripts/cleanup-workspace-contamination.sh                  # Interactive mode
#   ./scripts/cleanup-workspace-contamination.sh --all            # Clean all workspaces
#   ./scripts/cleanup-workspace-contamination.sh workspace_name   # Clean specific workspace

set -e

WORKSPACES_DIR="${HOME}/.archon/workspaces"
BACKUP_DIR="${HOME}/.archon/workspace-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Files to remove
SCAR_FILES=(
    ".agents/reference/adding-ai-assistant-clients.md"
    ".agents/reference/adding-platform-adapters.md"
    ".agents/reference/command-system.md"
    ".agents/reference/database-schema.md"
    ".agents/reference/github-webhooks.md"
    ".agents/reference/new-features.md"
    ".agents/reference/streaming-modes.md"
)

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     SCAR Workspace Contamination Cleanup Script           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if workspaces directory exists
if [ ! -d "$WORKSPACES_DIR" ]; then
    echo -e "${RED}✗ Workspaces directory not found: $WORKSPACES_DIR${NC}"
    exit 1
fi

# Function to check if workspace is contaminated
is_contaminated() {
    local workspace=$1
    local prd_file="$WORKSPACES_DIR/$workspace/.agents/PRD.md"

    if [ -f "$prd_file" ]; then
        if grep -q "Remote Agentic Coding Platform" "$prd_file" 2>/dev/null; then
            return 0  # Contaminated
        fi
    fi
    return 1  # Clean
}

# Function to backup and clean a workspace
clean_workspace() {
    local workspace=$1
    local workspace_path="$WORKSPACES_DIR/$workspace"
    local prd_file="$workspace_path/.agents/PRD.md"
    local backup_path="$BACKUP_DIR/$workspace/$TIMESTAMP"

    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Processing: ${YELLOW}$workspace${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Check if contaminated
    if ! is_contaminated "$workspace"; then
        echo -e "${GREEN}✓ Workspace is clean (no contamination detected)${NC}"
        return 0
    fi

    # Create backup directory
    mkdir -p "$backup_path"
    echo -e "${BLUE}→ Creating backup: $backup_path${NC}"

    # Backup PRD if exists
    if [ -f "$prd_file" ]; then
        cp "$prd_file" "$backup_path/PRD.md.backup"
        echo -e "${GREEN}  ✓ Backed up PRD.md${NC}"
    fi

    # Remove contaminated PRD
    if [ -f "$prd_file" ]; then
        rm "$prd_file"
        echo -e "${GREEN}  ✓ Removed contaminated PRD.md${NC}"
    fi

    # Remove SCAR-specific reference files
    local removed_count=0
    for file in "${SCAR_FILES[@]}"; do
        local full_path="$workspace_path/$file"
        if [ -f "$full_path" ]; then
            # Backup before removing
            local backup_file="$backup_path/$(basename "$file").backup"
            cp "$full_path" "$backup_file"
            rm "$full_path"
            ((removed_count++))
            echo -e "${GREEN}  ✓ Removed $(basename "$file")${NC}"
        fi
    done

    # Create placeholder PRD
    cat > "$prd_file" << 'EOF'
# PROJECT_NAME - Product Requirements Document

**Status:** Replace this placeholder with actual project documentation

---

## Project Overview

*Describe your project here*

---

## Problem Statement

*What problem does this solve?*

---

## Goals

*What are the objectives?*

---

**Note:** This is a placeholder. Replace with actual project requirements.
For template, see: /home/samuel/scar/.template/.agents/PRD.md
EOF

    echo -e "${GREEN}  ✓ Created placeholder PRD.md${NC}"

    # Clean up empty reference directory
    local ref_dir="$workspace_path/.agents/reference"
    if [ -d "$ref_dir" ] && [ -z "$(ls -A "$ref_dir" 2>/dev/null)" ]; then
        rmdir "$ref_dir"
        echo -e "${GREEN}  ✓ Removed empty reference directory${NC}"
    fi

    echo -e "${GREEN}✓ Cleanup complete for $workspace${NC}"
    echo -e "${BLUE}  Backup location: $backup_path${NC}"
}

# Get list of all workspaces
mapfile -t all_workspaces < <(find "$WORKSPACES_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)

# Filter contaminated workspaces
contaminated_workspaces=()
for workspace in "${all_workspaces[@]}"; do
    if is_contaminated "$workspace"; then
        contaminated_workspaces+=("$workspace")
    fi
done

# Handle command line arguments
if [ "$1" = "--all" ]; then
    echo -e "${YELLOW}Cleaning all contaminated workspaces...${NC}"
    echo ""

    if [ ${#contaminated_workspaces[@]} -eq 0 ]; then
        echo -e "${GREEN}✓ No contaminated workspaces found!${NC}"
        exit 0
    fi

    echo -e "${RED}Found ${#contaminated_workspaces[@]} contaminated workspace(s):${NC}"
    printf '%s\n' "${contaminated_workspaces[@]}" | sed 's/^/  - /'
    echo ""

    for workspace in "${contaminated_workspaces[@]}"; do
        clean_workspace "$workspace"
    done

elif [ -n "$1" ]; then
    # Clean specific workspace
    workspace=$1
    if [ ! -d "$WORKSPACES_DIR/$workspace" ]; then
        echo -e "${RED}✗ Workspace not found: $workspace${NC}"
        exit 1
    fi
    clean_workspace "$workspace"

else
    # Interactive mode
    if [ ${#contaminated_workspaces[@]} -eq 0 ]; then
        echo -e "${GREEN}✓ No contaminated workspaces found!${NC}"
        echo ""
        echo "All workspaces are clean. The SCAR template has been fixed to prevent"
        echo "future contamination of new projects."
        exit 0
    fi

    echo -e "${RED}Found ${#contaminated_workspaces[@]} contaminated workspace(s):${NC}"
    echo ""

    for i in "${!contaminated_workspaces[@]}"; do
        echo -e "  ${YELLOW}$((i+1)).${NC} ${contaminated_workspaces[$i]}"
    done

    echo ""
    echo -e "${BLUE}What would you like to do?${NC}"
    echo "  a) Clean all contaminated workspaces"
    echo "  s) Select specific workspaces to clean"
    echo "  q) Quit without making changes"
    echo ""
    read -p "Choice [a/s/q]: " choice

    case $choice in
        a|A)
            echo ""
            for workspace in "${contaminated_workspaces[@]}"; do
                clean_workspace "$workspace"
            done
            ;;
        s|S)
            echo ""
            echo -e "${BLUE}Enter workspace numbers to clean (space-separated, e.g., 1 3 5):${NC}"
            read -p "> " -a selections

            for num in "${selections[@]}"; do
                if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le ${#contaminated_workspaces[@]} ]; then
                    workspace="${contaminated_workspaces[$((num-1))]}"
                    clean_workspace "$workspace"
                else
                    echo -e "${RED}✗ Invalid selection: $num${NC}"
                fi
            done
            ;;
        q|Q)
            echo ""
            echo -e "${YELLOW}Exiting without making changes.${NC}"
            exit 0
            ;;
        *)
            echo ""
            echo -e "${RED}✗ Invalid choice. Exiting.${NC}"
            exit 1
            ;;
    esac
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  Cleanup Complete!                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Summary:${NC}"
echo -e "  • Backups saved to: ${YELLOW}$BACKUP_DIR${NC}"
echo -e "  • Template cleaned: ${YELLOW}$HOME/scar/.template/.agents/${NC}"
echo -e "  • New projects will use clean template"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Review placeholder PRD.md files in cleaned workspaces"
echo "  2. Replace placeholders with actual project documentation"
echo "  3. Check backups if you need to restore any custom content"
echo ""
