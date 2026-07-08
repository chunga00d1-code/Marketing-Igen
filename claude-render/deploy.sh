#!/bin/bash
# Deploy Claude Render Server lên VPS (hoàn toàn độc lập với Hermes)
# Usage: bash deploy.sh [vps_host] [vps_user]

VPS_HOST="${1:-103.90.224.34}"
VPS_USER="${2:-root}"
VPS_ADDR="$VPS_USER@$VPS_HOST"
REMOTE_DIR="/opt/claude-render"

echo "=== Deploy Claude Render Server to $VPS_ADDR ==="

# 1. Tạo thư mục trên VPS
ssh "$VPS_ADDR" "mkdir -p $REMOTE_DIR"

# 2. Copy server.py
echo "[1/4] Copy server.py..."
scp "$(dirname "$0")/server.py" "$VPS_ADDR:$REMOTE_DIR/server.py"

# 3. Cài Python dependencies
echo "[2/4] Install Python deps..."
ssh "$VPS_ADDR" "pip3 install anthropic cloudinary -q && echo 'deps OK'"

# 4. Tạo systemd service để auto-start
echo "[3/4] Setup systemd service..."
ssh "$VPS_ADDR" "cat > /etc/systemd/system/claude-render.service << 'EOF'
[Unit]
Description=Claude Render Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$REMOTE_DIR
Environment=ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
Environment=CLAUDE_RENDER_KEY=${CLAUDE_RENDER_KEY:-igen-render-2024}
Environment=CLAUDE_RENDER_PORT=8644
Environment=CLOUDINARY_CLOUD_NAME=${CLOUDINARY_CLOUD_NAME:-dgaofuhmv}
Environment=CLOUDINARY_API_KEY=${CLOUDINARY_API_KEY}
Environment=CLOUDINARY_API_SECRET=${CLOUDINARY_API_SECRET}
ExecStart=/usr/bin/python3 $REMOTE_DIR/server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable claude-render
systemctl restart claude-render
sleep 2
systemctl status claude-render --no-pager"

# 5. Test health endpoint
echo "[4/4] Test health..."
ssh "$VPS_ADDR" "curl -s http://localhost:8644/health"

echo ""
echo "=== DONE ==="
echo ""
echo "Endpoint công khai từ iGen ERP:"
echo "  POST http://$VPS_HOST:8644/render"
echo "  Header: X-API-Key: igen-render-2024"
echo ""
echo "Env vars cần set trong iGen ERP (.env):"
echo "  CLAUDE_RENDER_VPS_URL=http://$VPS_HOST:8644"
echo "  CLAUDE_RENDER_API_KEY=igen-render-2024"
