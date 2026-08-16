import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";
import { requireGoogleAuth, type AuthenticatedRequest } from "../middleware/requireGoogleAuth";

export const settingsRouter = Router();
settingsRouter.use(requireGoogleAuth);

const VALID_KEYS = [
  "savings_balance",
  "budget_split",
  "ai_knowledge_base",
] as const;

/**
 * @openapi
 * /api/settings:
 *   get:
 *     summary: Get all app settings for the authenticated user
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Key/value settings object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *               example:
 *                 savings_balance: 5000
 *                 budget_split: [50, 30, 20]
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
settingsRouter.get("/", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const { data, error } = await getSupabase()
      .from("app_settings")
      .select("key, value")
      .eq("user_email", userEmail)
      .in("key", VALID_KEYS as unknown as string[]);
    if (error) throw error;

    const result: Record<string, unknown> = {};
    (data || []).forEach((row) => (result[row.key] = row.value));
    res.json(result);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @openapi
 * /api/settings:
 *   put:
 *     summary: Upsert one or more app settings for the authenticated user
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [settings]
 *             properties:
 *               settings:
 *                 type: object
 *                 description: Key/value pairs to save
 *                 additionalProperties: true
 *                 example:
 *                   savings_balance: 7500
 *                   budget_split: [50, 30, 20]
 *     responses:
 *       200:
 *         description: Updated settings
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
settingsRouter.put("/", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const { settings } = req.body;
  if (!settings || typeof settings !== "object") {
    return res.status(400).json({ error: "settings object is required" });
  }

  const invalidKeys = Object.keys(settings).filter(
    (k) => !(VALID_KEYS as readonly string[]).includes(k)
  );
  if (invalidKeys.length > 0) {
    return res.status(400).json({ error: `Invalid keys: ${invalidKeys.join(", ")}` });
  }

  try {
    const now = new Date().toISOString();
    const rows = Object.entries(settings).map(([key, value]) => ({
      key,
      user_email: userEmail,
      value,
      updated_at: now,
    }));

    const { data, error } = await getSupabase()
      .from("app_settings")
      .upsert(rows, { onConflict: "key,user_email" })
      .select("key, value");
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});
