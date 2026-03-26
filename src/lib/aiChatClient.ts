import { FINTRACK_AI_SYSTEM_PROMPT } from "@/lib/aiSystemPrompt";
import type { FinancialSnapshotForAI } from "@/lib/financialSnapshotForAI";

export type AiProvider = "ollama" | "gemini";

type ChatTurn = { role: "user" | "assistant"; content: string };

/** Single system block: instructions + one copy of user_data (avoids N× duplicate JSON in long chats). */
export function buildOllamaSystemPrompt(snapshot: FinancialSnapshotForAI): string {
  return [
    FINTRACK_AI_SYSTEM_PROMPT,
    "",
    "The following JSON is the user's current FinTrack snapshot (authoritative for this request).",
    "Use it for numbers and trends; the conversation below may reference earlier turns without repeating this data.",
    "",
    JSON.stringify(snapshot),
  ].join("\n");
}

/** Plain conversation turns only — snapshot lives in system prompt, not repeated per user message. */
export function buildOllamaMessages(history: ChatTurn[], latestUserQuestion: string): ChatTurn[] {
  return [...history, { role: "user" as const, content: latestUserQuestion }];
}

export async function chatWithOllama(params: {
  snapshot: FinancialSnapshotForAI;
  history: ChatTurn[];
  latestUserQuestion: string;
  model?: string;
}): Promise<string> {
  const { snapshot, history, latestUserQuestion, model } = params;
  const systemPrompt = buildOllamaSystemPrompt(snapshot);
  const messages = buildOllamaMessages(history, latestUserQuestion);
  const base =
    (import.meta.env.VITE_CHAT_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  const url = `${base}/api/llm/chat`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secret = import.meta.env.VITE_CHAT_API_SECRET as string | undefined;
  if (secret) headers["X-Chat-Api-Secret"] = secret;

  const numPredict = Number(import.meta.env.VITE_OLLAMA_NUM_PREDICT || 0) || undefined;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        systemPrompt,
        model: model || (import.meta.env.VITE_OLLAMA_MODEL as string | undefined),
        ollamaOptions: numPredict
          ? { num_predict: numPredict, temperature: 0.35 }
          : { temperature: 0.35 },
      }),
    });
  } catch {
    throw new Error(
      "Cannot reach the chat API. In dev, open a second terminal and run: npm run server " +
        "(and keep Ollama running: ollama serve). Or set VITE_AI_PROVIDER=gemini with VITE_GEMINI_API_KEY."
    );
  }

  const raw = await res.text();
  let data: { content?: string; error?: string; detail?: string } = {};
  try {
    if (raw) data = JSON.parse(raw) as typeof data;
  } catch {
    // Vite proxy often returns non-JSON when port 3001 is closed (ECONNREFUSED).
  }

  if (!res.ok) {
    if (res.status >= 500 && !data.error) {
      throw new Error(proxyDownHint());
    }
    throw new Error(data.detail || data.error || `Chat server error (${res.status})`);
  }
  if (!data.content) throw new Error("Empty response from chat server");
  return data.content;
}

function proxyDownHint(): string {
  return (
    "The LLM proxy is not running (Vite shows ECONNREFUSED on port 3001). " +
    "Fix: in a separate terminal from `npm run dev`, run `npm run server`. " +
    "Also start Ollama (`ollama serve`) and pull a model (`ollama pull llama3.2`). " +
    "Alternatively use Gemini: VITE_AI_PROVIDER=gemini and VITE_GEMINI_API_KEY in .env."
  );
}

export async function chatWithGemini(params: {
  snapshot: FinancialSnapshotForAI;
  historyText: string;
  latestUserQuestion: string;
  apiKey: string;
}): Promise<string> {
  const { snapshot, historyText, latestUserQuestion, apiKey } = params;
  const prompt = [
    FINTRACK_AI_SYSTEM_PROMPT,
    "",
    `User data (JSON): ${JSON.stringify(snapshot)}`,
    "",
    "Conversation so far:",
    historyText,
    "",
    `User: ${latestUserQuestion}`,
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    }
  );

  if (!response.ok) throw new Error("AI request failed");
  const json = await response.json();
  const contentParts: string[] =
    json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "") ?? [];
  return (
    contentParts.join("").trim() ||
    "I couldn't generate a detailed answer. Please try rephrasing your question."
  );
}

export function getAiProvider(): AiProvider {
  const p = (import.meta.env.VITE_AI_PROVIDER as string | undefined)?.toLowerCase();
  if (p === "gemini") return "gemini";
  return "ollama";
}
