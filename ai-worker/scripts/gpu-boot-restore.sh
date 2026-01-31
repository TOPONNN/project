#!/bin/bash
set -euo pipefail
#
# GPU Server Boot Restore — runs on EVERY boot via systemd
# Restores SSH keys, starts Docker, and launches the AI worker
# after a spot instance restart where /data (EBS) survived but
# the root filesystem was wiped.
#
# Installed to: /data/boot-restore.sh (by gpu-bootstrap.sh)
# Triggered by: gpu-data-restore.service (systemd, on boot)
#

LOG="/data/boot-restore.log"
echo "[$(date)] Boot restore starting..." >> "$LOG"

# Restore SSH authorized_keys from persistent EBS storage
if [ -f /data/ssh-setup/authorized_keys ]; then
    mkdir -p /home/ubuntu/.ssh
    cp /data/ssh-setup/authorized_keys /home/ubuntu/.ssh/authorized_keys
    chown ubuntu:ubuntu /home/ubuntu/.ssh /home/ubuntu/.ssh/authorized_keys
    chmod 700 /home/ubuntu/.ssh
    chmod 600 /home/ubuntu/.ssh/authorized_keys
    echo "[$(date)] SSH keys restored" >> "$LOG"
else
    echo "[$(date)] WARNING: /data/ssh-setup/authorized_keys not found" >> "$LOG"
fi

# Ensure Docker daemon is running
if command -v docker &>/dev/null; then
    systemctl start docker 2>> "$LOG" || echo "[$(date)] Docker start skipped (may already be running)" >> "$LOG"
    echo "[$(date)] Docker service ensured" >> "$LOG"
else
    echo "[$(date)] WARNING: Docker not installed" >> "$LOG"
fi

# Start AI worker if compose file exists on persistent volume
if command -v docker &>/dev/null && [ -f /data/kero/ai-worker/docker-compose.yml ]; then
    cd /data/kero/ai-worker
    docker compose up -d --build 2>> "$LOG" || echo "[$(date)] Docker compose start failed" >> "$LOG"
    echo "[$(date)] AI worker started" >> "$LOG"
else
    echo "[$(date)] AI worker not deployed yet, skipping" >> "$LOG"
fi

echo "[$(date)] Boot restore complete" >> "$LOG"
