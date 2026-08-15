import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";

export const onboardingRouter = Router();

/**
 * @openapi
 * /api/onboarding/{user_email}:
 *   get:
 *     summary: Get onboarding status for a user
 *     tags: [Onboarding]
 *     parameters:
 *       - in: path
 *         name: user_email
 *         required: true
 *         schema:
 *           type: string
 *         description: The user's email address
 *     responses:
 *       200:
 *         description: Onboarding record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OnboardingStatus'
 *       404:
 *         description: No onboarding record found
 *       500:
 *         description: Supabase error
 */
onboardingRouter.get("/:user_email", async (req: Request, res: Response) => {
  try {
    const { data, error } = await getSupabase()
      .from("user_onboarding")
      .select("*")
      .eq("user_email", req.params.user_email)
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
 *     summary: Mark onboarding as completed for a user
 *     tags: [Onboarding]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_email]
 *             properties:
 *               user_email:
 *                 type: string
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
 *       400:
 *         description: Missing user_email
 *       500:
 *         description: Supabase error
 */
onboardingRouter.post("/", async (req: Request, res: Response) => {
  const { user_email, has_onboarded = true } = req.body;
  if (!user_email) return res.status(400).json({ error: "user_email is required" });

  try {
    const { data, error } = await getSupabase()
      .from("user_onboarding")
      .upsert(
        {
          user_email,
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
 * /api/onboarding/{user_email}:
 *   delete:
 *     summary: Reset onboarding for a user (forces re-onboarding on next login)
 *     tags: [Onboarding]
 *     parameters:
 *       - in: path
 *         name: user_email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Reset successfully
 *       500:
 *         description: Supabase error
 */
onboardingRouter.delete("/:user_email", async (req: Request, res: Response) => {
  try {
    const { error } = await getSupabase()
      .from("user_onboarding")
      .delete()
      .eq("user_email", req.params.user_email);
    if (error) throw error;
    res.status(204).send();
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});
