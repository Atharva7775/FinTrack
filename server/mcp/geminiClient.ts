function apiKey() {
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
}

function model() {
  return process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || "gemini-2.5-flash";
}

interface GenerateOptions {
  prompt: string;
  temperature: number;
  maxOutputTokens: number;
  /** OpenAPI-flavored schema for structured JSON output. */
  responseSchema?: unknown;
}

/** Minimal server-side Gemini call, no chat history and no tools — used for the Planner and Narrator LLM steps. */
export async function generateWithGemini({ prompt, temperature, maxOutputTokens, responseSchema }: GenerateOptions): Promise<string> {
  const key = apiKey();
  if (!key) {
    throw new Error("Missing GEMINI_API_KEY (or VITE_GEMINI_API_KEY) on the server");
  }

  const generationConfig: Record<string, unknown> = { temperature, maxOutputTokens };
  if (responseSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = responseSchema;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
    }
  );

  if (!response.ok) {
    let detail = `status ${response.status}`;
    try {
      const err = await response.json();
      detail = err?.error?.message || detail;
    } catch {
      // ignore parse failure, keep generic detail
    }
    throw new Error(`Gemini request failed: ${detail}`);
  }

  const json = await response.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? "";
  return text.trim();
}
