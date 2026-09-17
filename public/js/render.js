// render.js — UI 渲染器 (Markdown, 代码高亮, 工具调用卡片, 思考链)

// Configure marked with highlight.js
if (window.marked) {
  marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function(code, lang) {
      if (window.hljs && lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (e) {}
      }
      return code;
    }
  });
}

const RenderUtils = {
  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  formatDuration(seconds) {
    if (!seconds && seconds !== 0) return "";
    if (seconds < 1) return (seconds * 1000).toFixed(0) + "ms";
    return seconds.toFixed(2) + "s";
  },

  renderMarkdown(text) {
    if (!text) return "";
    if (window.marked) {
      const html = marked.parse(text);
      return this.enhanceCodeBlocks(html);
    }
    return "<p>" + this.escapeHtml(text).replace(/\n/g, "<br>") + "</p>";
  },

  enhanceCodeBlocks(html) {
    const div = document.createElement("div");
    div.innerHTML = html;

    div.querySelectorAll("pre").forEach(pre => {
      const codeEl = pre.querySelector("code");
      const codeText = codeEl ? codeEl.innerText : pre.innerText;
      
      // Determine language
      let lang = "code";
      if (codeEl && codeEl.className) {
        const match = codeEl.className.match(/language-([a-zA-Z0-9_-]+)/);
        if (match) lang = match[1];
      }

      const header = document.createElement("div");
      header.className = "code-header";
      header.innerHTML = `
        <span class="code-lang">${lang}</span>
        <button class="copy-code-btn" type="button">复制代码</button>
      `;

      const copyBtn = header.querySelector(".copy-code-btn");
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(codeText).then(() => {
          copyBtn.innerText = "已复制 ✓";
          setTimeout(() => (copyBtn.innerText = "复制代码"), 2000);
        });
      };

      pre.parentNode.insertBefore(header, pre);
    });

    return div.innerHTML;
  },

  createThinkingElement(thinkingText, isCollapsed = true) {
    const box = document.createElement("div");
    box.className = `thinking-box ${isCollapsed ? "collapsed" : ""}`;
    box.innerHTML = `
      <div class="thinking-header">
        <div class="thinking-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a8 8 0 0 0-8 8c0 3.1 1.8 5.8 4.4 7.1.4.2.6.6.6 1.1v.8a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-.8c0-.5.2-.9.6-1.1 2.6-1.3 4.4-4 4.4-7.1a8 8 0 0 0-8-8z"/>
          </svg>
          <span>思考过程 (Reasoning Process)</span>
        </div>
        <svg class="thinking-toggle-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="thinking-content">${this.escapeHtml(thinkingText)}</div>
    `;

    box.querySelector(".thinking-header").onclick = () => {
      box.classList.toggle("collapsed");
    };

    return box;
  },

  createToolElement(toolData) {
    const { name, parameters, output, duration_seconds, state } = toolData;
    const isActive = state === "ACTIVE";

    const card = document.createElement("div");
    card.className = `tool-call-card ${isActive ? "active" : "collapsed"}`;
    card.dataset.toolName = name;

    const durationText = this.formatDuration(duration_seconds);

    // Format parameters display
    let paramsDisplay = "";
    if (parameters) {
      if (typeof parameters === "string") {
        paramsDisplay = parameters;
      } else {
        if (name === "run_command" && parameters.CommandLine) {
          paramsDisplay = `$ ${parameters.CommandLine}`;
          if (parameters.Cwd) paramsDisplay = `# cwd: ${parameters.Cwd}\n` + paramsDisplay;
        } else if (name === "view_file" && parameters.AbsolutePath) {
          paramsDisplay = `查看文件: ${parameters.AbsolutePath} (Lines: ${parameters.StartLine || 1} - ${parameters.EndLine || "End"})`;
        } else if (name === "write_to_file" && parameters.TargetFile) {
          paramsDisplay = `写入文件: ${parameters.TargetFile}`;
        } else {
          try {
            paramsDisplay = JSON.stringify(parameters, null, 2);
          } catch {
            paramsDisplay = String(parameters);
          }
        }
      }
    }

    card.innerHTML = `
      <div class="tool-call-header">
        <div class="tool-badge">
          <span class="tool-name-tag">${this.escapeHtml(name)}</span>
          <span class="tool-status-text">${isActive ? "正在执行中..." : "执行完成"}</span>
        </div>
        <div class="tool-meta">
          ${isActive ? '<div class="tool-spinner"></div>' : `<span class="tool-duration">${durationText}</span>`}
          <svg class="tool-toggle-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>
      <div class="tool-body">
        <div class="tool-section-label">调用参数 (Parameters)</div>
        <pre class="tool-params-preview">${this.escapeHtml(paramsDisplay)}</pre>
        ${
          output
            ? `<div class="tool-section-label">执行输出 (Output)</div>
               <pre class="tool-output-preview">${this.escapeHtml(output)}</pre>`
            : ""
        }
      </div>
    `;

    card.querySelector(".tool-call-header").onclick = () => {
      card.classList.toggle("collapsed");
    };

    return card;
  },

  updateToolElement(card, toolData) {
    const { output, duration_seconds, state } = toolData;
    const isActive = state === "ACTIVE";

    card.className = `tool-call-card ${isActive ? "active" : ""}`;
    const statusText = card.querySelector(".tool-status-text");
    if (statusText) statusText.innerText = isActive ? "正在执行中..." : "执行完成";

    const meta = card.querySelector(".tool-meta");
    const durationText = this.formatDuration(duration_seconds);

    if (meta) {
      meta.innerHTML = `
        ${isActive ? '<div class="tool-spinner"></div>' : `<span class="tool-duration">${durationText}</span>`}
        <svg class="tool-toggle-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      `;
    }

    if (output) {
      const toolBody = card.querySelector(".tool-body");
      let outEl = card.querySelector(".tool-output-preview");
      if (!outEl && toolBody) {
        const label = document.createElement("div");
        label.className = "tool-section-label";
        label.innerText = "执行输出 (Output)";
        outEl = document.createElement("pre");
        outEl.className = "tool-output-preview";
        toolBody.appendChild(label);
        toolBody.appendChild(outEl);
      }
      if (outEl) {
        outEl.innerText = output;
      }
    }
  }
};

window.RenderUtils = RenderUtils;
