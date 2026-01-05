#!/bin/bash
# verify-no-mocks.sh
# Checks codebase for mock data patterns in production code

set -e

echo "🔍 Checking for mock data in production code..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track if any issues found
ISSUES_FOUND=0

# Directories to check (production code only)
SRC_DIRS="src"

# Directories to exclude (tests, node_modules, etc.)
EXCLUDE_DIRS="test tests __tests__ node_modules dist build .git"

# Build exclude pattern for grep
EXCLUDE_PATTERN=""
for dir in $EXCLUDE_DIRS; do
  EXCLUDE_PATTERN="$EXCLUDE_PATTERN --exclude-dir=$dir"
done

echo "📁 Searching in: $SRC_DIRS"
echo "⏭️  Excluding: $EXCLUDE_DIRS"
echo ""

# Check 1: Mock data arrays
echo "1️⃣ Checking for mock data arrays..."
if grep -r "mockData\|mock_data\|MOCK_DATA" $SRC_DIRS $EXCLUDE_PATTERN 2>/dev/null; then
  echo -e "${RED}❌ Found mock data arrays in production code${NC}"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
  echo -e "${GREEN}✅ No mock data arrays found${NC}"
fi
echo ""

# Check 2: Placeholder URLs
echo "2️⃣ Checking for placeholder URLs..."
if grep -r "example\.com\|placeholder.*url\|mock.*api" $SRC_DIRS $EXCLUDE_PATTERN -i 2>/dev/null; then
  echo -e "${RED}❌ Found placeholder URLs in production code${NC}"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
  echo -e "${GREEN}✅ No placeholder URLs found${NC}"
fi
echo ""

# Check 3: TODO/FIXME in critical paths
echo "3️⃣ Checking for TODO/FIXME in critical paths..."
TODO_COUNT=$(grep -r "TODO\|FIXME" $SRC_DIRS $EXCLUDE_PATTERN 2>/dev/null | wc -l || echo "0")
if [ "$TODO_COUNT" -gt 10 ]; then
  echo -e "${YELLOW}⚠️  Found $TODO_COUNT TODO/FIXME comments (review if critical)${NC}"
  grep -r "TODO\|FIXME" $SRC_DIRS $EXCLUDE_PATTERN 2>/dev/null | head -5
  echo "... ($((TODO_COUNT - 5)) more)"
elif [ "$TODO_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Found $TODO_COUNT TODO/FIXME comments${NC}"
  grep -r "TODO\|FIXME" $SRC_DIRS $EXCLUDE_PATTERN 2>/dev/null
else
  echo -e "${GREEN}✅ No TODO/FIXME comments found${NC}"
fi
echo ""

# Check 4: Fake/dummy patterns
echo "4️⃣ Checking for fake/dummy patterns..."
if grep -r "fakeData\|dummyData\|fake_\|dummy_" $SRC_DIRS $EXCLUDE_PATTERN -i 2>/dev/null; then
  echo -e "${RED}❌ Found fake/dummy data in production code${NC}"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
  echo -e "${GREEN}✅ No fake/dummy patterns found${NC}"
fi
echo ""

# Check 5: Hardcoded test credentials (common mistake)
echo "5️⃣ Checking for hardcoded test credentials..."
if grep -r "test@example.com\|password123\|admin@admin" $SRC_DIRS $EXCLUDE_PATTERN 2>/dev/null; then
  echo -e "${YELLOW}⚠️  Found hardcoded test credentials (should use env vars)${NC}"
  grep -r "test@example.com\|password123\|admin@admin" $SRC_DIRS $EXCLUDE_PATTERN 2>/dev/null
else
  echo -e "${GREEN}✅ No hardcoded test credentials found${NC}"
fi
echo ""

# Final summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ISSUES_FOUND -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed! No mock data found in production code.${NC}"
  exit 0
else
  echo -e "${RED}❌ Found $ISSUES_FOUND critical issue(s) in production code.${NC}"
  echo ""
  echo "Please remove mock data before committing:"
  echo "  - Replace mock data with real API/database calls"
  echo "  - Use environment variables for configuration"
  echo "  - Move test data to test files only"
  exit 1
fi
