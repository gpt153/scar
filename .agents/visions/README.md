# Vision Documents

This directory contains lightweight, non-technical vision documents that describe **what** to build, not **how** to build it.

## Purpose

Vision documents are created during the brainstorming phase and serve as:
- Clear project descriptions for non-technical stakeholders
- Input for generating technical PRDs
- Reference for keeping implementation aligned with user needs
- Approval artifacts before technical work begins

## Format

Vision docs should include:
- **What It Is** - One paragraph overview
- **Who It's For** - Target users and use cases
- **The Problem** - What pain points are being solved
- **The Solution** - How the project addresses those needs
- **Key Features** - Main functionality in plain language
- **User Experience** - Story of how someone uses it
- **Success Metrics** - Clear, measurable outcomes
- **Out of Scope** - What's explicitly not included

## Workflow

```
1. Brainstorming → .agents/visions/[project].md
2. User Approval → ✓
3. PRD Generation → docs/PRD.md
4. Technical Planning → .agents/plans/[project].plan.md
5. Implementation → Code
```

## Guidelines

**DO:**
- Write for non-technical readers
- Focus on user value and experience
- Use concrete examples and scenarios
- Keep it short (2-3 pages max)
- Describe outcomes, not implementations

**DON'T:**
- Specify tech stack or frameworks
- Include code examples or APIs
- Use technical jargon without explanation
- Prescribe implementation details
- Make it longer than necessary

## Examples

See `project-orchestrator.md` for a complete example.
