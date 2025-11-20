# Cloud Deployment Guide

Deploy the Remote Coding Agent to a cloud VPS for 24/7 operation with automatic HTTPS and persistent uptime.

**Navigation:** [Prerequisites](#prerequisites) • [Server Setup](#1-server-provisioning--initial-setup) • [DNS Configuration](#2-dns-configuration) • [Repository Setup](#3-clone-repository) • [Environment Config](#4-environment-configuration) • [Database Migration](#5-database-migration) • [Caddy Setup](#6-caddy-configuration) • [Start Services](#7-start-services) • [Verify](#8-verify-deployment)

---

## Prerequisites

**Required:**
- Cloud VPS account (DigitalOcean, Linode, AWS EC2, Vultr, etc.)
- Domain name or subdomain (e.g., `remote-agent.yourdomain.com`)
- SSH client installed on your local machine
- Basic command-line familiarity

**Recommended Specs:**
- **CPU:** 1-2 vCPUs
- **RAM:** 2GB minimum (4GB recommended)
- **Storage:** 20GB SSD
- **OS:** Ubuntu 22.04 LTS

### Generate SSH Key (Required)

**Before creating your VPS**, generate an SSH key pair on your local machine:

```bash
# Generate SSH key (ed25519 recommended)
ssh-keygen -t ed25519 -C "remote-coding-agent"

# When prompted:
# - File location: Press Enter (uses default ~/.ssh/id_ed25519)
# - Passphrase: Optional but recommended

# View your public key (you'll need this for VPS setup)
cat ~/.ssh/id_ed25519.pub
# Windows: type %USERPROFILE%\.ssh\id_ed25519.pub
```

**Copy the public key output** - you'll add this to your VPS during creation.

---

## 1. Server Provisioning & Initial Setup

### Create VPS Instance (Examples)

<details>
<summary><b>DigitalOcean Droplet</b></summary>

1. Log in to [DigitalOcean](https://www.digitalocean.com/)
2. Click "Create" → "Droplets"
3. Choose:
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic ($12/month - 2GB RAM recommended)
   - **Datacenter:** Choose closest to your users
   - **Authentication:** SSH keys → "New SSH Key" → Paste your public key from Prerequisites
4. Click "Create Droplet"
5. Note the public IP address

</details>

<details>
<summary><b>AWS EC2 Instance</b></summary>

1. Log in to [AWS Console](https://console.aws.amazon.com/)
2. Navigate to EC2 → Launch Instance
3. Choose:
   - **AMI:** Ubuntu Server 22.04 LTS
   - **Instance Type:** t3.small (2GB RAM)
   - **Key Pair:** "Create new key pair" or import your public key from Prerequisites
   - **Security Group:** Allow SSH (22), HTTP (80), HTTPS (443)
4. Launch instance
5. Note the public IP address

</details>

<details>
<summary><b>Linode Instance</b></summary>

1. Log in to [Linode](https://www.linode.com/)
2. Click "Create" → "Linode"
3. Choose:
   - **Image:** Ubuntu 22.04 LTS
   - **Region:** Choose closest to your users
   - **Plan:** Nanode 2GB ($12/month)
   - **SSH Keys:** Add your public key from Prerequisites
   - **Root Password:** Set strong password (backup access)
4. Click "Create Linode"
5. Note the public IP address

</details>

### Initial Server Configuration

**Connect to your server:**

```bash
# Replace with your server IP (uses SSH key from Prerequisites)
ssh -i ~/.ssh/id_ed25519 root@your-server-ip
```

**Create deployment user:**

```bash
# Create user with sudo privileges
adduser deploy
usermod -aG sudo deploy

# Copy root's SSH authorized keys to deploy user
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Test connection in a new terminal before proceeding:
# ssh -i ~/.ssh/id_ed25519 deploy@your-server-ip
```

**Disable password authentication for security:**

```bash
# Edit SSH config
nano /etc/ssh/sshd_config
```

Find and change:
```
PasswordAuthentication no
```

> To get out of Nano after making changes, press: Ctrl + X -> Y -> enter

Restart SSH:
```bash
systemctl restart ssh

# Switch to deploy user for remaining steps
su - deploy
```

**Configure firewall:**

```bash
# Allow SSH, HTTP, HTTPS (including HTTP/3)
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

### Install Dependencies

**Install Docker:**

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add deploy user to docker group
sudo usermod -aG docker deploy

# Log out and back in for group changes to take effect
exit
ssh -i ~/.ssh/id_ed25519 deploy@your-server-ip
```

**Install Docker Compose, Git, and PostgreSQL Client:**

```bash
# Update package list
sudo apt update

# Install required packages
sudo apt install -y docker-compose-plugin git postgresql-client

# Verify installations
docker --version
docker compose version
git --version
psql --version
```

---

## 2. DNS Configuration

Point your domain to your server's IP address.

**A Record Setup:**

1. Go to your domain registrar or DNS provider (Cloudflare, Namecheap, etc.)
2. Create an **A Record**:
   - **Name:** `remote-agent` (for `remote-agent.yourdomain.com`) or `@` (for `yourdomain.com`)
   - **Value:** Your server's public IP address
   - **TTL:** 300 (5 minutes) or default

**Example (Cloudflare):**
```
Type: A
Name: remote-agent
Content: 123.45.67.89
Proxy: Off (DNS Only)
TTL: Auto
```

---

## 3. Clone Repository

**On your server:**

```bash
# Create application directory
sudo mkdir -p /remote-coding-agent
sudo chown deploy:deploy /remote-coding-agent

# Clone repository into the directory
cd /remote-coding-agent
git clone https://github.com/dynamous-community/remote-coding-agent .
```

---

## 4. Environment Configuration

### Create Environment File

```bash
# Copy example file
cp .env.example .env

# Edit with nano
nano .env
```

### 4.1 Core Configuration

Set these required variables:

```env
# Database - Use remote managed PostgreSQL
DATABASE_URL=postgresql://user:password@host:5432/dbname

# GitHub tokens (same value for both)
GH_TOKEN=ghp_your_token_here
GITHUB_TOKEN=ghp_your_token_here

# Server settings
PORT=3000
WORKSPACE_PATH=./workspace
```

**GitHub Token Setup:**

1. Visit [GitHub Settings > Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scope: **`repo`**
4. Copy token (starts with `ghp_...`)
5. Set both `GH_TOKEN` and `GITHUB_TOKEN` in `.env`

**Database Options:**

<details>
<summary><b>Recommended: Remote Managed PostgreSQL</b></summary>

Use a managed database service for easier backups and scaling.

**Supabase (Free tier available):**
1. Create project at [supabase.com](https://supabase.com)
2. Go to Settings → Database
3. Copy connection string (Transaction pooler recommended)
4. Set as `DATABASE_URL`

**Neon:**
1. Create project at [neon.tech](https://neon.tech)
2. Copy connection string from dashboard
3. Set as `DATABASE_URL`

</details>

<details>
<summary><b>Alternative: Local PostgreSQL (with-db profile)</b></summary>

To run PostgreSQL in Docker alongside the app:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/remote_coding_agent
```

Use the `with-db` profile when starting services (see Section 6).

</details>

**For detailed database setup, see [Core Configuration](../README.md#1-core-configuration-required) in the main README.**

### 4.2 AI Assistant Setup

**Configure at least one AI assistant.**

<details>
<summary><b>🤖 Claude Code</b></summary>

**On your local machine:**

```bash
# Install Claude Code CLI (if not already installed)
# Visit: https://docs.claude.com/claude-code/installation

# Generate OAuth token
claude setup-token

# Copy the token (starts with sk-ant-oat01-...)
```

**On your server:**

```bash
nano .env
```

Add:
```env
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-xxxxx
```

**Alternative: API Key**

If you prefer pay-per-use:
1. Visit [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Create key (starts with `sk-ant-`)
3. Set in `.env`:
```env
CLAUDE_API_KEY=sk-ant-xxxxx
```

**Set as default (optional):**
```env
DEFAULT_AI_ASSISTANT=claude
```

**For detailed Claude setup, see [AI Assistant Setup](../README.md#2-ai-assistant-setup-choose-at-least-one).**

</details>

<details>
<summary><b>🤖 Codex</b></summary>

**On your local machine:**

```bash
# Install Codex CLI (if not already installed)
# Visit: https://docs.codex.com/installation

# Authenticate
codex login

# Extract credentials
cat ~/.codex/auth.json
# On Windows: type %USERPROFILE%\.codex\auth.json

# Copy all four values
```

**On your server:**

```bash
nano .env
```

Add all four credentials:
```env
CODEX_ID_TOKEN=eyJhbGc...
CODEX_ACCESS_TOKEN=eyJhbGc...
CODEX_REFRESH_TOKEN=rt_...
CODEX_ACCOUNT_ID=6a6a7ba6-...
```

**Set as default (optional):**
```env
DEFAULT_AI_ASSISTANT=codex
```

**For detailed Codex setup, see [AI Assistant Setup](../README.md#2-ai-assistant-setup-choose-at-least-one).**

</details>

### 4.3 Platform Adapter Setup

**Configure at least one platform.**

<details>
<summary><b>💬 Telegram</b></summary>

**Create bot:**

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow prompts
3. Copy bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

**On your server:**

```bash
nano .env
```

Add:
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
TELEGRAM_STREAMING_MODE=stream  # stream (default) | batch
```

**For detailed Telegram setup, see [Platform Setup](../README.md#3-platform-adapter-setup-choose-at-least-one).**

</details>

<details>
<summary><b>🐙 GitHub Webhooks</b></summary>

**You'll configure this AFTER deployment** (need public URL first).

For now, just generate the webhook secret:

```bash
# Generate secret
openssl rand -hex 32

# Copy the output
```

Add to `.env`:
```env
WEBHOOK_SECRET=your_generated_secret_here
GITHUB_STREAMING_MODE=batch  # batch (default) | stream
```

**GitHub webhook configuration happens in Section 9 after services are running.**

</details>

**Save and exit nano:** `Ctrl+X`, then `Y`, then `Enter`

---

## 5. Database Migration

**IMPORTANT: Run this BEFORE starting the application.**

Initialize the database schema with required tables:

```bash
# For remote database (Supabase, Neon, etc.)
psql $DATABASE_URL < migrations/001_initial_schema.sql

# Verify tables were created
psql $DATABASE_URL -c "\dt"
# Should show: conversations, codebases, sessions
```

**If using local PostgreSQL with `with-db` profile:**

You'll run migrations after starting the database in Section 7.

---

## 6. Caddy Configuration

Caddy provides automatic HTTPS with Let's Encrypt certificates.

### Create Caddyfile

```bash
# Copy example file
cp Caddyfile.example Caddyfile

# Edit with your domain
nano Caddyfile
```

**Update with your domain:**

```
remote-agent.yourdomain.com {
    reverse_proxy app:3000
}
```

Replace `remote-agent.yourdomain.com` with your actual domain.

**Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

### How Caddy Works

- Automatically obtains SSL certificates from Let's Encrypt
- Handles HTTPS (443) and HTTP (80) → HTTPS redirect
- Proxies requests to app container on port 3000
- Renews certificates automatically

---

## 7. Start Services

### Setup Workspace Permissions (Linux Only)

```bash
# Create workspace directory and set permissions for container user (UID 1001)
mkdir -p workspace
sudo chown -R 1001:1001 workspace
```

### Option A: With Remote PostgreSQL (Recommended)

If using managed database:

```bash
# Start app with Caddy reverse proxy
docker compose -f docker-compose.yml -f docker-compose.cloud.yml up -d --build

# View logs
docker compose -f docker-compose.yml -f docker-compose.cloud.yml logs -f app
```

### Option B: With Local PostgreSQL

If using `with-db` profile:

```bash
# Start app, postgres, and Caddy
docker compose --profile with-db -f docker-compose.yml -f docker-compose.cloud.yml up -d --build

# View logs
docker compose --profile with-db -f docker-compose.yml -f docker-compose.cloud.yml logs -f app
docker compose --profile with-db -f docker-compose.yml -f docker-compose.cloud.yml logs -f postgres
```

### Monitor Startup

```bash
# Watch logs for successful startup
docker compose -f docker-compose.yml -f docker-compose.cloud.yml logs -f app

# Look for:
# [App] Starting Remote Coding Agent
# [Database] Connected successfully
# [App] Remote Coding Agent is ready!
```

**Press `Ctrl+C` to exit logs (services keep running).**

---

## 8. Verify Deployment

### Check Health Endpoints

**From your local machine:**

```bash
# Basic health check
curl https://remote-agent.yourdomain.com/health
# Expected: {"status":"ok"}

# Database connectivity
curl https://remote-agent.yourdomain.com/health/db
# Expected: {"status":"ok","database":"connected"}

# Concurrency status
curl https://remote-agent.yourdomain.com/health/concurrency
# Expected: {"status":"ok","active":0,"queued":0,"maxConcurrent":10}
```

### Check SSL Certificate

Visit `https://remote-agent.yourdomain.com/health` in your browser:
- Should show green padlock
- Certificate issued by "Let's Encrypt"
- Auto-redirect from HTTP to HTTPS

### Check Telegram (if configured)

Message your bot on Telegram:
```
/help
```

Should receive bot response with available commands.

---

## 9. Configure GitHub Webhooks

Now that your app has a public URL, configure GitHub webhooks.

### Generate Webhook Secret (if not done earlier)

```bash
# On server
openssl rand -hex 32

# Copy output to .env as WEBHOOK_SECRET if not already set
```

### Add Webhook to Repository

1. Go to: `https://github.com/owner/repo/settings/hooks`
2. Click "Add webhook"

**Webhook Configuration:**

| Field | Value |
|-------|-------|
| **Payload URL** | `https://remote-agent.yourdomain.com/webhooks/github` |
| **Content type** | `application/json` |
| **Secret** | Your `WEBHOOK_SECRET` from `.env` |
| **SSL verification** | Enable SSL verification |
| **Events** | Select individual events:<br>✓ Issues<br>✓ Issue comments<br>✓ Pull requests |

3. Click "Add webhook"
4. Check "Recent Deliveries" tab for successful delivery (green checkmark)

**Test webhook:**

Comment on an issue:
```
@your-bot-name can you analyze this issue?
```

Bot should respond with analysis.

**For detailed webhook configuration, see [Platform Setup](../README.md#3-platform-adapter-setup-choose-at-least-one#github-webhooks).**

---

## 10. Maintenance & Operations

### View Logs

```bash
# All services
docker compose -f docker-compose.yml -f docker-compose.cloud.yml logs -f

# Specific service
docker compose -f docker-compose.yml -f docker-compose.cloud.yml logs -f app
docker compose -f docker-compose.yml -f docker-compose.cloud.yml logs -f caddy

# Last 100 lines
docker compose -f docker-compose.yml -f docker-compose.cloud.yml logs --tail=100 app
```

### Update Application

```bash
# Pull latest changes
cd /remote-coding-agent
git pull

# Rebuild and restart
docker compose -f docker-compose.yml -f docker-compose.cloud.yml up -d --build

# Check logs
docker compose -f docker-compose.yml -f docker-compose.cloud.yml logs -f app
```

### Restart Services

```bash
# Restart all services
docker compose -f docker-compose.yml -f docker-compose.cloud.yml restart

# Restart specific service
docker compose -f docker-compose.yml -f docker-compose.cloud.yml restart app
docker compose -f docker-compose.yml -f docker-compose.cloud.yml restart caddy
```

### Stop Services

```bash
# Stop all services
docker compose -f docker-compose.yml -f docker-compose.cloud.yml down

# Stop and remove volumes (caution: deletes data)
docker compose -f docker-compose.yml -f docker-compose.cloud.yml down -v
```

---

## Troubleshooting

### Caddy Not Getting SSL Certificate

**Check DNS:**
```bash
dig remote-agent.yourdomain.com
# Should return your server IP
```

**Check firewall:**
```bash
sudo ufw status
# Should allow ports 80 and 443
```

**Check Caddy logs:**
```bash
docker compose -f docker-compose.yml -f docker-compose.cloud.yml logs caddy
# Look for certificate issuance attempts
```

**Common issues:**
- DNS not propagated yet (wait 5-60 minutes)
- Firewall blocking ports 80/443
- Domain typo in Caddyfile
- A record not pointing to correct IP

### App Not Responding

**Check if running:**
```bash
docker compose -f docker-compose.yml -f docker-compose.cloud.yml ps
# Should show 'app' and 'caddy' with state 'Up'
```

**Check health endpoint:**
```bash
curl http://localhost:3000/health
# Tests app directly (bypasses Caddy)
```

**Check logs:**
```bash
docker compose -f docker-compose.yml -f docker-compose.cloud.yml logs -f app
```

### Database Connection Errors

**For remote database:**
```bash
# Test connection from server
psql $DATABASE_URL -c "SELECT 1"
```

**Check environment variable:**
```bash
# View .env (don't share output publicly)
cat .env | grep DATABASE_URL
```

**Run migrations if tables missing:**
```bash
psql $DATABASE_URL < migrations/001_initial_schema.sql
```

### GitHub Webhook Not Working

**Check webhook deliveries:**
1. Go to webhook settings in GitHub
2. Click "Recent Deliveries"
3. Look for error messages

**Verify webhook secret:**
```bash
cat .env | grep WEBHOOK_SECRET
# Must match GitHub webhook configuration
```

**Test webhook endpoint:**
```bash
curl https://remote-agent.yourdomain.com/webhooks/github
# Should return 400 (missing signature) - means endpoint is reachable
```

### Out of Disk Space

**Check disk usage:**
```bash
df -h
docker system df
```

**Clean up Docker:**
```bash
# Remove unused images and containers
docker system prune -a

# Remove unused volumes (caution)
docker volume prune
```
