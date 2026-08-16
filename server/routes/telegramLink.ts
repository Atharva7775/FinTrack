import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";
import { requireGoogleAuth, type AuthenticatedRequest } from "../middleware/requireGoogleAuth";

export const telegramLinkRouter = Router();
telegramLinkRouter.use(requireGoogleAuth);

function userEmailOf(req: Request): string | null {
  return (req as AuthenticatedRequest).authUser?.email ?? null;
}

/** Is this user's Telegram account already linked? */
telegramLinkRouter.get("/status", async (req: Request, res: Response) => {
  const userEmail = userEmailOf(req);
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const { data, error } = await getSupabase()
      .from("app_settings")
      .select("key")
      .like("key", "telegram_user_%")
      .eq("user_email", userEmail)
      .limit(1);
    if (error) throw error;
    res.json({ linked: (data ?? []).length > 0 });
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Start a link: creates a pending token the bot-webhook function consumes once the user messages the bot /start <token>. */
telegramLinkRouter.post("/generate", async (req: Request, res: Response) => {
  const userEmail = userEmailOf(req);
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const token = crypto.randomUUID();
    const key = `pending_telegram_link_${token}`;
    const { error } = await getSupabase()
      .from("app_settings")
      .upsert(
        { key, user_email: userEmail, value: userEmail, updated_at: new Date().toISOString() },
        { onConflict: "key,user_email" }
      );
    if (error) throw error;
    res.json({ token });
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Poll a pending token: once the bot consumes (deletes) it, the account is linked. */
telegramLinkRouter.get("/poll/:token", async (req: Request, res: Response) => {
  const userEmail = userEmailOf(req);
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const key = `pending_telegram_link_${req.params.token}`;
    const { data, error } = await getSupabase()
      .from("app_settings")
      .select("key")
      .eq("key", key)
      .eq("user_email", userEmail)
      .maybeSingle();
    if (error) throw error;
    res.json({ linked: !data });
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Unlink this user's Telegram account. */
telegramLinkRouter.delete("/", async (req: Request, res: Response) => {
  const userEmail = userEmailOf(req);
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const { error } = await getSupabase()
      .from("app_settings")
      .delete()
      .like("key", "telegram_user_%")
      .eq("user_email", userEmail);
    if (error) throw error;
    res.status(204).send();
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});
