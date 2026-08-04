import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env file"
    );
  }

  _client = createClient(url, key);
  return _client;
}
