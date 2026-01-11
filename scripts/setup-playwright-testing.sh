#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script metadata
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAR_ROOT="$(dirname "$SCRIPT_DIR")"
TEMPLATE_DIR="$SCAR_ROOT/.template/playwright-setup"

# Function to print colored messages
info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

# Function to show usage
usage() {
    cat << EOF
Usage: $0 [PROJECT_PATH]

Setup Playwright E2E testing infrastructure for a Node.js project.

Arguments:
    PROJECT_PATH    Path to the project directory (default: current directory)

Examples:
    $0 /path/to/project
    $0 .
    $0 ~/projects/myapp

What this script does:
  1. Validates project directory and prerequisites
  2. Copies Playwright testing templates
  3. Merges package.json scripts and dependencies
  4. Appends .gitignore entries
  5. Creates tests/ directory with example test
  6. Backs up existing files before modifying

EOF
    exit 1
}

# Validate prerequisites
check_prerequisites() {
    info "Checking prerequisites..."
    
    # Check if template directory exists
    if [ ! -d "$TEMPLATE_DIR" ]; then
        error "Template directory not found: $TEMPLATE_DIR"
        error "Make sure you're running this script from the SCAR repository"
        exit 1
    fi
    
    # Check if Docker is available (optional but recommended)
    if ! command -v docker &> /dev/null; then
        warning "Docker not found. Tests will require local Playwright installation."
    else
        success "Docker found"
    fi
    
    # Check if Node.js is available
    if ! command -v node &> /dev/null; then
        error "Node.js not found. Please install Node.js first."
        exit 1
    fi
    
    success "Prerequisites check complete"
}

# Validate project directory
validate_project() {
    local project_path="$1"
    
    info "Validating project directory: $project_path"
    
    if [ ! -d "$project_path" ]; then
        error "Project directory does not exist: $project_path"
        exit 1
    fi
    
    if [ ! -f "$project_path/package.json" ]; then
        error "No package.json found in: $project_path"
        error "This doesn't appear to be a Node.js project"
        exit 1
    fi
    
    success "Project directory validated"
}

# Backup file if it exists
backup_file() {
    local file="$1"
    if [ -f "$file" ]; then
        local backup="${file}.backup-$(date +%Y%m%d-%H%M%S)"
        cp "$file" "$backup"
        info "Backed up: $(basename "$file") → $(basename "$backup")"
    fi
}

# Copy template files
copy_templates() {
    local project_path="$1"
    
    info "Copying template files..."
    
    # Copy Dockerfile.test
    if [ -f "$project_path/Dockerfile.test" ]; then
        warning "Dockerfile.test already exists"
        backup_file "$project_path/Dockerfile.test"
    fi
    cp "$TEMPLATE_DIR/Dockerfile.test" "$project_path/"
    success "Copied Dockerfile.test"
    
    # Copy docker-compose.test.yml
    if [ -f "$project_path/docker-compose.test.yml" ]; then
        warning "docker-compose.test.yml already exists"
        backup_file "$project_path/docker-compose.test.yml"
    fi
    cp "$TEMPLATE_DIR/docker-compose.test.yml" "$project_path/"
    success "Copied docker-compose.test.yml"
    
    # Copy playwright.config.ts
    if [ -f "$project_path/playwright.config.ts" ]; then
        warning "playwright.config.ts already exists - skipping (manual merge required)"
    else
        cp "$TEMPLATE_DIR/playwright.config.ts" "$project_path/"
        success "Copied playwright.config.ts"
    fi
    
    # Copy GitHub Actions workflow
    mkdir -p "$project_path/.github/workflows"
    if [ -f "$project_path/.github/workflows/playwright.yml" ]; then
        warning "playwright.yml workflow already exists"
        backup_file "$project_path/.github/workflows/playwright.yml"
    fi
    cp "$TEMPLATE_DIR/.github/workflows/playwright.yml" "$project_path/.github/workflows/"
    success "Copied GitHub Actions workflow"
    
    # Copy TESTING.md
    if [ -f "$project_path/TESTING.md" ]; then
        warning "TESTING.md already exists"
        backup_file "$project_path/TESTING.md"
    fi
    cp "$TEMPLATE_DIR/TESTING.md" "$project_path/"
    success "Copied TESTING.md"
}

# Merge package.json scripts
merge_package_json() {
    local project_path="$1"
    local package_json="$project_path/package.json"
    
    info "Updating package.json..."
    
    # Backup package.json
    backup_file "$package_json"
    
    # Check if jq is available for JSON manipulation
    if ! command -v jq &> /dev/null; then
        warning "jq not found. Please manually add these scripts to package.json:"
        cat "$TEMPLATE_DIR/package.json.snippet"
        return
    fi
    
    # Add scripts
    local temp_file=$(mktemp)
    jq '.scripts += {
        "test": "playwright test",
        "test:ui": "playwright test --ui",
        "test:headed": "playwright test --headed",
        "test:docker": "docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit"
    }' "$package_json" > "$temp_file"
    
    # Add devDependencies
    jq '.devDependencies += {
        "@playwright/test": "^1.40.0",
        "@types/node": "^20.0.0"
    }' "$temp_file" > "$package_json"
    
    rm "$temp_file"
    success "Updated package.json with test scripts and dependencies"
}

# Update .gitignore
update_gitignore() {
    local project_path="$1"
    local gitignore="$project_path/.gitignore"
    
    info "Updating .gitignore..."
    
    # Check if entries already exist
    if [ -f "$gitignore" ] && grep -q "test-results/" "$gitignore"; then
        info ".gitignore already has Playwright entries"
        return
    fi
    
    # Append entries
    echo "" >> "$gitignore"
    echo "# Playwright test artifacts" >> "$gitignore"
    cat "$TEMPLATE_DIR/.gitignore.snippet" >> "$gitignore"
    
    success "Updated .gitignore"
}

# Create tests directory
create_tests_directory() {
    local project_path="$1"
    
    info "Setting up tests directory..."
    
    if [ -d "$project_path/tests" ]; then
        info "tests/ directory already exists"
    else
        mkdir -p "$project_path/tests"
        success "Created tests/ directory"
    fi
    
    # Copy example test if no tests exist
    if [ -z "$(ls -A "$project_path/tests")" ]; then
        cp "$TEMPLATE_DIR/tests/example.spec.ts" "$project_path/tests/"
        success "Added example test file"
    else
        info "Tests directory not empty, skipping example test"
    fi
}

# Detect project URL from package.json or common patterns
detect_base_url() {
    local project_path="$1"
    
    # Try to find dev script port
    local dev_script=$(jq -r '.scripts.dev // empty' "$project_path/package.json" 2>/dev/null)
    
    if echo "$dev_script" | grep -q "3000"; then
        echo "http://localhost:3000"
    elif echo "$dev_script" | grep -q "3001"; then
        echo "http://localhost:3001"
    else
        echo "http://localhost:3000"
    fi
}

# Main installation logic
install_playwright_setup() {
    local project_path="${1:-.}"
    project_path=$(realpath "$project_path")
    
    echo ""
    info "═══════════════════════════════════════════════════"
    info "  Playwright Testing Infrastructure Setup"
    info "═══════════════════════════════════════════════════"
    echo ""
    
    check_prerequisites
    validate_project "$project_path"
    
    echo ""
    info "Installing Playwright testing infrastructure to:"
    info "  $project_path"
    echo ""
    
    # Confirm with user
    read -p "$(echo -e "${YELLOW}?${NC} Continue with installation? (y/N): ")" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        warning "Installation cancelled"
        exit 0
    fi
    
    echo ""
    
    # Execute installation steps
    copy_templates "$project_path"
    merge_package_json "$project_path"
    update_gitignore "$project_path"
    create_tests_directory "$project_path"
    
    echo ""
    success "═══════════════════════════════════════════════════"
    success "  Playwright setup complete!"
    success "═══════════════════════════════════════════════════"
    echo ""
    
    info "Next steps:"
    echo ""
    echo "  1. Install dependencies:"
    echo "     ${GREEN}cd $project_path && npm install${NC}"
    echo ""
    echo "  2. Customize playwright.config.ts:"
    echo "     ${GREEN}Update baseURL to match your application URL${NC}"
    echo ""
    echo "  3. Run tests:"
    echo "     ${GREEN}npm run test:docker${NC}  (recommended)"
    echo "     ${GREEN}npm test${NC}             (requires local Playwright)"
    echo ""
    echo "  4. Read documentation:"
    echo "     ${GREEN}cat TESTING.md${NC}"
    echo ""
    echo "  5. Write your tests in:"
    echo "     ${GREEN}$project_path/tests/${NC}"
    echo ""
    
    # Detect and suggest base URL
    local suggested_url=$(detect_base_url "$project_path")
    if [ -n "$suggested_url" ]; then
        info "Suggested baseURL: $suggested_url"
        info "Update this in playwright.config.ts if different"
        echo ""
    fi
}

# Parse arguments
if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
    usage
fi

# Run installation
install_playwright_setup "$@"
