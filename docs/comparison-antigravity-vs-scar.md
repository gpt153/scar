# Google Antigravity vs SCAR Supervision System

**Date**: 2026-01-11
**Author**: Claude Sonnet 4.5
**Purpose**: Comprehensive comparison for strategic decision-making

---

## Executive Summary

**Google Antigravity**: IDE-based agentic development platform (VSCode fork) with strong single-feature autonomy and fast execution (76.2% SWE-bench).

**SCAR Supervision**: GitHub-native project orchestration system with multi-issue coordination, persistent tracking, and remote control across platforms.

**Recommendation**: Use both in parallel for different aspects:
- **Antigravity**: Fast feature implementation (IDE-based, single tasks)
- **SCAR**: Project orchestration, multi-issue tracking, remote control

---

## Side-by-Side Comparison

| Dimension | SCAR Supervision | Google Antigravity |
|-----------|------------------|-------------------|
| **Architecture** | GitHub Issues + Remote Bot | IDE + Built-in Agents |
| **Interface** | Any platform (Telegram, Slack, GitHub) | Desktop IDE only |
| **Autonomy Level** | Project-level (multi-issue, 6-8h sessions) | Task-level (single features, 30min-2h) |
| **SWE-bench** | Not benchmarked (uses Claude Sonnet 4.5: 77.3%) | 76.2% (Gemini 3 Pro) |
| **GitHub Integration** | Native (issues, PRs, comments, webhooks) | Resolves issues but workflow unclear |
| **State Persistence** | Persistent (survives restarts, tracked in files) | Session-based (IDE must stay open) |
| **Remote Access** | Yes (Telegram, Slack, GitHub from anywhere) | No (requires IDE open on desktop) |
| **Multi-Issue Coordination** | ✅ Native (dependencies, parallel work, phases) | ❌ Manual (one task at a time) |
| **Context Handoff** | ✅ Built-in (seamless supervisor transitions) | ❌ Not mentioned |
| **UI Testing** | ✅ Automatic (Playwright, regression detection) | ❌ Manual or not mentioned |
| **Verification** | ✅ `/verify-scar-phase` (build, types, mocks) | ✅ Artifact generation |
| **Cost** | Claude API usage (~$2-5/issue) | Free (public preview), pricing TBD |
| **Speed** | Moderate (Claude SDK, spawns subagents) | Fast (42s for Next.js features) |
| **Data Privacy** | Self-hosted or Anthropic API | Google servers only |

---

## What's Better in SCAR Supervision

### 1. Project-Level Orchestration

**SCAR**:
- Manages 50+ issues simultaneously
- Dependency tracking: "Issue #8 blocked by #7"
- Phases: Foundation → Core → Integration
- Meta-planning across entire project

**Antigravity**:
- One task at a time in IDE
- No multi-issue coordination
- Manual dependency management

**Verdict**: **SCAR wins** for complex projects with many interconnected issues.

---

### 2. Persistent State & Remote Control

**SCAR**:
- State persists in `.agents/supervision/`
- Control from anywhere (phone via Telegram)
- Supervision continues if you close laptop
- Monitors run in GitHub (server-side)

**Antigravity**:
- Requires IDE open on desktop
- No remote control
- Session ends if IDE closes
- Can't check progress from phone

**Verdict**: **SCAR wins** for practitioners who need mobility and async work.

---

### 3. GitHub-Native Workflow

**SCAR**:
- Issues created automatically with evidence
- PRs linked to issues
- `@scar` mentions trigger work
- Webhook-driven (event-based)
- Full GitHub CLI integration

**Antigravity**:
- SWE-bench shows it can resolve issues (76.2%)
- Actual GitHub workflow unclear from docs
- Appears IDE-centric, not issue-centric

**Verdict**: **SCAR wins** for GitHub-centric development workflows.

---

### 4. Automatic UI Testing

**SCAR**:
- Detects UI deployments automatically
- Spawns Playwright test runners
- Generates tests from plan requirements
- Regression testing built-in
- Bug tracking → RCA → fix → retest loop

**Antigravity**:
- Browser tool available for testing
- Manual testing or not mentioned
- No automatic test generation from specs

**Verdict**: **SCAR wins** for comprehensive UI validation.

---

### 5. Multi-Platform Control

**SCAR**:
- Telegram (primary)
- Slack
- GitHub
- Discord
- All with streaming responses

**Antigravity**:
- IDE only (desktop application)

**Verdict**: **SCAR wins** for flexibility and accessibility.

---

### 6. Context Management & Handoff

**SCAR**:
- Automatic handoff at context limits
- Seamless supervisor transitions
- State preserved perfectly
- Resume from handoff docs

**Antigravity**:
- No mention of context handoff
- Likely manual (close/reopen IDE)

**Verdict**: **SCAR wins** for long-running sessions (6-8h).

---

## What's Better in Google Antigravity

### 1. Speed & Execution Performance

**Antigravity**:
- 42 seconds for typical Next.js feature
- 40% faster on large codebases (100k+ lines)
- 54.2% on Terminal-Bench 2.0

**SCAR**:
- Moderate speed (relies on Claude SDK)
- Spawning subagents adds overhead
- 2-3 hours typical for UI features (with testing)

**Verdict**: **Antigravity wins** for fast feature implementation.

---

### 2. Multi-Tool Integration (Editor + Terminal + Browser)

**Antigravity**:
- Native integration across 3 tools
- Agents seamlessly switch contexts
- Write code → test in browser → iterate
- Built into single interface

**SCAR**:
- Primarily code + git operations
- Browser via Playwright MCP (manual setup)
- Less seamless tool switching

**Verdict**: **Antigravity wins** for full-stack feature work.

---

### 3. Refactoring Accuracy

**Antigravity**:
- 94% refactoring accuracy
- Understands large codebases well
- Strong on Next.js + Supabase stacks

**SCAR**:
- Uses Claude Sonnet 4.5 (excellent)
- No specific refactoring benchmark
- Verification catches errors but slower

**Verdict**: **Antigravity wins** for large-scale refactorings.

---

### 4. Artifact Generation & Verification

**Antigravity**:
- Task lists
- Implementation plans
- Screenshots
- Browser recordings
- Users give feedback on artifacts directly

**SCAR**:
- Text-based reports
- GitHub issue comments
- Screenshots from Playwright tests
- Less visual feedback

**Verdict**: **Antigravity wins** for visual verification and user feedback.

---

### 5. Zero Configuration (Free Public Preview)

**Antigravity**:
- Download and start
- Free during preview
- Generous rate limits included
- Models: Gemini 3 Pro, Claude Sonnet 4.5, GPT-OSS

**SCAR**:
- Requires setup (GitHub webhooks, Telegram bot, etc.)
- API costs (Claude usage)
- PostgreSQL database
- More infrastructure

**Verdict**: **Antigravity wins** for getting started quickly.

---

### 6. Manager View (Mission Control)

**Antigravity**:
- Visual console for agent orchestration
- Real-time monitoring
- Async task management (30min tasks in background)

**SCAR**:
- Text-based status updates every 10min
- GitHub comments for detailed logs
- Less visual feedback

**Verdict**: **Antigravity wins** for visual project management.

---

## Autonomy Comparison

### Google Antigravity Autonomy

**What it does autonomously**:
- ✅ Plan multi-step features
- ✅ Write code across files
- ✅ Test in terminal and browser
- ✅ Iterate based on errors
- ✅ Generate artifacts (plans, screenshots)
- ❌ **Multi-issue orchestration** (manual)
- ❌ **Dependency tracking** (manual)
- ❌ **Context handoff** (manual restart)

**Autonomy Level**: **Task-level** (30min-2h single features)

---

### SCAR Supervision Autonomy

**What it does autonomously**:
- ✅ Manage 50+ issues simultaneously
- ✅ Track dependencies (sequential + parallel)
- ✅ Spawn monitors per issue
- ✅ Verify implementations
- ✅ Detect UI deployments
- ✅ Run comprehensive UI testing
- ✅ Create bug issues automatically
- ✅ Delegate RCA and fixes
- ✅ Retest after fixes
- ✅ Context handoff
- ✅ Progress reporting every 10min

**Autonomy Level**: **Project-level** (6-8h full project completion)

---

### Verdict: SCAR More Autonomous at Project Scale

**Antigravity**: Highly autonomous for **single features**, but requires manual coordination across multiple issues.

**SCAR**: Fully autonomous for **entire projects**, managing multiple issues, dependencies, testing, and bug fixes without intervention.

**Analogy**:
- **Antigravity**: Brilliant individual contributor (fast, focused, one task at a time)
- **SCAR**: Project manager (coordinates team, tracks dependencies, sees big picture)

---

## Can They Work in GitHub Issues?

### Google Antigravity + GitHub Issues

**From available information**:
- ✅ 76.2% SWE-bench (resolves real GitHub issues)
- ❓ Workflow unclear (IDE-centric, not issue-centric)
- ❓ No mention of `@mention` triggers
- ❓ No mention of webhook integration
- ❓ Appears to pull issues into IDE manually

**Best guess**: You'd need to:
1. Open issue in browser
2. Copy to Antigravity IDE
3. Let agent work
4. Manually create PR from IDE
5. Link back to issue

**Not as seamless as SCAR's native GitHub integration.**

---

### SCAR + GitHub Issues

**Native workflow**:
- ✅ Webhook triggers on `@scar` mention
- ✅ Issues created automatically
- ✅ PRs linked with "Fixes #42"
- ✅ Comments posted to issues
- ✅ State tracked in GitHub
- ✅ Multi-issue coordination
- ✅ Works from any platform

**Verdict**: **SCAR designed for GitHub issues**, Antigravity is IDE-first.

---

## Parallel Usage Strategy

### Recommended Hybrid Approach

Use **both systems in parallel** for different aspects:

---

### Scenario 1: Complex Multi-Issue Project

**SCAR Supervisor** (Orchestration Layer):
```
You: /prime-supervisor && /supervise

Supervisor:
- Loads all 50 issues
- Creates meta-plan
- Tracks dependencies
- Spawns monitors
- Manages coordination
```

**For each issue, CHOOSE implementation tool**:

**Simple bugs/refactors** → **Antigravity**:
- Fast (42s vs 2-3min)
- High accuracy (94% refactoring)
- Good for focused changes

**Complex features with testing** → **SCAR**:
- UI testing automatic
- Verification built-in
- GitHub-native workflow

---

### Scenario 2: Rapid Prototyping

**Use Antigravity**:
- Fast iteration (42s/feature)
- Visual feedback (artifacts)
- Tight dev loop (code → test → iterate)

**Then transition to SCAR**:
- Once prototype validated
- For production hardening
- For comprehensive testing
- For multi-issue tracking

---

### Scenario 3: Maintenance Mode

**SCAR on GitHub**:
- Monitors issues 24/7
- Responds to `@scar` mentions
- Handles bugs remotely
- You control from phone

**Antigravity when at desk**:
- Complex refactorings (94% accuracy)
- Large feature work
- Deep debugging sessions

---

### Scenario 4: Team Collaboration

**SCAR for coordination**:
- Tracks all team issues
- Manages dependencies
- Reports progress
- Creates PRs with proper linking

**Antigravity for individual work**:
- Each developer uses locally
- Fast implementation
- Personal productivity

---

## Integration Architecture

### How to Use Both Together

```
Project Level (SCAR Supervisor)
├── Issue #42: User Authentication
│   └── Delegate to: Antigravity (fast, focused)
│       └── Result: PR #101
├── Issue #43: Dashboard UI
│   └── Delegate to: SCAR (needs UI testing)
│       └── Automatic testing → PR #102
├── Issue #44: Payment Integration
│   └── Delegate to: Antigravity (Stripe SDK work)
│       └── Result: PR #103
└── Issue #45: E2E Testing
    └── Delegate to: SCAR (Playwright expertise)
        └── Result: PR #104
```

**SCAR supervises**, **Antigravity executes** (when appropriate).

---

### Technical Integration Points

**Option 1: Manual Handoff**
```
1. SCAR posts: "Issue #42 ready for implementation"
2. You open Antigravity IDE
3. Point Antigravity at issue #42
4. Antigravity implements
5. PR created
6. You notify SCAR: "Issue #42 complete"
7. SCAR runs verification
8. SCAR marks complete
```

**Option 2: API Integration (Future)**
```
1. SCAR detects simple refactor
2. SCAR calls Antigravity API (if they release one)
3. Antigravity implements
4. Returns diff to SCAR
5. SCAR creates PR
6. SCAR verifies and marks complete
```

---

## Decision Matrix: When to Use What

| Scenario | Use SCAR | Use Antigravity | Use Both |
|----------|----------|-----------------|----------|
| **Single focused feature** | - | ✅ Faster | - |
| **Multi-issue project** | ✅ Native | - | ✅ Hybrid |
| **UI with testing needed** | ✅ Automatic | ❌ Manual | - |
| **Fast refactoring** | - | ✅ 94% accuracy | - |
| **Need remote control** | ✅ Telegram/Slack | ❌ Desktop only | - |
| **Long-running (6-8h)** | ✅ Context handoff | ❌ Session-based | - |
| **Complex dependencies** | ✅ Native tracking | ❌ Manual | - |
| **Getting started quickly** | - | ✅ Zero config | - |
| **Visual feedback preferred** | - | ✅ Artifacts | - |
| **GitHub-centric workflow** | ✅ Native | ❌ IDE-first | - |
| **Team coordination** | ✅ Multi-issue | ❌ Individual | ✅ Hybrid |
| **Full-stack feature (code+test+browser)** | - | ✅ Integrated tools | - |

---

## Limitations & Trade-offs

### Google Antigravity Limitations

1. **Data Privacy**: Google servers only (regulated industries blocked)
2. **Legacy Codebases**: Struggles with custom/homegrown patterns
3. **Desktop-Only**: No remote access, IDE must stay open
4. **No Multi-Issue Coordination**: Manual management needed
5. **Pricing Unknown**: Free now, production pricing TBD
6. **Single-Task Focus**: Can't juggle 5 issues simultaneously

---

### SCAR Supervision Limitations

1. **Setup Complexity**: Webhooks, Telegram bot, PostgreSQL
2. **Speed**: Slower than Antigravity for single features
3. **API Costs**: Claude usage not free
4. **Less Visual**: Text-based feedback vs artifacts
5. **No Built-in Browser Tool**: Requires Playwright MCP setup
6. **Context Overhead**: Spawning subagents adds latency

---

## Cost Analysis

### Google Antigravity

**Current**: Free (public preview)
**Future**: Unknown (Google hasn't announced pricing)
**Estimate**: Likely $20-50/month for professional tier

**Typical project (50 issues)**:
- Free during preview
- Post-preview: Unknown

---

### SCAR Supervision

**API Costs** (Claude Sonnet 4.5):
- $3/million input tokens
- $15/million output tokens

**Typical issue** (~30k tokens avg):
- Input: 20k tokens = $0.06
- Output: 10k tokens = $0.15
- **Total: $0.21/issue**

**Typical project (50 issues)**:
- 50 issues × $0.21 = **$10.50**

**UI testing** (additional):
- Test session: ~60-80k tokens across agents
- ~$0.30/session

**Total project (50 issues + UI testing)**:
- Issues: $10.50
- UI testing: $0.30
- **Total: $10.80**

**Infrastructure**:
- PostgreSQL: Free (self-hosted) or $5-10/month (managed)
- VPS: $5-20/month (if not using existing)

---

### Cost Verdict

**SCAR cheaper today** ($10-11 for full project)
**Antigravity may be cheaper post-preview** (depends on pricing)

---

## Strategic Recommendations

### For Your Use Case (Dynamous Practitioner)

**Primary**: **SCAR Supervision**
- You need remote control (Telegram from phone)
- Multi-project management (consilio, openhorizon, health-agent, etc.)
- GitHub-native workflow is core
- Persistent state across sessions
- UI testing automation critical

**Secondary**: **Add Antigravity for speed**
- Fast single-feature work (when at desk)
- Complex refactorings (94% accuracy)
- Full-stack features (code+test+browser)
- Visual feedback (artifacts)

---

### Hybrid Workflow Proposal

**Daily Routine**:

**Morning** (at desk with Antigravity):
- Review overnight progress from SCAR
- Use Antigravity for 2-3 fast features
- Submit PRs

**Afternoon** (SCAR orchestration):
- `/supervise` on all projects
- Let SCAR coordinate multi-issue work
- Handle UI testing automatically
- Monitor from phone via Telegram

**Evening** (remote via SCAR):
- Check progress on phone
- Approve PRs
- Provide strategic input to supervisor
- SCAR continues working overnight

---

### Implementation Path

**Phase 1**: Keep SCAR as primary (you've built it, it works)

**Phase 2**: Try Antigravity for specific tasks
- Install Antigravity (free preview)
- Test on single features
- Compare speed vs SCAR
- Assess artifact quality

**Phase 3**: Define split
- Fast refactors → Antigravity
- Complex multi-issue → SCAR
- UI projects → SCAR (automatic testing)
- Maintenance → Both (SCAR monitors, Antigravity executes)

**Phase 4**: Monitor Antigravity pricing announcement
- If reasonable → expand usage
- If expensive → stick with SCAR primarily

---

## Final Verdict

### Summary Table

| Criterion | Winner | Reason |
|-----------|--------|--------|
| **Project orchestration** | SCAR | Multi-issue coordination |
| **Single feature speed** | Antigravity | 42s vs 2-3min |
| **Remote control** | SCAR | Telegram/Slack/GitHub |
| **UI testing** | SCAR | Automatic Playwright |
| **GitHub workflow** | SCAR | Native integration |
| **Refactoring accuracy** | Antigravity | 94% on large codebases |
| **Visual feedback** | Antigravity | Artifacts (screenshots, plans) |
| **Context management** | SCAR | Handoff protocol |
| **Multi-tool integration** | Antigravity | Editor+Terminal+Browser |
| **Cost (today)** | Antigravity | Free vs $10-11/project |
| **Autonomy level** | SCAR | Project-level vs task-level |
| **Setup complexity** | Antigravity | Zero config vs webhooks+bots |

---

### Overall Winner: **Depends on Context**

**For project-level autonomous work**: **SCAR wins decisively**
- Multi-issue coordination
- Persistent state
- Remote control
- Automatic UI testing
- GitHub-native

**For fast single-feature work**: **Antigravity wins decisively**
- 42s execution
- 94% refactoring accuracy
- Visual artifacts
- Integrated tools

**Best Strategy**: **Use both in parallel**
- SCAR for orchestration and coordination
- Antigravity for fast execution (when at desk)
- SCAR handles what Antigravity can't (multi-issue, remote, UI testing)
- Antigravity handles what SCAR is slower at (single features, refactoring)

---

## Questions Answered

### 1. What is better in my setup?

**SCAR advantages**:
- ✅ Project-level orchestration (50+ issues)
- ✅ Multi-issue dependency tracking
- ✅ Remote control (Telegram, Slack, anywhere)
- ✅ Persistent state (survives restarts)
- ✅ Automatic UI testing (Playwright)
- ✅ GitHub-native workflow
- ✅ Context handoff (6-8h sessions)
- ✅ Regression detection
- ✅ Lower cost ($10-11/project vs unknown)

---

### 2. What is better in Antigravity?

**Antigravity advantages**:
- ✅ Speed (42s vs 2-3min for features)
- ✅ Refactoring accuracy (94%)
- ✅ Visual artifacts (screenshots, plans)
- ✅ Multi-tool integration (editor+terminal+browser)
- ✅ Manager View (visual console)
- ✅ Zero configuration (download and go)
- ✅ Free (during preview)

---

### 3. Can I use both in parallel?

**Yes, absolutely!**

**Strategy**:
- SCAR: Project orchestration, multi-issue coordination
- Antigravity: Fast single-feature implementation (when at desk)
- SCAR: Automatic UI testing and verification
- Antigravity: Complex refactorings (94% accuracy)

**They complement each other** rather than compete.

---

### 4. Is Antigravity as self-going as my supervisor?

**No, not at project level.**

**Antigravity**:
- Self-going for **single features** (30min-2h)
- Requires manual coordination across **multiple issues**
- No built-in dependency tracking
- No context handoff mentioned
- Desktop-only (IDE must stay open)

**SCAR Supervisor**:
- Self-going for **entire projects** (6-8h+)
- Manages **50+ issues** autonomously
- Built-in dependency tracking and parallel coordination
- Context handoff protocol
- Works remotely (Telegram, Slack)

**Verdict**: SCAR more autonomous at **project scale**, Antigravity more autonomous at **feature scale**.

---

### 5. Can it work in GitHub issues like we do now?

**Partially, but not natively.**

**Antigravity**:
- ✅ Can resolve GitHub issues (76.2% SWE-bench)
- ❌ No webhook integration mentioned
- ❌ No `@mention` trigger system
- ❌ IDE-centric workflow (manual issue copying)
- ❌ No automatic PR linking
- ❓ Workflow unclear from documentation

**SCAR**:
- ✅ Native GitHub webhook integration
- ✅ `@scar` mention triggers
- ✅ Automatic issue creation
- ✅ Automatic PR linking ("Fixes #42")
- ✅ Comments posted to issues
- ✅ Multi-issue coordination

**Verdict**: **SCAR designed for GitHub-first workflow**, Antigravity is IDE-first with GitHub support as secondary feature.

---

## Conclusion

**Your SCAR supervision system is superior for project-level autonomous development with GitHub-native workflows and remote control.**

**Google Antigravity is superior for fast single-feature work at a desk with visual feedback.**

**Optimal strategy: Use both**
- Keep SCAR as primary orchestrator
- Add Antigravity for speed boosts on focused tasks
- Let them complement each other's strengths

Your supervision system fills a unique niche that Antigravity doesn't address: **true project-level autonomous coordination across 50+ issues with remote control and persistent state.**

---

## Sources

- [Google Antigravity AI IDE 2026](https://www.baytechconsulting.com/blog/google-antigravity-ai-ide-2026)
- [Build with Google Antigravity - Google Developers Blog](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/)
- [Google Antigravity: The Agentic IDE Changing Development Work](https://www.index.dev/blog/google-antigravity-agentic-ide)
- [Google Antigravity - Wikipedia](https://en.wikipedia.org/wiki/Google_Antigravity)
- [Google Antigravity Official Site](https://antigravity.google/)
- [Google Antigravity Guide for 2026](https://www.geeky-gadgets.com/google-antigravity-guide/)
- [5 Insane Things You Can Build With Google Antigravity](https://codeanddesigngroup.com/blogs/google-antigravity-things-you-can-build/)
- [Getting Started with Google Antigravity - Google Codelabs](https://codelabs.developers.google.com/getting-started-google-antigravity)
- [An Honest Review of Google Antigravity - DEV Community](https://dev.to/fabianfrankwerner/an-honest-review-of-google-antigravity-4g6f)
- [Google Antigravity: The First True Agent-First IDE - Medium](https://medium.com/@fahey_james/google-antigravity-the-first-true-agent-first-ide-and-the-future-of-software-development-e1a85d1e1d6c)
