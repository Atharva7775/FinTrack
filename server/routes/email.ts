import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";
import { requireGoogleAuth, type AuthenticatedRequest } from "../middleware/requireGoogleAuth";
import { sendWelcomeEmail } from "../email/welcomeEmail";

const emailRouter = Router();
emailRouter.use(requireGoogleAuth);

/**
 * Sends the welcome email the first time (and only the first time) this
 * email address is seen. Reuses `user_onboarding` as the "have we met this
 * user before" registry, since it's already keyed uniquely by user_email —
 * no separate users table needed.
 *
 * The row is only inserted *after* a successful send, not before: if Resend
 * is unreachable or misconfigured, this stays retryable on the next sign-in
 * instead of permanently marking the email as "welcomed" with nothing ever
 * sent. This does leave a narrow window where two near-simultaneous sign-ins
 * could both pass the "not seen yet" check and send two emails — acceptable
 * for a low-stakes, best-effort welcome email on a single-user sign-in event.
 */
emailRouter.post("/welcome", async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).authUser;
  if (!authUser) {
    return res.status(401).json({ error: "Missing authenticated user context" });
  }

  try {
    const { data: existing, error: selectError } = await getSupabase()
      .from("user_onboarding")
      .select("user_email")
      .eq("user_email", authUser.email)
      .maybeSingle();
    if (selectError) throw selectError;

    if (existing) {
      return res.json({ sent: false, reason: "already signed up" });
    }

    await sendWelcomeEmail(authUser.email, authUser.name || authUser.email.split("@")[0]);

    // Best-effort marker so we don't re-send on every future sign-in. If this
    // insert fails (e.g. a genuine race with another request), the email was
    // still sent successfully — that's fine, worst case is one duplicate.
    await getSupabase()
      .from("user_onboarding")
      .insert({ user_email: authUser.email, has_onboarded: false });

    return res.json({ sent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
});

export { emailRouter };
