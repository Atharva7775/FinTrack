import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";
import { requireGoogleAuth, type AuthenticatedRequest } from "../middleware/requireGoogleAuth";

export const onboardingRouter = Router();
onboardingRouter.use(requireGoogleAuth);

/**
 * @openapi
 * /api/onboarding:
 *   get:
 *     summary: Get onboarding status for the authenticated user
 *     tags: [Onboarding]
 *     responses:
 *       200:
 *         description: Onboarding record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OnboardingStatus'
 *       401:
 *         description: Missing or invalid auth
 *       404:
 *         description: No onboarding record found
 *       500:
 *         description: Supabase error
 */
onboardingRouter.get("/", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const { data, error } = await getSupabase()
      .from("user_onboarding")
      .select("*")
      .eq("user_email", userEmail)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "No onboarding record found" });
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @openapi
 * /api/onboarding:
 *   post:
 *     summary: Mark onboarding as completed (or reset) for the authenticated user
 *     tags: [Onboarding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               has_onboarded:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Updated onboarding record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OnboardingStatus'
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
onboardingRouter.post("/", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const { has_onboarded = true } = req.body;

  try {
    const { data, error } = await getSupabase()
      .from("user_onboarding")
      .upsert(
        {
          user_email: userEmail,
          has_onboarded,
          completed_at: has_onboarded ? new Date().toISOString() : null,
        },
        { onConflict: "user_email" }
      )
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @openapi
 * /api/onboarding:
 *   delete:
 *     summary: Reset onboarding for the authenticated user (forces re-onboarding on next login)
 *     tags: [Onboarding]
 *     responses:
 *       204:
 *         description: Reset successfully
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
onboardingRouter.delete("/", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const { error } = await getSupabase()
      .from("user_onboarding")
      .delete()
      .eq("user_email", userEmail);
    if (error) throw error;
    res.status(204).send();
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});
