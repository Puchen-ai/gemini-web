#!/bin/bash
cd /root/agy-web
PORT=${PORT:-3000}

# 释放旧端口和旧进程
fuser -k ${PORT}/tcp 2>/dev/null || true
pkill -f "agy-web/server.js" 2>/dev/null || true
sleep 1

# 以双Fork守护进程启动
python3 /root/agy-web/daemon.py
sleep 1

PID=$(pgrep -f "agy-web/server.js" | head -n 1 || true)
if [ -n "$PID" ]; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -z "$LOCAL_IP" ] && LOCAL_IP="127.0.0.1"
    echo "=========================================================="
    echo "🎉 Antigravity Web UI 守护进程已成功启动！"
    echo "🆔 守护进程 PID: $PID"
    echo "🌐 本地访问地址: http://127.0.0.1:$PORT"
    echo "🌐 局域/公网地址: http://${LOCAL_IP}:$PORT"
    echo "📁 默认工作空间: /root"
    echo "📄 查看实时日志: tail -f /root/agy-web/server.log"
    echo "🛑 停止服务命令: /root/agy-web/stop.sh"
    echo "=========================================================="
else
    echo "❌ 启动失败，请检查日志: cat /root/agy-web/server.log"
fi
