#!/bin/bash
PID=$(pgrep -f "agy-web/server.js" | head -n 1 || true)
if [ -n "$PID" ]; then
    echo "🟢 Antigravity Web UI 守护进程正在运行中 (PID: $PID)"
    curl -s http://127.0.0.1:3000/api/status | python3 -m json.tool 2>/dev/null || true
else
    echo "🔴 Antigravity Web UI 未运行"
fi
