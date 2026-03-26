/**
 * Minimal HTTP server: proxies chat requests to Ollama.
 * Dev: Vite proxies /api/llm -> this server.
 *
 * Env:
 *   CHAT_SERVER_PORT (default 3001)
 *   CHAT_SERVER_HOST (default 127.0.0.1)
 *   OLLAMA_BASE_URL (default http://127.0.0.1:11434)
 *   OLLAMA_MODEL (default llama3.2)
 *   CHAT_API_SECRET (optional) — if set, require X-Chat-Api-Secret header
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.CHAT_SERVER_PORT || 3001);
const HOST = process.env.CHAT_SERVER_HOST || "127.0.0.1";
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen:4b";
const CHAT_SECRET = process.env.CHAT_API_SECRET || "";
/** Cap output tokens for faster responses on CPU; raise if answers truncate. */
const OLLAMA_NUM_PREDICT = Number(process.env.OLLAMA_NUM_PREDICT || 768);

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS" && req.url?.startsWith("/api/llm")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Chat-Api-Secret",
    });
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/llm/chat") {
    res.writeHead(404).end();
    return;
  }

  if (CHAT_SECRET) {
    const sent = req.headers["x-chat-api-secret"];
    if (sent !== CHAT_SECRET) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  const { messages, systemPrompt, model, ollamaOptions } = body;
  if (!Array.isArray(messages) || typeof systemPrompt !== "string") {
    json(res, 400, { error: "Expected { messages: ChatMessage[], systemPrompt: string, model?: string }" });
    return;
  }

  const ollamaMessages = [{ role: "system", content: systemPrompt }, ...messages];

  const options = {
    temperature: 0.35,
    num_predict: OLLAMA_NUM_PREDICT,
    ...(ollamaOptions && typeof ollamaOptions === "object" ? ollamaOptions : {}),
  };

  const ollamaUrl = `${OLLAMA_BASE}/api/chat`;
  try {
    const ollamaRes = await fetch(ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: false,
        options,
      }),
    });

    const text = await ollamaRes.text();
    if (!ollamaRes.ok) {
      json(res, 502, {
        error: "Ollama request failed",
        detail: text.slice(0, 500),
        status: ollamaRes.status,
      });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      json(res, 502, { error: "Invalid response from Ollama", detail: text.slice(0, 200) });
      return;
    }

    const content =
      parsed?.message?.content?.trim() ||
      parsed?.response?.trim?.() ||
      "";

    json(res, 200, {
      content:
        content ||
        "I couldn't generate a detailed answer. Please try rephrasing your question.",
      model: model || OLLAMA_MODEL,
      id: randomUUID(),
    });
  } catch (e) {
    console.error("[llm-chat-server]", e);
    json(res, 503, {
      error: "Cannot reach Ollama. Is it running? Try: ollama serve",
      detail: String(e?.message || e),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FinTrack LLM chat server listening on http://${HOST}:${PORT}`);
  console.log(`  Ollama: ${OLLAMA_BASE} (model default: ${OLLAMA_MODEL})`);
});
