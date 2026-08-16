import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";
import { requireGoogleAuth, type AuthenticatedRequest } from "../middleware/requireGoogleAuth";

export const chatHistoryRouter = Router();
chatHistoryRouter.use(requireGoogleAuth);

function userEmailOf(req: Request): string | null {
  return (req as AuthenticatedRequest).authUser?.email ?? null;
}

/** True if this session exists and belongs to userEmail. */
async function ownsSession(sessionId: string, userEmail: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from("ai_chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_email", userEmail)
    .maybeSingle();
  return !!data;
}

chatHistoryRouter.get("/sessions", async (req: Request, res: Response) => {
  const userEmail = userEmailOf(req);
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const { data, error } = await getSupabase()
      .from("ai_chat_sessions")
      .select("id, name, created_at")
      .eq("user_email", userEmail)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

chatHistoryRouter.post("/sessions", async (req: Request, res: Response) => {
  const userEmail = userEmailOf(req);
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name : "New Chat";

  try {
    const { data, error } = await getSupabase()
      .from("ai_chat_sessions")
      .insert({ user_email: userEmail, name })
      .select("id, name, created_at")
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

chatHistoryRouter.put("/sessions/:id", async (req: Request, res: Response) => {
  const userEmail = userEmailOf(req);
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const name = req.body?.name;
  if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "name is required" });

  try {
    const { error } = await getSupabase()
      .from("ai_chat_sessions")
      .update({ name })
      .eq("id", req.params.id)
      .eq("user_email", userEmail);
    if (error) throw error;
    res.status(204).send();
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

chatHistoryRouter.delete("/sessions/:id", async (req: Request, res: Response) => {
  const userEmail = userEmailOf(req);
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const { error } = await getSupabase()
      .from("ai_chat_sessions")
      .delete()
      .eq("id", req.params.id)
      .eq("user_email", userEmail);
    if (error) throw error;
    res.status(204).send();
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

chatHistoryRouter.get("/sessions/:id/messages", async (req: Request, res: Response) => {
  const userEmail = userEmailOf(req);
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    if (!(await ownsSession(String(req.params.id), userEmail))) {
      return res.status(404).json({ error: "Session not found" });
    }
    const { data, error } = await getSupabase()
      .from("ai_chat_messages")
      .select("id, role, content, created_at")
      .eq("session_id", req.params.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

chatHistoryRouter.post("/sessions/:id/messages", async (req: Request, res: Response) => {
  const userEmail = userEmailOf(req);
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const { role, content } = req.body;
  if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
    return res.status(400).json({ error: "role ('user'|'assistant') and content are required" });
  }

  try {
    if (!(await ownsSession(String(req.params.id), userEmail))) {
      return res.status(404).json({ error: "Session not found" });
    }
    const { data, error } = await getSupabase()
      .from("ai_chat_messages")
      .insert({ session_id: req.params.id, user_email: userEmail, role, content })
      .select("id, role, content, created_at")
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});
