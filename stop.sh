#!/bin/bash
PORT=${PORT:-3000}
fuser -k ${PORT}/tcp 2>/dev/null || true
pkill -f "agy-web/server.js" 2>/dev/null || true
echo "🛑 Antigravity Web UI 守护进程已安全停止"
