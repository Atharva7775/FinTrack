import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";

export const settingsRouter = Router();

const VALID_KEYS = [
  "savings_balance",
  "splitwise_key",
  "splitwise_last_sync",
  "splitwise_balances",
  "view_mode",
  "budget_split",
] as const;

/**
 * @openapi
 * /api/settings:
 *   get:
 *     summary: Get all app settings for a user
 *     tags: [Settings]
 *     parameters:
 *       - $ref: '#/components/parameters/userEmail'
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
 *                 view_mode: "personal"
 *                 budget_split: [50, 30, 20]
 *       400:
 *         description: Missing user_email
 *       500:
 *         description: Supabase error
 */
settingsRouter.get("/", async (req: Request, res: Response) => {
  const { user_email } = req.query as Record<string, string>;
  if (!user_email) return res.status(400).json({ error: "user_email is required" });

  try {
    const { data, error } = await getSupabase()
      .from("app_settings")
      .select("key, value")
      .eq("user_email", user_email)
      .in("key", VALID_KEYS as unknown as string[]);
    if (error) throw error;

    const result: Record<string, unknown> = {};
    (data || []).forEach((row) => (result[row.key] = row.value));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/settings:
 *   put:
 *     summary: Upsert one or more app settings for a user
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_email, settings]
 *             properties:
 *               user_email:
 *                 type: string
 *               settings:
 *                 type: object
 *                 description: Key/value pairs to save
 *                 additionalProperties: true
 *                 example:
 *                   savings_balance: 7500
 *                   view_mode: "personal"
 *                   budget_split: [50, 30, 20]
 *     responses:
 *       200:
 *         description: Updated settings
 *       400:
 *         description: Validation error
 *       500:
 *         description: Supabase error
 */
settingsRouter.put("/", async (req: Request, res: Response) => {
  const { user_email, settings } = req.body;
  if (!user_email) return res.status(400).json({ error: "user_email is required" });
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
      user_email,
      value,
      updated_at: now,
    }));

    const { data, error } = await getSupabase()
      .from("app_settings")
      .upsert(rows, { onConflict: "key,user_email" })
      .select("key, value");
    if (error) throw error;
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
