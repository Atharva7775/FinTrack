import { getSupabase } from "./supabase";

export interface StoredChatSession {
  id: string;
  name: string;
  createdAt: string;
}

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/** Load all chat sessions for a user, newest first. */
export async function fetchChatSessions(userEmail: string): Promise<StoredChatSession[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .select("id, name, created_at")
    .eq("user_email", userEmail)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("FinTrack: failed to fetch chat sessions", error);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
}

/** Create a new chat session and return its id. */
export async function createChatSession(userEmail: string, name: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .insert({ user_email: userEmail, name })
    .select("id")
    .single();
  if (error) {
    console.error("FinTrack: failed to create chat session", error);
    return null;
  }
  return data?.id ?? null;
}

/** Rename an existing session. */
export async function renameChatSession(sessionId: string, name: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("ai_chat_sessions").update({ name }).eq("id", sessionId);
}

/** Delete a session (cascades to messages via FK). */
export async function deleteChatSession(sessionId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("ai_chat_sessions").delete().eq("id", sessionId);
}

/** Fetch all messages for a session, chronological order. */
export async function fetchSessionMessages(sessionId: string): Promise<StoredChatMessage[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("FinTrack: failed to fetch messages", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    content: r.content,
    createdAt: r.created_at,
  }));
}

/** Persist a single message to a session. */
export async function saveMessage(
  sessionId: string,
  userEmail: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("ai_chat_messages").insert({
    session_id: sessionId,
    user_email: userEmail,
    role,
    content,
  });
}
