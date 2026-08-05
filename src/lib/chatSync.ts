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

interface LocalChatSession extends StoredChatSession {
  userEmail: string;
  messages: StoredChatMessage[];
}

const LOCAL_CHAT_STORAGE_KEY = "fintrack_local_chat_history_v1";

function makeLocalSessionId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readLocalSessions(): LocalChatSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalChatSession[]) : [];
  } catch {
    return [];
  }
}

function writeLocalSessions(sessions: LocalChatSession[]) {
  localStorage.setItem(LOCAL_CHAT_STORAGE_KEY, JSON.stringify(sessions));
}

function upsertLocalSession(session: LocalChatSession) {
  const all = readLocalSessions();
  const idx = all.findIndex((s) => s.id === session.id);
  if (idx >= 0) all[idx] = session;
  else all.unshift(session);
  writeLocalSessions(all);
}

function ensureLocalSession(sessionId: string, userEmail: string, name = "New Chat") {
  const all = readLocalSessions();
  const existing = all.find((s) => s.id === sessionId);
  if (existing) return existing;
  const created: LocalChatSession = {
    id: sessionId,
    userEmail,
    name,
    createdAt: new Date().toISOString(),
    messages: [],
  };
  all.unshift(created);
  writeLocalSessions(all);
  return created;
}

function appendLocalMessage(
  sessionId: string,
  userEmail: string,
  role: "user" | "assistant",
  content: string
) {
  const all = readLocalSessions();
  const idx = all.findIndex((s) => s.id === sessionId);
  const message: StoredChatMessage = {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };

  if (idx >= 0) {
    all[idx].messages.push(message);
  } else {
    all.unshift({
      id: sessionId,
      userEmail,
      name: "New Chat",
      createdAt: new Date().toISOString(),
      messages: [message],
    });
  }

  writeLocalSessions(all);
}

function listLocalSessionsForUser(userEmail: string): StoredChatSession[] {
  return readLocalSessions()
    .filter((s) => s.userEmail === userEmail)
    .map((s) => ({ id: s.id, name: s.name, createdAt: s.createdAt }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function listLocalMessages(sessionId: string): StoredChatMessage[] {
  const found = readLocalSessions().find((s) => s.id === sessionId);
  return found?.messages?.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)) ?? [];
}

/** Load all chat sessions for a user, newest first. */
export async function fetchChatSessions(userEmail: string): Promise<StoredChatSession[]> {
  const localSessions = listLocalSessionsForUser(userEmail);
  const supabase = getSupabase();
  if (!supabase) return localSessions;
  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .select("id, name, created_at")
    .eq("user_email", userEmail)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("FinTrack: failed to fetch chat sessions", error);
    return localSessions;
  }

  const remoteSessions = (data ?? []).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  const merged = new Map<string, StoredChatSession>();
  for (const s of localSessions) merged.set(s.id, s);
  for (const s of remoteSessions) merged.set(s.id, s);
  return Array.from(merged.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Create a new chat session and return its id. */
export async function createChatSession(userEmail: string, name: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) {
    const localId = makeLocalSessionId();
    upsertLocalSession({ id: localId, userEmail, name, createdAt: new Date().toISOString(), messages: [] });
    return localId;
  }

  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .insert({ user_email: userEmail, name })
    .select("id")
    .single();
  if (error) {
    console.error("FinTrack: failed to create chat session", error);
    const localId = makeLocalSessionId();
    upsertLocalSession({ id: localId, userEmail, name, createdAt: new Date().toISOString(), messages: [] });
    return localId;
  }

  const sessionId = data?.id ?? null;
  if (sessionId) {
    // Keep a local mirror so history still appears if subsequent network writes fail.
    ensureLocalSession(sessionId, userEmail, name);
  }
  return sessionId;
}

/** Rename an existing session. */
export async function renameChatSession(sessionId: string, name: string): Promise<void> {
  const all = readLocalSessions();
  const idx = all.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    all[idx].name = name;
    writeLocalSessions(all);
  }

  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("ai_chat_sessions").update({ name }).eq("id", sessionId);
  if (error) {
    console.error("FinTrack: failed to rename chat session", error);
  }
}

/** Delete a session (cascades to messages via FK). */
export async function deleteChatSession(sessionId: string): Promise<void> {
  writeLocalSessions(readLocalSessions().filter((s) => s.id !== sessionId));

  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("ai_chat_sessions").delete().eq("id", sessionId);
  if (error) {
    console.error("FinTrack: failed to delete chat session", error);
  }
}

/** Fetch all messages for a session, chronological order. */
export async function fetchSessionMessages(sessionId: string): Promise<StoredChatMessage[]> {
  const supabase = getSupabase();
  if (!supabase || sessionId.startsWith("local-")) return listLocalMessages(sessionId);

  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("FinTrack: failed to fetch messages", error);
    return listLocalMessages(sessionId);
  }

  const remoteMessages = (data ?? []).map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    content: r.content,
    createdAt: r.created_at,
  }));

  // Merge local + remote for resilience; remote keeps canonical IDs.
  const local = listLocalMessages(sessionId);
  const merged = new Map<string, StoredChatMessage>();
  for (const m of local) merged.set(m.id, m);
  for (const m of remoteMessages) merged.set(m.id, m);
  return Array.from(merged.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Persist a single message to a session. */
export async function saveMessage(
  sessionId: string,
  userEmail: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    appendLocalMessage(sessionId, userEmail, role, content);
    return;
  }

  // Local-only sessions cannot be persisted to UUID FK columns.
  if (sessionId.startsWith("local-")) {
    appendLocalMessage(sessionId, userEmail, role, content);
    return;
  }

  const { error } = await supabase.from("ai_chat_messages").insert({
    session_id: sessionId,
    user_email: userEmail,
    role,
    content,
  });
  if (error) {
    console.error("FinTrack: failed to save chat message", error);
    appendLocalMessage(sessionId, userEmail, role, content);
  }
}
