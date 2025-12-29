#!/bin/bash
# Workspace Unification Monitoring Script
# Run this periodically to verify all services remain healthy

echo "=== Workspace Unification Health Check ==="
echo "Timestamp: $(date)"
echo ""

# Check SCAR
echo "1. SCAR Service Health:"
curl -s http://localhost:3001/health | jq '.' 2>/dev/null || echo "  ❌ SCAR health check failed"
echo ""

# Check SCAR workspace access
echo "2. SCAR Workspace Access:"
docker exec scar-app-with-db-1 ls /workspace/ > /dev/null 2>&1 && echo "  ✅ Workspace accessible" || echo "  ❌ Workspace not accessible"
docker exec scar-app-with-db-1 ls /home/samuel/po > /dev/null 2>&1 && echo "  ❌ Old PO path still mounted!" || echo "  ✅ Old PO path removed"
docker exec scar-app-with-db-1 ls /home/samuel/odin-health > /dev/null 2>&1 && echo "  ❌ Old odin-health path still mounted!" || echo "  ✅ Old odin-health path removed"
echo ""

# Check Project Orchestrator
echo "3. Project-Orchestrator Health:"
curl -s http://localhost:8001/health | jq '.status' 2>/dev/null || echo "  ❌ PO health check failed"
cd /home/samuel/.archon/workspaces/project-orchestrator && docker compose ps --filter status=running | grep -q backend && echo "  ✅ Backend running" || echo "  ❌ Backend not running"
cd /home/samuel/.archon/workspaces/project-orchestrator && docker compose ps --filter status=running | grep -q frontend && echo "  ✅ Frontend running" || echo "  ❌ Frontend not running"
echo ""

# Check disk space
echo "4. Disk Space:"
df -h / | awk 'NR==2 {print "  Used: " $3 "/" $2 " (" $5 ")"}'
echo ""

# Check for errors in logs (last 5 minutes)
echo "5. Recent Errors in Logs:"
docker logs --since=5m scar-app-with-db-1 2>&1 | grep -i error | tail -3 || echo "  ✅ No errors in SCAR logs"
cd /home/samuel/.archon/workspaces/project-orchestrator && docker compose logs --since=5m 2>&1 | grep -i error | tail -3 || echo "  ✅ No errors in PO logs"
echo ""

echo "=== End of Health Check ==="
