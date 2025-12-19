---
description: Prime agent with codebase understanding
---

# Prime: Load Project Context

## Objective

Build comprehensive understanding of the codebase by analyzing structure, documentation, and key files.

## Process

### 0. Check Archon Knowledge Base (If Available)

**PRIORITY: If Archon MCP is enabled, check indexed documentation FIRST:**

1. **List available sources**: `mcp__archon__rag_get_available_sources()`
   - Shows all previously indexed documentation
   - Displays: title, URL, creation date

2. **Search for project-related docs**:
   - Identify technologies from package.json/requirements.txt
   - Search Archon for each: `mcp__archon__rag_search_knowledge_base(query="[technology]", match_count=3)`
   - Example: If project uses React, search: `mcp__archon__rag_search_knowledge_base(query="React", match_count=3)`

3. **Report findings**:
   - **Indexed dependencies**: List which technologies already have documentation in Archon
   - **Missing dependencies**: Identify important dependencies not yet indexed
   - **Recommendations**: Suggest which docs to index for better AI assistance

**Example Output**:
```
📚 Archon Knowledge Base Status:
✅ Indexed: React (v18 docs, 3,456 chunks), PostgreSQL (Official docs, 2,134 chunks)
❌ Missing: Express.js, Jest
💡 Recommend: /crawl https://expressjs.com for Express documentation
```

If Archon is not available, skip to Step 1.

---

### 1. Analyze Project Structure

List all tracked files:
!`git ls-files`

Show directory structure:
On Linux, run: `tree -L 3 -I 'node_modules|__pycache__|.git|dist|build'`

### 2. Read Core Documentation

- Read .agents/PRD.md
- Read CLAUDE.md or similar global rules file
- Read README files at project root and major directories
- Read any architecture documentation

### 3. Identify Key Files

Based on the structure, identify and read:
- Main entry points (main.py, index.ts, app.py, etc.)
- Core configuration files (pyproject.toml, package.json, tsconfig.json)
- Key model/schema definitions
- Important service or controller files

### 4. Understand Current State

Check recent activity:
!`git log -10 --oneline`

Check current branch and status:
!`git status`

## Output Report

Provide a concise summary covering:

### Archon Knowledge Base (If Available)
- **Indexed Dependencies**: Which technologies already have docs in Archon
- **Missing Dependencies**: Key dependencies that should be indexed
- **Recommendations**: Suggested crawl commands to improve knowledge base
- **Coverage**: Percentage of major dependencies covered by Archon

### Project Overview
- Purpose and type of application
- Primary technologies and frameworks
- Current version/state

### Architecture
- Overall structure and organization
- Key architectural patterns identified
- Important directories and their purposes

### Tech Stack
- Languages and versions
- Frameworks and major libraries
- Build tools and package managers
- Testing frameworks

### Core Principles
- Code style and conventions observed
- Documentation standards
- Testing approach

### Current State
- Active branch
- Recent changes or development focus
- Any immediate observations or concerns

**Make this summary easy to scan - use bullet points and clear headers.**
