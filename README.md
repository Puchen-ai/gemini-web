# Antigravity Web UI (网页端 AI 编程助手)

基于本地 **Antigravity CLI (`agy`)** 底层引擎构建的现代化全功能 Web 端。

## 🌟 核心特性

1. **真实 CLI 引擎直连**：
   - 底层原生调用 `agy`，执行参数：`--conversation <id> -p "<prompt>" --output-format stream-json --dangerously-skip-permissions`。
   - 共享同一个 `~/.gemini/antigravity-cli/brain/` 记忆与上下文库，与终端 CLI 历史会话完全互通。

2. **完整复刻 CLI 交互体验**：
   - **流式打字机**：实时输出 Markdown，支持复杂代码高亮、复制、表格与列表渲染。
   - **工具调用卡片（Tool Call Card）**：实时展示 `run_command`、`view_file`、`grep_search`、`write_to_file` 等工具调用的执行参数、耗时及输出内容，支持一键折叠/展开。
   - **思维链展示（Reasoning）**：模型思考过程折叠展示。
   - **统计徽章**：每轮会话实时统计 Token 用量（Input/Output/Thinking）及总耗时。

3. **会话管理与持久化**：
   - 支持新建会话、切换历史会话、删除会话、标题智能摘要与搜索。
   - 页面刷新不丢失聊天记录，直接读取本地持久化日志。

4. **安全与控制**：
   - 支持动态切换当前工作目录（Cwd）。
   - 支持随时“停止执行 (Stop / Abort)”，优雅中断后台命令。

---

## 🚀 启动与管理

所有脚本已内置在 `/root/agy-web` 目录：

```bash
# 1. 启动 Web 服务（后台守护进程常驻）
/root/agy-web/start.sh

# 2. 查看运行状态
/root/agy-web/status.sh

# 3. 查看实时日志
tail -f /root/agy-web/server.log

# 4. 停止 Web 服务
/root/agy-web/stop.sh
```

---

## 🌐 访问方式

### 方式一：浏览器直接访问端口
- 本地访问：`http://127.0.0.1:3000`
- 局域网访问：`http://<服务器内网IP>:3000`

### 方式二：SSH 端口转发（最推荐、免开防火墙端口）
在本地电脑终端执行：
```bash
ssh -L 3000:localhost:3000 root@<服务器IP>
```
然后在本地浏览器打开：`http://localhost:3000` 即可流畅体验！

### 方式三：通过 Nginx 反代（支持绑定域名或外网访问）
在 `/etc/nginx/conf.d/agy-web.conf` 添加：
```nginx
server {
    listen 80;
    server_name your-domain.com; # 或本机IP

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        # 关闭缓冲区以支持实时 SSE 流式输出
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
    }
}
```
执行 `nginx -s reload` 生效。

---

## 📁 项目工程目录

```
/root/agy-web/
├── server.js            # Node.js 核心后端（REST API + SSE 实时流式管道）
├── daemon.py            # Unix 双 Fork 守护进程启动脚本
├── start.sh             # 一键启动脚本
├── stop.sh              # 一键停止脚本
├── status.sh            # 状态检查脚本
├── server.log           # 运行日志
└── public/              # 前端单页应用（SPA）
    ├── index.html       # 现代暗黑极客风格界面
    ├── css/
    │   └── style.css    # 科技感深色主题、工具调用卡片动效
    ├── js/
    │   ├── render.js    # Markdown、代码高亮、工具卡片渲染器
    │   ├── sse.js       # SSE 数据流精准解析器
    │   └── app.js       # 前端交互与多会话状态控制器
    └── libs/            # 本地离线静态依赖 (marked, highlight.js)
```
