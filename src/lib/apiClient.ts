const API_BASE_URL = (import.meta.env.VITE_CHAT_API_URL || "http://localhost:3001").replace(/\/$/, "");

/** Thrown when a server call is attempted without a verified Google ID token. */
export class ApiAuthError extends Error {
  constructor() {
    super("Signed in without a verified Google session — this can't sync to the server.");
    this.name = "ApiAuthError";
  }
}

/**
 * Authenticated fetch against FinTrack's Express API. Every write now goes
 * through the server (which uses the Supabase service_role key), never
 * straight to Supabase from the browser — see server/routes/*.ts, all
 * gated by requireGoogleAuth and scoped to the token's verified email.
 */
export async function apiFetch<T>(path: string, idToken: string | null, init: RequestInit = {}): Promise<T> {
  if (!idToken) {
    throw new ApiAuthError();
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = String(body.error);
    } catch {
      // ignore parse failure, keep generic message
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
