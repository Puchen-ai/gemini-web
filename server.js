import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const BRAIN_DIR = "/root/.gemini/antigravity-cli/brain";
const AGY_BIN = fs.existsSync("/root/.local/bin/agy") ? "/root/.local/bin/agy" : "agy";
let currentCwd = process.env.DEFAULT_CWD || "/root";

// Store running child processes by sessionId
const activeProcesses = new Map();

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function cleanUserPrompt(raw) {
  if (!raw) return "";
  const match = raw.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return raw.trim();
}

function getConversationList() {
  if (!fs.existsSync(BRAIN_DIR)) return [];
  try {
    const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
    const convs = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const convId = entry.name;
      const convDir = path.join(BRAIN_DIR, convId);
      const logFile = path.join(convDir, ".system_generated/logs/transcript.jsonl");

      let title = "新会话";
      let updatedAt = 0;
      let messageCount = 0;

      try {
        const stat = fs.statSync(convDir);
        updatedAt = stat.mtimeMs;

        if (fs.existsSync(logFile)) {
          const logStat = fs.statSync(logFile);
          updatedAt = Math.max(updatedAt, logStat.mtimeMs);

          const content = fs.readFileSync(logFile, "utf-8");
          const lines = content.split("\n");
          messageCount = lines.filter(l => l.trim()).length;

          for (const line of lines) {
            if (!line.trim()) continue;
            const item = safeJsonParse(line);
            if (item && item.type === "USER_INPUT" && item.content) {
              const cleaned = cleanUserPrompt(item.content);
              if (cleaned) {
                title = cleaned.slice(0, 40) + (cleaned.length > 40 ? "..." : "");
                break;
              }
            }
          }
        }
      } catch (err) {}

      convs.push({
        id: convId,
        title,
        updatedAt,
        messageCount,
      });
    }

    convs.sort((a, b) => b.updatedAt - a.updatedAt);
    return convs;
  } catch (err) {
    console.error("Error reading conversations:", err);
    return [];
  }
}

function getConversationDetail(convId) {
  const convDir = path.join(BRAIN_DIR, convId);
  const logFile = path.join(convDir, ".system_generated/logs/transcript.jsonl");

  if (!fs.existsSync(logFile)) {
    return { id: convId, messages: [] };
  }

  const rawLines = fs.readFileSync(logFile, "utf-8").split("\n");
  const messages = [];
  let currentAssistantMsg = null;

  for (const line of rawLines) {
    if (!line.trim()) continue;
    const item = safeJsonParse(line);
    if (!item) continue;

    if (item.type === "USER_INPUT") {
      if (currentAssistantMsg) {
        messages.push(currentAssistantMsg);
        currentAssistantMsg = null;
      }
      messages.push({
        role: "user",
        content: cleanUserPrompt(item.content),
        timestamp: item.created_at || new Date().toISOString(),
        stepIndex: item.step_index,
      });
    } else if (item.type === "PLANNER_RESPONSE") {
      if (!currentAssistantMsg) {
        currentAssistantMsg = {
          role: "assistant",
          content: "",
          thinking: "",
          tools: [],
          timestamp: item.created_at || new Date().toISOString(),
          stepIndex: item.step_index,
        };
      }

      if (item.thinking) {
        currentAssistantMsg.thinking = (currentAssistantMsg.thinking + "\n" + item.thinking).trim();
      }

      if (item.content) {
        currentAssistantMsg.content = item.content;
      }

      if (item.tool_calls && Array.isArray(item.tool_calls)) {
        for (const tc of item.tool_calls) {
          let parsedArgs = tc.args;
          if (typeof parsedArgs === "object") {
            const cleanArgs = {};
            for (const [k, v] of Object.entries(parsedArgs)) {
              if (typeof v === "string" && v.startsWith('"') && v.endsWith('"')) {
                try {
                  cleanArgs[k] = JSON.parse(v);
                } catch {
                  cleanArgs[k] = v;
                }
              } else {
                cleanArgs[k] = v;
              }
            }
            parsedArgs = cleanArgs;
          }
          currentAssistantMsg.tools.push({
            name: tc.name,
            parameters: parsedArgs,
            output: "",
            status: "done",
          });
        }
      }
    } else if (item.source === "TOOL" || (item.content && currentAssistantMsg && currentAssistantMsg.tools.length > 0)) {
      if (currentAssistantMsg && currentAssistantMsg.tools.length > 0) {
        const lastTool = currentAssistantMsg.tools[currentAssistantMsg.tools.length - 1];
        if (!lastTool.output && item.content) {
          lastTool.output = item.content;
        }
      }
    }
  }

  if (currentAssistantMsg) {
    messages.push(currentAssistantMsg);
  }

  return { id: convId, messages };
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const host = req.headers.host || "127.0.0.1";
  const url = new URL(req.url, "http://" + host);
  const pathname = url.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Basic Authentication
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Antigravity Web CLI"');
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Authentication required.');
    return;
  }

  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  const USERNAME = process.env.WEB_USERNAME || 'admin';
  const PASSWORD = process.env.WEB_PASSWORD || 'admin123';

  if (user !== USERNAME || pass !== PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Antigravity Web CLI"');
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Invalid credentials.');
    return;
  }

  if (pathname === "/api/status" && req.method === "GET") {
    res.writeHead(200, {
 "Content-Type": "application/json" });
    res.end(JSON.stringify({
      cwd: currentCwd,
      brainDir: BRAIN_DIR,
      activeTasks: activeProcesses.size,
      time: new Date().toISOString(),
    }));
    return;
  }

  if (pathname === "/api/conversations" && req.method === "GET") {
    const list = getConversationList();
    res.writeHead(200, {
 "Content-Type": "application/json" });
    res.end(JSON.stringify({ conversations: list }));
    return;
  }

  if (pathname.startsWith("/api/conversations/") && req.method === "GET") {
    const convId = pathname.replace("/api/conversations/", "").trim();
    if (!convId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing conversation id" }));
      return;
    }
    const data = getConversationDetail(convId);
    res.writeHead(200, {
 "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
    return;
  }

  if (pathname.startsWith("/api/conversations/") && req.method === "DELETE") {
    const convId = pathname.replace("/api/conversations/", "").trim();
    const convDir = path.join(BRAIN_DIR, convId);
    if (fs.existsSync(convDir)) {
      try {
        fs.rmSync(convDir, { recursive: true, force: true });
      } catch (err) {}
    }
    res.writeHead(200, {
 "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, id: convId }));
    return;
  }

  if (pathname === "/api/set-cwd" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      const data = safeJsonParse(body);
      if (data && data.cwd && fs.existsSync(data.cwd)) {
        currentCwd = path.resolve(data.cwd);
        res.writeHead(200, {
 "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, cwd: currentCwd }));
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Directory does not exist" }));
      }
    });
    return;
  }

  if (pathname === "/api/abort" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      const data = safeJsonParse(body);
      const sessionId = data?.sessionId || data?.conversationId;
      if (sessionId && activeProcesses.has(sessionId)) {
        const proc = activeProcesses.get(sessionId);
        try {
          proc.kill("SIGINT");
        } catch (e) {}
        activeProcesses.delete(sessionId);
        res.writeHead(200, {
 "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Process aborted" }));
      } else {
        for (const [id, proc] of activeProcesses.entries()) {
          try {
            proc.kill("SIGINT");
          } catch (e) {}
          activeProcesses.delete(id);
        }
        res.writeHead(200, {
 "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "All active processes stopped" }));
      }
    });
    return;
  }

  if (pathname === "/api/chat" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      const payload = safeJsonParse(body);
      if (!payload || !payload.prompt) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing prompt" }));
        return;
      }

      const prompt = payload.prompt;
      const conversationId = payload.conversationId;
      const runCwd = payload.cwd || currentCwd;
      const sessionId = payload.sessionId || conversationId || ("session_" + Date.now());

      res.writeHead(200, {

        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      res.write(": keep-alive\n\n");

      const args = [];
      if (conversationId) {
        args.push("--conversation", conversationId);
      }
      args.push("-p", prompt);
      args.push("--output-format", "stream-json");
      args.push("--dangerously-skip-permissions");

      if (payload.model) {
        args.push("--model", payload.model);
      }
      if (payload.effort) {
        args.push("--effort", payload.effort);
      }

      console.log("[Chat] Spawning", AGY_BIN, "in", runCwd, "args:", args.join(" "));

      const child = spawn(AGY_BIN, args, {
        cwd: runCwd,
        env: {
          ...process.env,
          PATH: "/root/.local/bin:" + (process.env.PATH || ""),
          PAGER: "cat",
          TERM: "xterm-256color",
        },
      });

      activeProcesses.set(sessionId, child);

      const rl = readline.createInterface({
        input: child.stdout,
        terminal: false,
      });

      rl.on("line", (line) => {
        if (!line.trim()) return;
        const parsed = safeJsonParse(line);
        if (parsed) {
          res.write("data: " + JSON.stringify(parsed) + "\n\n");
        } else {
          res.write("data: " + JSON.stringify({ event: "raw_log", message: line }) + "\n\n");
        }
      });

      child.stderr.on("data", (data) => {
        const errStr = data.toString();
        if (!errStr.includes("warning: conversation")) {
          res.write("data: " + JSON.stringify({ event: "stderr", message: errStr }) + "\n\n");
        }
      });

      child.on("error", (err) => {
        console.error("[Chat] Process error:", err);
        res.write("data: " + JSON.stringify({ event: "error", error: err.message }) + "\n\n");
        res.end();
        activeProcesses.delete(sessionId);
      });

      child.on("close", (code) => {
        console.log("[Chat] agy process exited with code", code);
        res.write("data: " + JSON.stringify({ event: "process_close", exitCode: code }) + "\n\n");
        res.end();
        activeProcesses.delete(sessionId);
      });

      // ONLY abort when client connection is abruptly closed before response ended
      res.on("close", () => {
        if (!res.writableEnded && activeProcesses.has(sessionId)) {
          console.log("[Chat] Client disconnected prematurely, terminating session", sessionId);
          try {
            child.kill("SIGINT");
          } catch (e) {}
          activeProcesses.delete(sessionId);
        }
      });
    });
    return;
  }

  let filePath = path.join(__dirname, "public", pathname === "/" ? "index.html" : pathname);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, "public", "index.html");
  }

  const extname = path.extname(filePath);
  const contentType = MIME_TYPES[extname] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("500 Internal Server Error: " + err.code);
      }
    } else {
      res.writeHead(200, {
 "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log("\n======================================================");
  console.log("🚀 AI Antigravity Web CLI Server is running!");
  console.log("🌐 Local URL:   http://127.0.0.1:" + PORT);
  console.log("🌐 Network URL: http://" + HOST + ":" + PORT);
  console.log("📁 Working Dir: " + currentCwd);
  console.log("📁 Brain Dir:   " + BRAIN_DIR);
  console.log("======================================================\n");
});
