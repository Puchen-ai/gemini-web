// app.js — 核心前端控制器

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const sessionListEl = document.getElementById("sessionList");
  const messageListEl = document.getElementById("messageList");
  const chatContainerEl = document.getElementById("chatContainer");
  const welcomeScreenEl = document.getElementById("welcomeScreen");
  const promptInput = document.getElementById("promptInput");
  const sendBtn = document.getElementById("sendBtn");
  const abortBtn = document.getElementById("abortBtn");
  const newChatBtn = document.getElementById("newChatBtn");
  const clearChatBtn = document.getElementById("clearChatBtn");
  const chatTitleEl = document.getElementById("chatTitle");
  const chatConvIdEl = document.getElementById("chatConvId");
  const searchInput = document.getElementById("searchInput");
  const cwdBadge = document.getElementById("cwdBadge");
  const cwdText = document.getElementById("cwdText");
  const cwdModal = document.getElementById("cwdModal");
  const newCwdInput = document.getElementById("newCwdInput");
  const saveCwdModal = document.getElementById("saveCwdModal");
  const cancelCwdModal = document.getElementById("cancelCwdModal");
  const closeCwdModal = document.getElementById("closeCwdModal");
  const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
  const sidebar = document.getElementById("sidebar");
  const effortSelect = document.getElementById("effortSelect");

  // State
  let currentConversationId = null;
  let isGenerating = false;
  let allConversations = [];
  let currentAssistantNode = null;
  let activeToolCards = new Map(); // step_index -> DOM element

  const chatClient = new ChatStreamClient();

  // Theme Management
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const themeIconSun = document.getElementById("themeIconSun");
  const themeIconMoon = document.getElementById("themeIconMoon");

  // Initialize
  initTheme();
  initApp();

  function initTheme() {
    const saved = localStorage.getItem("agy_theme") || "light";
    setTheme(saved);
  }

  function setTheme(theme) {
    if (theme === "dark") {
      document.body.classList.remove("light-theme");
      document.body.classList.add("dark-theme");
      if (themeIconSun) themeIconSun.style.display = "block";
      if (themeIconMoon) themeIconMoon.style.display = "none";
      updateHljsTheme("/libs/atom-one-dark.min.css");
    } else {
      document.body.classList.remove("dark-theme");
      document.body.classList.add("light-theme");
      if (themeIconSun) themeIconSun.style.display = "none";
      if (themeIconMoon) themeIconMoon.style.display = "block";
      updateHljsTheme("/libs/github.min.css");
    }
    localStorage.setItem("agy_theme", theme);
  }

  function updateHljsTheme(href) {
    let link = document.querySelector('link[href*="highlight"], link[href*="atom-one"], link[href*="github"]');
    if (link) {
      link.href = href;
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const isDark = document.body.classList.contains("dark-theme");
      setTheme(isDark ? "light" : "dark");
    });
  }
  initTheme();

  async function initApp() {
    await fetchStatus();
    await loadConversations();
    setupEventListeners();
  }

  // --- API Calls ---

  async function fetchStatus() {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        if (data.cwd) {
          cwdText.innerText = data.cwd;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch status:", err);
    }
  }

  async function loadConversations() {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        allConversations = data.conversations || [];
        renderSessionList(allConversations);
      }
    } catch (err) {
      sessionListEl.innerHTML = `<div class="loading-placeholder">加载历史会话失败</div>`;
    }
  }

  async function selectConversation(convId) {
    if (isGenerating) return;
    currentConversationId = convId;
    renderSessionList(allConversations);

    chatConvIdEl.innerText = convId.slice(0, 8) + "...";
    messageListEl.innerHTML = "";
    welcomeScreenEl.style.display = "none";

    try {
      const res = await fetch(`/api/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        const conv = allConversations.find(c => c.id === convId);
        chatTitleEl.innerText = conv ? conv.title : "历史会话";

        if (data.messages && data.messages.length > 0) {
          for (const msg of data.messages) {
            if (msg.role === "user") {
              appendUserMessage(msg.content);
            } else if (msg.role === "assistant") {
              appendAssistantHistoryMessage(msg);
            }
          }
          scrollToBottom();
        } else {
          welcomeScreenEl.style.display = "flex";
        }
      }
    } catch (err) {
      console.error("Failed to load conversation details:", err);
    }
  }

  function startNewChat() {
    if (isGenerating) return;
    currentConversationId = null;
    chatTitleEl.innerText = "新会话";
    chatConvIdEl.innerText = "未连接会话";
    messageListEl.innerHTML = "";
    welcomeScreenEl.style.display = "flex";
    promptInput.value = "";
    promptInput.focus();
    renderSessionList(allConversations);
  }

  async function deleteConversation(e, convId) {
    e.stopPropagation();
    if (!confirm("确定要删除这个会话记录吗？")) return;

    try {
      const res = await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
      if (res.ok) {
        allConversations = allConversations.filter(c => c.id !== convId);
        if (currentConversationId === convId) {
          startNewChat();
        } else {
          renderSessionList(allConversations);
        }
      }
    } catch (err) {
      alert("删除失败");
    }
  }

  // --- Rendering Functions ---

  function renderSessionList(list) {
    if (list.length === 0) {
      sessionListEl.innerHTML = `<div class="loading-placeholder">暂无历史会话</div>`;
      return;
    }

    sessionListEl.innerHTML = "";
    list.forEach(conv => {
      const item = document.createElement("div");
      item.className = `session-item ${conv.id === currentConversationId ? "active" : ""}`;
      item.title = conv.title;
      item.innerHTML = `
        <span class="session-title">${RenderUtils.escapeHtml(conv.title)}</span>
        <button class="session-delete-btn" title="删除会话">&times;</button>
      `;

      item.onclick = () => selectConversation(conv.id);
      const delBtn = item.querySelector(".session-delete-btn");
      delBtn.onclick = (e) => deleteConversation(e, conv.id);

      sessionListEl.appendChild(item);
    });
  }

  function appendUserMessage(text) {
    welcomeScreenEl.style.display = "none";
    const wrapper = document.createElement("div");
    wrapper.className = "message-item user-message-wrapper";
    wrapper.innerHTML = `
      <div class="user-message-bubble">${RenderUtils.escapeHtml(text)}</div>
    `;
    messageListEl.appendChild(wrapper);
    scrollToBottom();
  }

  function appendAssistantHistoryMessage(msg) {
    const wrapper = document.createElement("div");
    wrapper.className = "message-item assistant-message-wrapper";

    let html = `
      <div class="assistant-header">
        <div class="assistant-avatar">AG</div>
        <span class="assistant-name">Antigravity AI</span>
      </div>
    `;

    wrapper.innerHTML = html;

    // Thinking process
    if (msg.thinking) {
      const thinkingBox = RenderUtils.createThinkingElement(msg.thinking, true);
      wrapper.appendChild(thinkingBox);
    }

    // Tools
    if (msg.tools && msg.tools.length > 0) {
      const toolsContainer = document.createElement("div");
      toolsContainer.className = "tools-container";
      msg.tools.forEach(t => {
        const toolEl = RenderUtils.createToolElement({
          name: t.name,
          parameters: t.parameters,
          output: t.output,
          duration_seconds: t.duration || 0,
          state: "DONE"
        });
        toolsContainer.appendChild(toolEl);
      });
      wrapper.appendChild(toolsContainer);
    }

    // Markdown content
    if (msg.content) {
      const mdEl = document.createElement("div");
      mdEl.className = "markdown-body";
      mdEl.innerHTML = RenderUtils.renderMarkdown(msg.content);
      wrapper.appendChild(mdEl);
    }

    messageListEl.appendChild(wrapper);
  }

  function createLiveAssistantNode() {
    welcomeScreenEl.style.display = "none";
    const wrapper = document.createElement("div");
    wrapper.className = "message-item assistant-message-wrapper";

    wrapper.innerHTML = `
      <div class="assistant-header">
        <div class="assistant-avatar">AG</div>
        <span class="assistant-name">Antigravity AI</span>
      </div>
      <div class="thinking-container"></div>
      <div class="tools-container"></div>
      <div class="markdown-body">
        <span class="typing-cursor"></span>
      </div>
      <div class="usage-container"></div>
    `;

    messageListEl.appendChild(wrapper);
    scrollToBottom();

    return {
      wrapper,
      thinkingContainer: wrapper.querySelector(".thinking-container"),
      toolsContainer: wrapper.querySelector(".tools-container"),
      markdownBody: wrapper.querySelector(".markdown-body"),
      usageContainer: wrapper.querySelector(".usage-container"),
      rawText: "",
      rawThinking: "",
      thinkingBox: null,
    };
  }

  function scrollToBottom() {
    chatContainerEl.scrollTop = chatContainerEl.scrollHeight;
  }

  // --- Send & Abort Workflow ---

  async function handleSend() {
    const prompt = promptInput.value.trim();
    if (!prompt || isGenerating) return;

    // Reset input
    promptInput.value = "";
    autoResizeTextarea();
    sendBtn.disabled = true;
    setGeneratingState(true);

    // Render User Message
    appendUserMessage(prompt);

    // If first message in new session, temporary title
    if (!currentConversationId) {
      chatTitleEl.innerText = prompt.slice(0, 30) + (prompt.length > 30 ? "..." : "");
    }

    // Prepare Live Assistant Node
    currentAssistantNode = createLiveAssistantNode();
    activeToolCards.clear();

    await chatClient.sendChat({
      prompt,
      conversationId: currentConversationId,
      cwd: cwdText.innerText,
      effort: effortSelect ? effortSelect.value : "low",
      onInit: (convId, initData) => {
        if (!currentConversationId) {
          currentConversationId = convId;
          chatConvIdEl.innerText = convId.slice(0, 8) + "...";
        }
      },
      onStepUpdate: (step) => {
        handleStepUpdate(step);
      },
      onResult: (result) => {
        handleResult(result);
      },
      onError: (err) => {
        const errorEl = document.createElement("div");
        errorEl.style.color = "var(--accent-red)";
        errorEl.style.fontSize = "13px";
        errorEl.style.marginTop = "8px";
        errorEl.innerText = `执行异常: ${err.message}`;
        currentAssistantNode.wrapper.appendChild(errorEl);
      },
      onClose: () => {
        setGeneratingState(false);
        loadConversations(); // refresh list
      }
    });
  }

  
  let isRenderPending = false;
  function scheduleStreamRender() {
    if (isRenderPending) return;
    isRenderPending = true;
    requestAnimationFrame(() => {
      isRenderPending = false;
      if (currentAssistantNode) {
        currentAssistantNode.markdownBody.innerHTML = RenderUtils.renderMarkdown(currentAssistantNode.rawText) + '<span class="typing-cursor"></span>';
        scrollToBottom();
      }
    });
  }

  function handleStepUpdate(step) {
    if (!currentAssistantNode) return;

    // 1. Tool Call
    if (step.step_type === "tool") {
      const stepIndex = step.step_index;
      let card = activeToolCards.get(stepIndex);

      if (!card) {
        card = RenderUtils.createToolElement({
          name: step.tool_name || (step.tool_info && step.tool_info.name) || "tool",
          parameters: step.tool_info ? step.tool_info.parameters : null,
          output: step.tool_info ? step.tool_info.output : "",
          duration_seconds: step.duration_seconds || 0,
          state: step.state,
        });
        currentAssistantNode.toolsContainer.appendChild(card);
        activeToolCards.set(stepIndex, card);
      } else {
        RenderUtils.updateToolElement(card, {
          output: step.tool_info ? step.tool_info.output : "",
          duration_seconds: step.duration_seconds || 0,
          state: step.state,
        });
      }
      scrollToBottom();
    }

    // 2. Agent Response (Streaming Text with rAF Throttled Rendering)
    if (step.step_type === "agent_response") {
      if (step.text_delta) {
        currentAssistantNode.rawText += step.text_delta;
        scheduleStreamRender();
      }

      if (step.state === "DONE") {
        // Remove typing cursor
        const cursor = currentAssistantNode.markdownBody.querySelector(".typing-cursor");
        if (cursor) cursor.remove();

        // Render Usage
        if (step.usage) {
          const u = step.usage;
          currentAssistantNode.usageContainer.innerHTML = `
            <div class="usage-badge">
              <span>Tokens: In ${u.input_tokens || 0} / Out ${u.output_tokens || 0}</span>
              ${u.thinking_tokens ? `<span>Thinking: ${u.thinking_tokens}</span>` : ""}
              ${step.duration_seconds ? `<span>耗时: ${step.duration_seconds.toFixed(2)}s</span>` : ""}
            </div>
          `;
        }
      }
    }
  }

  function handleResult(result) {
    if (!currentAssistantNode) return;
    const cursor = currentAssistantNode.markdownBody.querySelector(".typing-cursor");
    if (cursor) cursor.remove();

    if (result.response && !currentAssistantNode.rawText) {
      currentAssistantNode.markdownBody.innerHTML = RenderUtils.renderMarkdown(result.response);
    }
  }

  function setGeneratingState(generating) {
    isGenerating = generating;
    if (generating) {
      sendBtn.style.display = "none";
      abortBtn.style.display = "inline-flex";
    } else {
      sendBtn.style.display = "inline-flex";
      abortBtn.style.display = "none";
      sendBtn.disabled = promptInput.value.trim().length === 0;
    }
  }

  // --- Event Listeners ---

  function setupEventListeners() {
    // Input auto-resize and send on Enter
    promptInput.addEventListener("input", () => {
      autoResizeTextarea();
      sendBtn.disabled = promptInput.value.trim().length === 0 || isGenerating;
    });

    promptInput.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if ((e.key === "Enter" || e.keyCode === 13) && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    sendBtn.addEventListener("click", handleSend);

    abortBtn.addEventListener("click", () => {
      chatClient.abort(currentConversationId);
      setGeneratingState(false);
    });

    newChatBtn.addEventListener("click", startNewChat);

    clearChatBtn.addEventListener("click", () => {
      if (confirm("清空当前聊天界面？")) {
        messageListEl.innerHTML = "";
        welcomeScreenEl.style.display = "flex";
      }
    });

    // Quick prompts
    document.querySelectorAll(".quick-prompt-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const prompt = btn.dataset.prompt;
        if (prompt) {
          promptInput.value = prompt;
          handleSend();
        }
      });
    });

    // Search input
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderSessionList(allConversations);
      } else {
        const filtered = allConversations.filter(c => c.title.toLowerCase().includes(q));
        renderSessionList(filtered);
      }
    });

    // CWD modal
    cwdBadge.addEventListener("click", () => {
      newCwdInput.value = cwdText.innerText;
      cwdModal.style.display = "flex";
    });

    cancelCwdModal.addEventListener("click", () => (cwdModal.style.display = "none"));
    closeCwdModal.addEventListener("click", () => (cwdModal.style.display = "none"));

    saveCwdModal.addEventListener("click", async () => {
      const targetCwd = newCwdInput.value.trim();
      if (!targetCwd) return;

      try {
        const res = await fetch("/api/set-cwd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cwd: targetCwd })
        });
        if (res.ok) {
          const data = await res.json();
          cwdText.innerText = data.cwd;
          cwdModal.style.display = "none";
        } else {
          const err = await res.json();
          alert(err.error || "路径无效");
        }
      } catch (e) {
        alert("网络请求失败");
      }
    });

    // Mobile sidebar toggle
    if (toggleSidebarBtn) {
      toggleSidebarBtn.addEventListener("click", () => {
        sidebar.classList.toggle("open");
      });
    }

    // Keyboard shortcut Ctrl+K / Cmd+K for new chat
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        startNewChat();
      }
    });
  }

  function autoResizeTextarea() {
    promptInput.style.height = "auto";
    promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + "px";
  }
});
