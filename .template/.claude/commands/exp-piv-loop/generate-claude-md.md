---
description: Generate CLAUDE.md global rules file for current project
argument-hint: (auto-detects new vs existing project)
---

# Generate CLAUDE.md - Project Global Rules

**Purpose**: Analyze the current project and generate a comprehensive CLAUDE.md file with project-specific conventions, patterns, and AI coding assistant instructions.

---

## Your Task

Help me create the global rules for my project. Analyze the project first to see if it is a brand new project or if it is an existing one, because if it's a brand new project, then we need to do research online to establish the tech stack and architecture and everything that goes into the global rules. If it's an existing code base, then we need to analyze the existing code base.

## Instructions for Creating Global Rules

Create a `CLAUDE.md` file (or similar global rules file) following this structure:

### Required Sections:

1. **Core Principles**
   - Non-negotiable development principles (naming conventions, logging requirements, type safety, documentation standards)
   - Keep these clear and actionable

2. **Tech Stack**
   - Backend technologies (framework, language, package manager, testing tools, linting/formatting)
   - Frontend technologies (framework, language, runtime, UI libraries, linting/formatting)
   - Include version numbers where relevant
   - Backend/frontend is just an example, this depends on the project of course

3. **Architecture**
   - Backend structure (folder organization, layer patterns like service layer, testing structure)
   - Frontend structure (component organization, state management, routing if applicable)
   - Key architectural patterns used throughout
   - Backend/frontend is just an example, this depends on the project of course

4. **Code Style**
   - Backend naming conventions (functions, classes, variables, model fields)
   - Frontend naming conventions (components, functions, types)
   - Include code examples showing the expected style
   - Docstring/comment formats required

5. **Logging**
   - Logging format and structure (structured logging preferred)
   - What to log (operations, errors, key events)
   - How to log (code examples for both backend and frontend)
   - Include examples with contextual fields

6. **Testing**
   - Testing framework and tools
   - Test file structure and naming conventions
   - Test patterns and examples
   - How to run tests

7. **API Contracts** (if applicable - full-stack projects)
   - How backend models and frontend types must match
   - Error handling patterns across the boundary
   - Include examples showing the contract

8. **Common Patterns**
   - 2-3 code examples of common patterns used throughout the codebase
   - Backend service pattern example
   - Frontend component/API pattern example
   - These should be general templates, not task-specific

9. **Development Commands**
   - Backend: install, dev server, test, lint/format commands
   - Frontend: install, dev server, build, lint/format commands
   - Any other essential workflow commands

10. **AI Coding Assistant Instructions**
    - 10 concise bullet points telling AI assistants how to work with this codebase
    - Include reminders about consulting these rules, following conventions, running linters, etc.

## Process to Follow:

### For Existing Projects:
1. **Analyze the codebase thoroughly:**
   - Read package.json, pyproject.toml, or equivalent config files
   - Examine folder structure
   - Review 3-5 representative files from different areas (models, services, components, etc.)
   - Identify patterns, conventions, and architectural decisions already in place
2. **Extract and document the existing conventions** following the structure above
3. **Be specific and use actual examples from the codebase**

### For New Projects:
1. **Ask me clarifying questions:**
   - What type of project is this? (web app, API, CLI tool, mobile app, etc.)
   - What is the primary purpose/domain?
   - Any specific technology preferences or requirements?
   - What scale/complexity? (simple, medium, enterprise)
2. **After I answer, research best practices:**
   - Search for 2025 best practices for the chosen tech stack
   - Look up recommended project structures
   - Find modern conventions and tooling recommendations
3. **Create global rules based on research and best practices**

## Critical Requirements:

- **Length: 100-500 lines MAXIMUM** - The document MUST be less than 500 lines. Keep it concise and practical.
- **Be specific, not generic** - Use actual code examples, not placeholders
- **Focus on what matters** - Include conventions that truly guide development, not obvious statements
- **Keep it actionable** - Every rule should be clear enough that a developer (or AI) can follow it immediately
- **Use examples liberally** - Show, don't just tell

## Output Format:

Create the CLAUDE.md with:
- Clear section headers (## 1. Section Name)
- Code blocks with proper syntax highlighting
- Concise explanations
- Real examples from the codebase (existing projects) or based on best practices (new projects)

## Final Step:

**After generating the content**, write it to `CLAUDE.md` in the current working directory using the Write tool.

Start by analyzing the project structure now. If this is a new project and you need more information, ask your clarifying questions first.
