import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";

let _client: SupabaseClient | null = null;

/**
 * Server-side Supabase client, using the service_role key — bypasses RLS
 * entirely. This is the ONLY trusted way into the database now that RLS
 * denies the anon role: every route using this must resolve the row-owning
 * user_email from `requireGoogleAuth`'s verified `authUser.email`, never
 * from a client-supplied field, since nothing downstream will stop it.
 */
export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file"
    );
  }

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}
