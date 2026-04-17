import { FINTRACK_AI_SYSTEM_PROMPT } from "@/lib/aiSystemPrompt";
import type { FinancialSnapshotForAI } from "@/lib/financialSnapshotForAI";

export type AiProvider = "gemini";

/** Thrown when the API returns a transient error that is safe to retry (429, 500, 503). */
export class RetryableError extends Error {
  constructor(
    message: string,
    /** HTTP status from the API */
    public readonly status: number,
    /** Seconds to wait before retrying, if the server sent a Retry-After header */
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "RetryableError";
  }
}

/** Minimal conversational history used by Gemini internally in ScenarioLab. */
type ChatTurn = { role: "user" | "assistant"; content: string };

export async function chatWithGemini(params: {
  snapshot: any;
  historyText: string;
  latestUserQuestion: string;
  apiKey: string;
  attachment?: { name: string; type: string; data: string };
  systemPromptOverride?: string;
}): Promise<string> {
  const { snapshot, historyText, latestUserQuestion, apiKey, attachment, systemPromptOverride } = params;
  const prompt = [
    systemPromptOverride || FINTRACK_AI_SYSTEM_PROMPT,
    "",
    "The following is the user's current FinTrack snapshot (authoritative for this request).",
    "Use it for numbers and trends; the conversation below may reference earlier turns without repeating this data.",
    "",
    JSON.stringify(snapshot, null, 2),
    "",
    "Conversation history:",
    historyText,
    "",
    `User: ${latestUserQuestion}`,
  ].join("\n");

  const parts: any[] = [{ text: prompt }];
  
  if (attachment && attachment.data.startsWith("data:")) {
    // Media attachment (Image/PDF)
    const [header, base64] = attachment.data.split(",");
    const mimeType = header.match(/:(.*?);/)?.[1] || attachment.type;
    parts.push({
      inlineData: {
        mimeType,
        data: base64
      }
    });
  }

  const model = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { 
          temperature: 0.35,
          maxOutputTokens: 8192,
        },
        tools: [{ google_search: {} }],
      }),
    }
  );

  if (!response.ok) {
    const retryableStatuses = [429, 500, 503];
    // Parse Retry-After header if present (value is seconds)
    const retryAfterSec = response.headers.get("Retry-After");
    const retryAfterMs = retryAfterSec ? Number(retryAfterSec) * 1000 : undefined;

    let errMessage = `AI request failed (${response.status}).`;
    try {
      const err = await response.json();
      errMessage = err.error?.message || errMessage;
      console.error("Gemini API Error:", err);
    } catch {
      console.error("Gemini API Error: status", response.status);
    }

    if (retryableStatuses.includes(response.status)) {
      throw new RetryableError(errMessage, response.status, retryAfterMs);
    }
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Invalid or missing Gemini API key. Please check VITE_GEMINI_API_KEY in your .env file."
        : errMessage,
    );
  }
  const json = await response.json();
  const contentParts: string[] =
    json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "") ?? [];
  return (
    contentParts.join("").trim() ||
    "I couldn't generate a detailed answer. Please try rephrasing your question."
  );
}

export function getAiProvider(): AiProvider {
  return "gemini";
}
