# SCAR Start Instructions

## ⚠️ IMPORTANT: Only Use Docker

**DO NOT run `npm run dev` or `npm start` directly!**

The app should ONLY run via Docker to avoid multiple instance conflicts.

## How to Start

```bash
cd /home/samuel/scar
docker compose --profile with-db up -d
```

## How to Stop

```bash
cd /home/samuel/scar
docker compose --profile with-db down
```

## How to Restart

```bash
cd /home/samuel/scar
docker compose --profile with-db restart
```

## How to View Logs

```bash
# Follow logs
docker compose logs -f app-with-db

# View last 100 lines
docker compose logs --tail=100 app-with-db
```

## How to Rebuild (after code changes)

```bash
cd /home/samuel/scar
docker compose --profile with-db up -d --build
```

## Auto-Start Configuration

Docker daemon is enabled to start on boot: ✅
Containers have `restart: unless-stopped` policy: ✅

**This means:**
- Docker starts automatically when the server boots
- Containers restart automatically if they crash
- Containers restart automatically after reboot
- You must manually stop containers if you don't want them running

## Check Status

```bash
# Check if containers are running
docker compose ps

# Check health
curl http://localhost:3001/health

# Check GitHub webhook endpoint
curl -X POST http://localhost:3001/webhooks/github \
  -H "Content-Type: application/json" -d '{}'
# Should return: {"error":"Missing signature header"}
```

## Troubleshooting

### Kill Native Instances (if they somehow start)

```bash
# Kill all tsx/npm processes for scar
pkill -f "tsx watch src/index.ts"
pkill -f "npm run dev"

# Verify they're gone
ps aux | grep -E "tsx watch|npm run dev" | grep scar
```

### Container Not Starting

```bash
# Check logs for errors
docker compose logs app-with-db

# Rebuild from scratch
docker compose --profile with-db down
docker compose --profile with-db up -d --build
```

### Port Already in Use

```bash
# Find what's using port 3001
lsof -i :3001

# If it's a native instance, kill it (see above)
# If it's the wrong Docker container, stop it:
docker ps -a | grep 3001
docker stop <container-id>
```

## Current Configuration

- **Port**: 3001
- **Database**: PostgreSQL (Docker container)
- **Workspace**: /home/samuel/.archon/workspaces
- **Worktrees**: /home/samuel/.archon/worktrees
- **Restart Policy**: unless-stopped
- **Profile**: with-db

## Production URL

- **Webhook**: https://code.153.se/webhooks/github
- **Bot Mention**: @scar
- **Cloudflare Tunnel**: code.153.se → localhost:3001
