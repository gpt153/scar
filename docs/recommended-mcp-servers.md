# Recommended MCP Servers for Software Development

**Last Updated:** 2026-01-08
**Context:** Free MCP servers for software development with SCAR

This document lists Model Context Protocol (MCP) servers ranked by usefulness for software development workflows. All listed servers are **free and open source**.

## 🔗 Resources

- [Official MCP Registry](https://registry.modelcontextprotocol.io)
- [MCP Servers Directory](https://mcpservers.org)
- [Glama MCP Servers](https://glama.ai/mcp/servers)
- [Awesome MCP Servers (GitHub)](https://github.com/wong2/awesome-mcp-servers)

---

## ⭐ Tier 1: Essential (Already Integrated)

### 1. **Archon MCP Server** ⚡ *Already Active in SCAR*
**Type:** Local | **Use Case:** Task management, knowledge base, project tracking

**What it does:**
- Task management with project hierarchy (projects → tasks → features)
- RAG-powered knowledge base for indexed documentation
- Automatic dependency detection and documentation crawling
- Code example search with semantic similarity

**Why essential:** Central coordination system for SCAR workflows, enables knowledge-first development.

**Status:** ✅ Already configured and running in SCAR

---

### 2. **Playwright MCP Server** ⚡ *Already Active in SCAR*
**Type:** Local | **Use Case:** Browser automation, E2E testing, UI validation

**What it does:**
- Browser automation for testing web applications
- Screenshot capture and visual validation
- Form filling, navigation, and user interaction simulation
- E2E test execution with Chromium

**Why essential:** Validates actual user-facing functionality, catches UI/UX bugs that unit tests miss.

**Status:** ✅ Already configured and running in SCAR

---

## 🚀 Tier 2: High Priority (Strongly Recommended)

### 3. **GitHub MCP Server** 🔧
**Type:** Remote + Local | **Use Case:** GitHub operations beyond gh CLI

**Repository:** [github/github-mcp-server](https://github.com/github/github-mcp-server)

**What it does:**
- Read repositories and code files directly via GitHub API
- Manage issues, PRs, and code reviews programmatically
- Analyze code structure and dependencies
- Automate GitHub workflows from AI context

**Why useful:** Richer GitHub integration than gh CLI, better for complex repository operations.

**Installation:**
```bash
npx -y @modelcontextprotocol/server-github
```

**Configuration (.env):**
```env
ENABLE_GITHUB_MCP=true
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...
```

---

### 4. **Filesystem MCP Server** 📁
**Type:** Local | **Use Case:** Secure file operations with access control

**Repository:** [modelcontextprotocol/servers/filesystem](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)

**What it does:**
- Read, write, create, delete files via natural language
- Directory listing and navigation
- Configurable access controls for security
- Path validation and sandboxing

**Why useful:** Safer file operations than direct bash commands, prevents accidental deletions.

**Installation:**
```bash
npx -y @modelcontextprotocol/server-filesystem /workspace
```

---

### 5. **Git MCP Server** 🌿
**Type:** Local | **Use Case:** Advanced Git operations beyond basic commands

**Repository:** [modelcontextprotocol/servers/git](https://github.com/modelcontextprotocol/servers/tree/main/src/git)

**What it does:**
- Read, search, and manipulate Git repositories
- Commit history analysis and diff inspection
- Branch management and merge operations
- Git log parsing and blame tracking

**Why useful:** Semantic Git operations, better context for AI-driven code changes.

**Installation:**
```bash
npx -y @modelcontextprotocol/server-git
```

---

### 6. **Memory MCP Server** 🧠
**Type:** Local | **Use Case:** Persistent context across conversations

**Repository:** [modelcontextprotocol/servers/memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)

**What it does:**
- Knowledge graph-based persistent memory
- Remember user preferences and project context
- Cross-conversation continuity
- Relationship mapping between concepts

**Why useful:** AI remembers your preferences, reduces context re-explanation.

**Installation:**
```bash
npx -y @modelcontextprotocol/server-memory
```

**Alternatives:**
- [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) - Automatic context memory
- [mcp-memory](https://github.com/Puliczek/mcp-memory) - User preferences tracking (1K free tier)

---

### 7. **Context7 MCP Server** 📚
**Type:** Remote | **Use Case:** Version-specific framework documentation

**Website:** [context7.com](https://context7.com)

**What it does:**
- Injects up-to-date, version-specific documentation into prompts
- Reduces AI hallucination on framework APIs
- Code examples from actual documentation
- Supports major frameworks (React, Next.js, Vue, etc.)

**Why useful:** Solves the "outdated API knowledge" problem, accurate framework guidance.

**Free Tier:** Yes, developer-friendly limits

---

## 💡 Tier 3: Very Useful (Install as Needed)

### 8. **DBHub (Database MCP)** 🗄️
**Type:** Local | **Use Case:** Multi-database operations

**Repository:** [bytebase/dbhub](https://github.com/bytebase/dbhub)

**What it does:**
- Zero-dependency database gateway
- Supports PostgreSQL, MySQL, SQLite, SQL Server, MariaDB
- Token-efficient (only 2 MCP tools)
- Natural language → SQL conversion

**Why useful:** Single interface for all database operations, lightweight context usage.

**Installation:**
```bash
npm install -g @bytebase/dbhub
```

---

### 9. **Brave Search MCP** 🔍
**Type:** Remote | **Use Case:** Privacy-focused web search

**Repository:** [modelcontextprotocol/servers/brave-search](https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search)

**What it does:**
- Web search via Brave Search API
- Local search capabilities
- Advanced search operators (site:, filetype:, etc.)
- Privacy-focused (no tracking)

**Why useful:** Real-time web search without leaving AI context, research integration.

**Requires:** Brave Search API key (free tier available)

---

### 10. **Fetch MCP Server** 🌐
**Type:** Remote | **Use Case:** Web content fetching and conversion

**Repository:** [modelcontextprotocol/servers/fetch](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch)

**What it does:**
- Fetch web content via URLs
- Convert HTML to markdown for LLM efficiency
- Extract text from web pages
- Robots.txt respecting

**Why useful:** Grab documentation, examples, and reference material without manual copy-paste.

**Installation:**
```bash
npx -y @modelcontextprotocol/server-fetch
```

---

### 11. **MCP Omnisearch** 🔎
**Type:** Remote | **Use Case:** Unified multi-provider search

**Repository:** [spences10/mcp-omnisearch](https://github.com/spences10/mcp-omnisearch)

**What it does:**
- Combines Brave Search, Perplexity AI, Kagi, Tavily
- Web scraping via Firecrawl
- Content processing with Jina AI
- Single interface for multiple search engines

**Why useful:** Best-in-class search aggregation, comprehensive research tool.

**Requires:** API keys (most have free tiers)

---

### 12. **Perplexity MCP Server** 🤖
**Type:** Remote | **Use Case:** AI-powered research

**Documentation:** [docs.perplexity.ai/guides/mcp-server](https://docs.perplexity.ai/guides/mcp-server)

**What it does:**
- Real-time web search with AI reasoning
- Deep research mode with citations
- Combines GPT-4 Omni and Claude 3
- Conversational research interface

**Why useful:** Best for complex research questions requiring synthesis.

**Requires:** Perplexity API key (subscription required)

---

## 🛠️ Tier 4: Specialized (Domain-Specific)

### 13. **Kubernetes MCP Server** ☸️
**Type:** Local | **Use Case:** K8s cluster management

**Repository:** [containers/kubernetes-mcp-server](https://github.com/containers/kubernetes-mcp-server)

**What it does:**
- Native Go implementation (not kubectl wrapper)
- Direct Kubernetes API interaction
- CRUD operations on any K8s resource
- Helm chart management
- Non-destructive mode for safety

**Why useful:** Natural language K8s management, safer cluster operations.

**Installation:**
```bash
docker pull mcp/kubernetes
```

---

### 14. **Docker MCP Server** 🐳
**Type:** Local | **Use Case:** Container management

**Docker Hub:** [hub.docker.com/mcp/docker](https://hub.docker.com/mcp/docker)

**What it does:**
- Container lifecycle management
- Image operations (pull, build, push)
- Network and volume management
- Docker Compose operations

**Why useful:** Natural language Docker commands, simplifies container workflows.

---

### 15. **Jenkins MCP Server** 🔄
**Type:** Remote | **Use Case:** CI/CD automation

**What it does:**
- List Jenkins jobs and build history
- Trigger builds with parameters
- Fetch build logs and status
- Job configuration management

**Why useful:** AI-driven CI/CD debugging and monitoring.

---

### 16. **Terraform MCP Server** 🏗️
**Type:** Local | **Use Case:** Infrastructure as Code

**What it does:**
- Terraform plan/apply operations
- State file inspection
- Resource dependency analysis
- IaC code generation

**Why useful:** Natural language infrastructure management.

---

### 17. **Supabase MCP Server** 🔥
**Type:** Remote | **Use Case:** Serverless database operations

**What it does:**
- Direct Supabase database queries
- Schema exploration
- User record management
- Real-time subscription management

**Why useful:** Streamlines full-stack serverless development.

**Requires:** Supabase project + API key (free tier available)

---

### 18. **Redis MCP Server** 💾
**Type:** Remote | **Use Case:** Cache and data structure operations

**Repository:** [Official Redis MCP](https://github.com/redis/redis-mcp-server)

**What it does:**
- Key-value operations
- Data structure management (lists, sets, hashes)
- Search capabilities
- Pub/sub operations

**Why useful:** Natural language Redis operations, debugging cache issues.

---

### 19. **Snowflake MCP Server** ❄️
**Type:** Remote | **Use Case:** Data warehouse operations

**Repository:** [Snowflake Labs MCP](https://github.com/Snowflake-Labs/mcp-snowflake)

**What it does:**
- Cortex Agents integration
- Structured and unstructured data queries
- Object management
- SQL execution with RBAC

**Why useful:** Enterprise data warehouse access via natural language.

**Requires:** Snowflake account (paid)

---

### 20. **Digma MCP Server** 📊
**Type:** Remote | **Use Case:** Runtime observability

**Website:** [digma.ai](https://digma.ai)

**What it does:**
- Exposes runtime telemetry data to AI
- Performance issue detection
- Test flakiness analysis
- Bottleneck identification

**Why useful:** AI-powered performance debugging based on real usage data.

---

### 21. **Azure DevOps MCP** ☁️
**Type:** Remote | **Use Case:** Microsoft DevOps integration

**What it does:**
- Work item management
- Pipeline operations
- Repository access
- Build/release automation

**Why useful:** Natural language Azure DevOps workflows.

**Requires:** Azure DevOps account

---

### 22. **Atlassian MCP (Jira/Confluence)** 📋
**Type:** Remote | **Use Case:** Project management integration

**What it does:**
- Jira issue management
- Confluence page operations
- Sprint planning and tracking
- Automated ticket creation from code

**Why useful:** Seamless project management integration.

**Requires:** Atlassian Cloud account

---

## 🎯 Implementation Priority for SCAR

### Phase 1: Immediate (This Week)
1. ✅ **Archon MCP** - Already configured
2. ✅ **Playwright MCP** - Already configured
3. 🔧 **GitHub MCP** - Enhanced GitHub operations
4. 📁 **Filesystem MCP** - Safer file operations
5. 🌿 **Git MCP** - Advanced Git workflows

### Phase 2: High Value (Next 2 Weeks)
6. 🧠 **Memory MCP** - Persistent context
7. 📚 **Context7** - Framework documentation
8. 🗄️ **DBHub** - Database operations
9. 🔍 **Brave Search** - Web research
10. 🌐 **Fetch MCP** - Content retrieval

### Phase 3: Specialized (As Needed)
11. ☸️ **Kubernetes MCP** - When working with K8s projects
12. 🐳 **Docker MCP** - Enhanced container workflows
13. 🔥 **Supabase MCP** - For serverless projects
14. 💾 **Redis MCP** - Cache-heavy applications
15. 🔎 **Omnisearch** - Deep research projects

---

## 📦 Installation Guide

### Adding New MCP Servers to SCAR

1. **Update Environment Variables** (.env):
```env
# Enable new MCP server
ENABLE_[SERVER_NAME]_MCP=true
[SERVER_NAME]_API_KEY=your_key_here  # If required
```

2. **Update Docker Compose** (if needed):
```yaml
# Add to docker-compose.yml
services:
  app:
    environment:
      - ENABLE_FILESYSTEM_MCP=true
      - ENABLE_MEMORY_MCP=true
```

3. **Restart SCAR**:
```bash
docker compose --profile [your-profile] down
docker compose --profile [your-profile] up -d --build
```

4. **Verify Installation**:
```bash
# Check logs for MCP server initialization
docker compose logs -f app | grep MCP
```

---

## 🔒 Security Considerations

### Local MCP Servers
- **Filesystem MCP**: Always specify allowed directories explicitly
- **Git MCP**: Run in read-only mode for untrusted repositories
- **Memory MCP**: Store sensitive data outside memory graphs

### Remote MCP Servers
- **API Keys**: Store in `.env`, never commit to Git
- **Rate Limits**: Monitor free tier usage
- **Data Privacy**: Avoid sending sensitive code to third-party APIs

---

## 📊 Cost Considerations

### Completely Free (No Limits)
- Filesystem, Git, Memory, GitHub (local), Kubernetes, Docker

### Free Tier Available
- **Brave Search**: 2,000 queries/month (free)
- **Context7**: Developer-friendly limits
- **Supabase**: 500MB database, 2GB bandwidth
- **Cloudflare Workers**: 100K requests/day (for custom MCPs)

### Requires Paid Subscription
- **Perplexity**: $20/month for API access
- **Snowflake**: Enterprise pricing
- **Digma**: Free for individual developers, paid for teams

---

## 🔗 Additional Resources

- [Official MCP Documentation](https://modelcontextprotocol.io)
- [MCP Registry](https://registry.modelcontextprotocol.io)
- [Awesome MCP Servers](https://github.com/wong2/awesome-mcp-servers)
- [MCP Server Development Guide](https://github.com/punkpeye/awesome-mcp-devtools)
- [Building Custom MCP Servers](https://modelcontextprotocol.io/docs/building-servers)

---

## 📝 Notes

- **Tool Limit**: Keep total MCP tools under 42 for optimal model performance
- **Efficiency**: One MCP server can expose multiple tools (e.g., Filesystem has read_file, write_file, list_directory, etc.)
- **Testing**: Start with local MCP servers before adding remote dependencies
- **Monitoring**: Track MCP server performance in `/health` endpoint logs

---

**Last Updated:** 2026-01-08
**Maintained By:** SCAR Development Team
**Version:** 1.0
