# Archon Automatic Research Workflow - Implementation Plan

## Project: Issue #3 - Archon Phase 2 & 3 Integration

**Created**: 2024-12-19
**Status**: In Progress
**Archon Project ID**: c9bd0aa0-4298-48c5-8f1f-28ef7c142240

---

## Overview

Implement automatic research capabilities that leverage Archon's knowledge base for zero-touch documentation access. This extends Phase 1 (manual `/crawl` commands) with intelligent auto-detection and PIV loop integration.

## Implementation Tasks

### Phase 2: Orchestrator Auto-Detection

#### Task 1: Create Dependency Detector Utility
**File**: `src/utils/dependency-detector.ts`
**Priority**: High (Foundation)
**Status**: Todo
**Description**: Build a utility that parses user prompts for external dependencies and maps them to documentation URLs.

**Requirements**:
- Database of 30+ known frameworks/libraries with docs URLs
- Pattern matching for dependency mentions (react, supabase, etc.)
- Category classification (framework, library, service)
- Export interface: `{ name: string, docsUrl: string, category: string }`

**Test File**: `src/utils/dependency-detector.test.ts`

---

#### Task 2: Create Knowledge Evaluator
**File**: `src/utils/knowledge-evaluator.ts`
**Priority**: High
**Status**: Todo
**Description**: Determine if a detected dependency is worth indexing in Archon.

**Requirements**:
- Evaluation criteria: popularity, cross-project value, stability
- Blocklist for internal/deprecated libraries
- Return boolean: should index or not

**Test File**: `src/utils/knowledge-evaluator.test.ts`

---

#### Task 3: Integrate Auto-Crawl in Orchestrator
**File**: `src/orchestrator/orchestrator.ts`
**Priority**: High
**Status**: Todo
**Description**: Add pre-prompt hook that detects dependencies and triggers Archon crawls.

**Requirements**:
- Hook before AI prompt processing
- Check Archon for existing documentation sources
- Trigger crawl if missing and valuable
- Support 3 crawl strategies: background, blocking, suggest
- User notifications for crawl status

**Integration Points**:
- Add after line 260 (before AI conversation starts)
- Check if Archon MCP tools are available
- Call `rag_get_available_sources()` to check existing docs
- Trigger crawl using appropriate MCP tool

---

#### Task 4: Add Environment Configuration
**File**: `.env.example`, `src/types/index.ts`
**Priority**: Medium
**Status**: Todo
**Description**: Add configuration options for auto-crawl behavior.

**New Environment Variables**:
```bash
ARCHON_AUTO_CRAWL=true              # Enable automatic crawling
ARCHON_CRAWL_STRATEGY=background    # background | blocking | suggest
ARCHON_CRAWL_MAX_WAIT=60000        # Max wait time for blocking crawls (ms)
```

---

### Phase 3: PIV Loop Integration

#### Task 5: Enhance Prime Command with Archon Search
**File**: `.claude/commands/exp-piv-loop/prime.md` (if exists) or create new
**Priority**: High
**Status**: Todo
**Description**: Add Archon knowledge base checking as Step 0 in prime workflow.

**Requirements**:
- Add Step 0: "Check Archon Knowledge Base"
- Query `rag_get_available_sources()`
- Search `rag_search_knowledge_base(query="[PROJECT_NAME]")`
- Report indexed dependencies
- Identify knowledge gaps (compare package.json with Archon sources)
- Recommend crawl commands for missing docs

---

#### Task 6: Enhance Plan Command with Archon References
**File**: `.claude/commands/exp-piv-loop/plan.md`
**Priority**: High
**Status**: Todo
**Description**: Integrate Archon search before web search in planning phase.

**Requirements**:
- Add Phase 3 enhancement to external research section
- Check Archon first: `rag_search_knowledge_base(query="[feature type] best practices")`
- Search for code examples: `rag_search_code_examples(query="[similar implementation]")`
- Include Archon source citations in plan
- Format: "See: [Source Name] (Archon) - Section: [section]"
- Fall back to WebSearch if not found in Archon

---

#### Task 7: Enhance Execute Command with Archon Priority
**File**: `.claude/commands/exp-piv-loop/execute.md` or `.claude/commands/core_piv_loop/execute.md`
**Priority**: Medium
**Status**: Todo
**Description**: Prefer Archon over WebSearch during implementation.

**Requirements**:
- Check Archon first for API references
- Fall back to WebSearch only if not found
- Update implementation plan with Archon source citations

---

### Testing & Validation

#### Task 8: Unit Tests for Dependency Detector
**File**: `src/utils/dependency-detector.test.ts`
**Priority**: High
**Status**: Todo
**Coverage Target**: 95%+

**Test Cases**:
- Detect React mentions
- Detect Supabase mentions
- Detect multiple dependencies in one message
- Ignore internal tools
- Handle case variations
- Extract correct docsUrl for each dependency

---

#### Task 9: Unit Tests for Knowledge Evaluator
**File**: `src/utils/knowledge-evaluator.test.ts`
**Priority**: High
**Status**: Todo
**Coverage Target**: 95%+

**Test Cases**:
- Value popular stable libraries (React, Supabase, etc.)
- Reject deprecated libraries
- Reject internal tools
- Handle unknown dependencies gracefully

---

#### Task 10: Integration Tests for Auto-Crawl
**File**: `src/orchestrator/orchestrator.test.ts` (extend)
**Priority**: High
**Status**: Todo

**Test Scenarios**:
1. First mention triggers crawl
2. Second mention uses cached knowledge
3. Background mode doesn't block
4. Blocking mode waits for completion
5. Suggest mode prompts user

---

#### Task 11: Integration Tests for PIV Loop
**Priority**: Medium
**Status**: Todo

**Test Scenarios**:
1. Prime command searches Archon first
2. Prime recommends missing docs for crawling
3. Plan includes Archon references
4. Execute prefers Archon over WebSearch

---

#### Task 12: Manual Validation
**Priority**: High
**Status**: Todo

**Scenarios to Test**:
1. **New dependency in prompt**:
   - User: "Add Stripe payment integration"
   - Expected: Auto-crawl notification, docs indexed, accurate response

2. **Prime with missing docs**:
   - User: `/command-invoke prime`
   - Expected: Archon check, missing deps identified, crawl recommendations

3. **Plan with Archon references**:
   - User: `/command-invoke plan "Add real-time notifications"`
   - Expected: Plan includes [Archon] tagged references

---

### Documentation

#### Task 13: Update Documentation
**Files**:
- `docs/archon-integration.md` (create if doesn't exist)
- `.agents/reference/archon-rules.md` (update)
- `README.md` (update features section)

**Content**:
- Auto-crawl feature explanation
- Configuration options
- PIV loop Archon integration
- Usage examples
- Troubleshooting guide

---

## Acceptance Criteria

### Phase 2 (Orchestrator)
- [x] `src/utils/dependency-detector.ts` implemented with 20+ known dependencies
- [ ] Auto-crawl triggers when unknown dependency mentioned
- [ ] User sees clear notifications about crawl status
- [ ] Three crawl strategies work correctly (background, blocking, suggest)
- [ ] Configuration via environment variables
- [ ] Duplicate crawl prevention (check existing sources)
- [ ] Unit tests: 95%+ coverage for detector and evaluator
- [ ] Integration tests: All 3 strategies validated

### Phase 3 (PIV Loop)
- [ ] `/prime` searches Archon before codebase analysis
- [ ] `/prime` recommends missing docs for crawling
- [ ] `/plan` includes Archon references in external research section
- [ ] `/execute` prefers Archon over WebSearch
- [ ] All commands document Archon sources used
- [ ] Integration tests: Prime → Plan → Execute flow validated
- [ ] Manual validation: All 3 scenarios pass

### Both Phases
- [ ] Zero breaking changes to Phase 1 functionality
- [ ] All existing tests still pass
- [ ] Type checking: 0 errors
- [ ] Linting: 0 errors
- [ ] Documentation updated
- [ ] Performance: Auto-crawl adds <2s latency in background mode
- [ ] Error handling: Graceful degradation if Archon unavailable

---

## Implementation Order

1. **Foundation** (Tasks 1-2): Build core utilities
2. **Integration** (Task 3-4): Connect to orchestrator with config
3. **PIV Enhancement** (Tasks 5-7): Upgrade PIV loop commands
4. **Testing** (Tasks 8-11): Comprehensive test coverage
5. **Validation** (Task 12): Manual end-to-end testing
6. **Documentation** (Task 13): Complete docs and examples

---

## Estimated Timeline

- **Foundation**: 3-4 hours
- **Integration**: 4-5 hours
- **PIV Enhancement**: 4-6 hours
- **Testing**: 4-5 hours
- **Validation**: 2-3 hours
- **Documentation**: 2-3 hours

**Total**: 19-26 hours (2.5-3.5 days)

---

## Notes

- Archon MCP tools must be available (Phase 1 dependency)
- All new code must follow existing patterns (see similar adapters/utils)
- TypeScript strict mode compliance required
- All user-facing messages must be clear and helpful
- Error handling must be comprehensive (Archon may be unavailable)
