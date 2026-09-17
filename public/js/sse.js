// sse.js — SSE 流式事件解析器

class ChatStreamClient {
  constructor() {
    this.abortController = null;
  }

  async sendChat({ prompt, conversationId, cwd, model, effort, onInit, onStepUpdate, onResult, onError, onClose }) {
    this.abortController = new AbortController();
    const sessionId = "sess_" + Date.now();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          conversationId,
          cwd,
          model,
          effort,
          sessionId,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue; // skip keep-alive comments

          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              this.handleEvent(data, { onInit, onStepUpdate, onResult, onError });
            } catch (err) {
              console.warn("Failed to parse SSE JSON line:", jsonStr, err);
            }
          }
        }
      }

      if (onClose) onClose();
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Chat stream aborted by user.");
      } else {
        console.error("Chat stream error:", err);
        if (onError) onError(err);
      }
      if (onClose) onClose();
    } finally {
      this.abortController = null;
    }
  }

  handleEvent(data, { onInit, onStepUpdate, onResult, onError }) {
    if (data.event === "init") {
      if (onInit) onInit(data.conversation_id, data.init);
    } else if (data.event === "step_update" && data.step_update) {
      if (onStepUpdate) onStepUpdate(data.step_update);
    } else if (data.event === "result" && data.result) {
      if (onResult) onResult(data.result);
    } else if (data.event === "error") {
      if (onError) onError(new Error(data.error));
    }
  }

  async abort(conversationId) {
    if (this.abortController) {
      this.abortController.abort();
    }
    try {
      await fetch("/api/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
    } catch (e) {
      console.warn("Abort fetch error:", e);
    }
  }
}

window.ChatStreamClient = ChatStreamClient;
