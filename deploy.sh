#!/bin/bash
set -e

# SCAR Manual Deployment Script
# Pulls latest image from GitHub Container Registry and restarts containers

REGISTRY="ghcr.io/gpt153/scar"
TAG="${1:-main}"  # Default to 'main' branch, or use arg: ./deploy.sh v1.0.0

echo "🚀 Deploying SCAR from registry..."
echo "   Registry: $REGISTRY"
echo "   Tag: $TAG"
echo ""

cd /home/samuel/scar

# Pull latest image
echo "📦 Pulling latest image..."
docker pull $REGISTRY:$TAG

# Stop containers
echo "🛑 Stopping containers..."
docker compose --profile with-db down

# Update image reference in docker-compose.yml (if using registry)
# Note: This assumes you've updated docker-compose.yml to use the registry image
# If still using local build, comment this out

# Restart with new image
echo "🔄 Starting containers..."
docker compose --profile with-db up -d

# Wait for startup
echo "⏳ Waiting for services to start..."
sleep 10

# Check health
echo "💚 Running health check..."
if curl -f -s http://localhost:3001/health > /dev/null; then
  echo "✅ Health check passed!"
else
  echo "❌ Health check failed!"
  echo "   Check logs: docker compose --profile with-db logs -f app-with-db"
  exit 1
fi

# Show status
echo ""
echo "📊 Container status:"
docker compose --profile with-db ps

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Useful commands:"
echo "  View logs:    docker compose --profile with-db logs -f app-with-db"
echo "  Check health: curl http://localhost:3001/health"
echo "  Restart:      docker compose --profile with-db restart"
