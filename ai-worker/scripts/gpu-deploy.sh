#!/bin/bash
set -euo pipefail
#
# Deploy AI Worker on GPU server
# Run this via SSH or let Jenkins trigger it.
# Expects to be run from /data/kero/ai-worker/ on the GPU server.
#

cd /data/kero/ai-worker

echo "=== Deploying AI Worker ==="

docker compose down || true
docker compose up -d --build

echo "Waiting for container to start..."
sleep 10

if docker compose ps | grep -q "Up"; then
    echo "✅ AI Worker is running"
    docker compose ps
else
    echo "❌ AI Worker failed to start"
    docker compose logs --tail=30
    exit 1
fi
