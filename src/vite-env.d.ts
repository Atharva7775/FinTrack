/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** ollama (default) | gemini */
  readonly VITE_AI_PROVIDER?: string;
  /** Base URL for chat API (e.g. https://api.example.com). Empty = same-origin /api/llm */
  readonly VITE_CHAT_API_URL?: string;
  readonly VITE_OLLAMA_MODEL?: string;
  /** Max new tokens from Ollama per reply (lower = faster). Server default 768 if unset. */
  readonly VITE_OLLAMA_NUM_PREDICT?: string;
  readonly VITE_CHAT_API_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
