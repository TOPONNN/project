#!/bin/bash
set -euo pipefail
#
# GPU Server Bootstrap — Run ONCE via EC2 Instance Connect
# =========================================================
# This is the one-time setup for a fresh AWS spot instance.
# Everything persistent is stored in /data (EBS volume that survives termination).
#
# USAGE:
#   sudo bash gpu-bootstrap.sh
#
# WHAT IT DOES:
#   1. Stores SSH authorized_keys in /data so they survive spot restarts
#   2. Installs Docker + NVIDIA Container Toolkit if missing
#   3. Copies the boot-restore script to /data/boot-restore.sh
#   4. Installs a systemd service to auto-restore on every boot
#   5. Restores SSH keys immediately so you can SSH in right away
#
# SPOT INSTANCE RECOVERY FLOW:
#   - Spot terminated → new instance launched → /data EBS reattaches
#   - systemd runs /data/boot-restore.sh on boot
#   - SSH keys restored, Docker started, AI worker launched
#   - No manual intervention needed after initial bootstrap
#

echo "=== GPU Server Bootstrap ==="
echo "[$(date)] Starting bootstrap..."

# ─── 1. SSH Keys Setup ───────────────────────────────────────────────────────
echo ">>> Setting up SSH keys in /data..."
mkdir -p /data/ssh-setup

cat > /data/ssh-setup/authorized_keys << 'KEYS'
# Kero GPU access key
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP8sn3VUJzXjubP1JEzuwivXeG4fvt+WQEuzeophnmv3 kero-gpu
# GPU server deploy key
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF3d0pJXqqEZl9PVtLvply0AgZqYnOuOqF1lKrRu2BsC gpu-server
# Jenkins RSA deploy key — add the public key manually:
#   On main server: ssh-keygen -y -f /var/lib/jenkins/.ssh/gpu_key >> /data/ssh-setup/authorized_keys
KEYS

# ─── 2. Copy boot-restore script to /data ────────────────────────────────────
echo ">>> Installing boot-restore script to /data..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/gpu-boot-restore.sh" ]; then
    cp "$SCRIPT_DIR/gpu-boot-restore.sh" /data/boot-restore.sh
else
    # Inline the boot-restore script if source file not available
    cat > /data/boot-restore.sh << 'BOOT_RESTORE'
#!/bin/bash
# GPU Server Boot Restore — runs on EVERY boot via systemd
# Restores SSH keys and starts AI worker after spot instance restart
set -euo pipefail

LOG="/data/boot-restore.log"
echo "[$(date)] Boot restore starting..." >> "$LOG"

# 1. Restore SSH authorized_keys from persistent storage
if [ -f /data/ssh-setup/authorized_keys ]; then
    mkdir -p /home/ubuntu/.ssh
    cp /data/ssh-setup/authorized_keys /home/ubuntu/.ssh/authorized_keys
    chown ubuntu:ubuntu /home/ubuntu/.ssh /home/ubuntu/.ssh/authorized_keys
    chmod 700 /home/ubuntu/.ssh
    chmod 600 /home/ubuntu/.ssh/authorized_keys
    echo "[$(date)] SSH keys restored" >> "$LOG"
else
    echo "[$(date)] WARNING: No SSH keys found at /data/ssh-setup/authorized_keys" >> "$LOG"
fi

# 2. Ensure Docker is running
if command -v docker &>/dev/null; then
    systemctl start docker 2>> "$LOG" || echo "[$(date)] Docker start skipped (may already be running)" >> "$LOG"
    echo "[$(date)] Docker service started" >> "$LOG"
else
    echo "[$(date)] WARNING: Docker not installed, skipping" >> "$LOG"
fi

# 3. Start AI worker if docker-compose file exists
if command -v docker &>/dev/null && [ -f /data/kero/ai-worker/docker-compose.yml ]; then
    cd /data/kero/ai-worker
    docker compose up -d --build 2>> "$LOG" || echo "[$(date)] Docker compose start failed" >> "$LOG"
    echo "[$(date)] AI worker started" >> "$LOG"
else
    echo "[$(date)] AI worker docker-compose.yml not found, skipping" >> "$LOG"
fi

echo "[$(date)] Boot restore complete" >> "$LOG"
BOOT_RESTORE
fi
chmod +x /data/boot-restore.sh

# ─── 3. Install systemd service for auto-restore on boot ─────────────────────
echo ">>> Installing systemd service..."
cat > /etc/systemd/system/gpu-data-restore.service << 'SERVICE'
[Unit]
Description=Restore GPU server config from /data (spot instance recovery)
After=local-fs.target network-online.target
Wants=network-online.target
Before=ssh.service sshd.service docker.service

[Service]
Type=oneshot
ExecStart=/data/boot-restore.sh
RemainAfterExit=yes
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable gpu-data-restore.service
echo ">>> systemd service enabled"

# ─── 4. Install Docker if not present ────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    echo ">>> Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker ubuntu
    echo ">>> Docker installed"
else
    echo ">>> Docker already installed, skipping"
fi

# ─── 5. Install NVIDIA Container Toolkit if not present ──────────────────────
if ! command -v nvidia-container-cli &>/dev/null; then
    echo ">>> Installing NVIDIA Container Toolkit..."
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
        gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
        sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
        tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update && apt-get install -y nvidia-container-toolkit
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
    echo ">>> NVIDIA Container Toolkit installed"
else
    echo ">>> NVIDIA Container Toolkit already installed, skipping"
fi

# ─── 6. Restore SSH keys immediately ─────────────────────────────────────────
echo ">>> Restoring SSH keys..."
mkdir -p /home/ubuntu/.ssh
cp /data/ssh-setup/authorized_keys /home/ubuntu/.ssh/authorized_keys
chown ubuntu:ubuntu /home/ubuntu/.ssh /home/ubuntu/.ssh/authorized_keys
chmod 700 /home/ubuntu/.ssh
chmod 600 /home/ubuntu/.ssh/authorized_keys

# ─── 7. Create project directory if needed ────────────────────────────────────
mkdir -p /data/kero/ai-worker

# ─── Done ─────────────────────────────────────────────────────────────────────
echo "[$(date)] Bootstrap complete" >> /data/bootstrap.log
echo ""
echo "=== Bootstrap Complete ==="
echo ""
echo "Next steps:"
echo "  1. Add Jenkins RSA public key (from main server):"
echo "     ssh-keygen -y -f /var/lib/jenkins/.ssh/gpu_key >> /data/ssh-setup/authorized_keys"
echo "     Then re-run: cp /data/ssh-setup/authorized_keys /home/ubuntu/.ssh/authorized_keys"
echo ""
echo "  2. Test SSH access:"
echo "     ssh -i ~/.ssh/gpu-server ubuntu@43.202.87.219"
echo ""
echo "  3. Deploy AI worker (Jenkins will do this automatically, or manually):"
echo "     rsync ai-worker/ ubuntu@43.202.87.219:/data/kero/ai-worker/"
echo "     ssh ubuntu@43.202.87.219 'cd /data/kero/ai-worker && docker compose up -d --build'"
