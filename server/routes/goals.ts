import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";

export const goalsRouter = Router();

/**
 * @openapi
 * /api/goals:
 *   get:
 *     summary: List all goals for a user (with contributions)
 *     tags: [Goals]
 *     parameters:
 *       - $ref: '#/components/parameters/userEmail'
 *     responses:
 *       200:
 *         description: List of goals
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Goal'
 *       400:
 *         description: Missing user_email
 *       500:
 *         description: Supabase error
 */
goalsRouter.get("/", async (req: Request, res: Response) => {
  const { user_email } = req.query as Record<string, string>;
  if (!user_email) return res.status(400).json({ error: "user_email is required" });

  try {
    const [goalsRes, contribRes] = await Promise.all([
      getSupabase()
        .from("goals")
        .select("*")
        .eq("user_email", user_email)
        .order("created_at", { ascending: true }),
      getSupabase()
        .from("goal_contributions")
        .select("goal_id, amount, date")
        .order("date", { ascending: false }),
    ]);
    if (goalsRes.error) throw goalsRes.error;
    if (contribRes.error) throw contribRes.error;

    const contribMap: Record<string, any[]> = {};
    (contribRes.data || []).forEach((c) => {
      contribMap[c.goal_id] = [...(contribMap[c.goal_id] ?? []), c];
    });

    const goals = (goalsRes.data || []).map((g) => ({
      ...g,
      contributions: contribMap[g.id] ?? [],
    }));

    res.json(goals);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/goals:
 *   post:
 *     summary: Create or update a goal
 *     tags: [Goals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/Goal'
 *               - type: object
 *                 required: [user_email]
 *                 properties:
 *                   user_email:
 *                     type: string
 *     responses:
 *       200:
 *         description: Created/updated goal
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Goal'
 *       400:
 *         description: Validation error
 *       500:
 *         description: Supabase error
 */
goalsRouter.post("/", async (req: Request, res: Response) => {
  const { user_email, ...rest } = req.body;
  if (!user_email) return res.status(400).json({ error: "user_email is required" });

  try {
    const { data, error } = await getSupabase()
      .from("goals")
      .upsert({ ...rest, user_email }, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/goals/{id}:
 *   delete:
 *     summary: Delete a goal and its contributions
 *     tags: [Goals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - $ref: '#/components/parameters/userEmail'
 *     responses:
 *       204:
 *         description: Deleted successfully
 *       400:
 *         description: Missing user_email
 *       500:
 *         description: Supabase error
 */
goalsRouter.delete("/:id", async (req: Request, res: Response) => {
  const { user_email } = req.query as Record<string, string>;
  if (!user_email) return res.status(400).json({ error: "user_email is required" });

  try {
    // Contributions cascade-delete via FK, but delete explicitly for clarity
    await getSupabase().from("goal_contributions").delete().eq("goal_id", req.params.id);
    const { error } = await getSupabase()
      .from("goals")
      .delete()
      .eq("id", req.params.id)
      .eq("user_email", user_email);
    if (error) throw error;
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/goals/{id}/contributions:
 *   get:
 *     summary: List all contributions for a specific goal
 *     tags: [Goals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Goal ID
 *     responses:
 *       200:
 *         description: List of contributions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/GoalContribution'
 *       500:
 *         description: Supabase error
 */
goalsRouter.get("/:id/contributions", async (req: Request, res: Response) => {
  try {
    const { data, error } = await getSupabase()
      .from("goal_contributions")
      .select("*")
      .eq("goal_id", req.params.id)
      .order("date", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/goals/{id}/contributions:
 *   post:
 *     summary: Add a contribution to a goal
 *     tags: [Goals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Goal ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, date]
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 0
 *               date:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Created contribution
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GoalContribution'
 *       400:
 *         description: Validation error
 *       500:
 *         description: Supabase error
 */
goalsRouter.post("/:id/contributions", async (req: Request, res: Response) => {
  const { amount, date } = req.body;
  if (!amount || !date) return res.status(400).json({ error: "amount and date are required" });

  try {
    const { data, error } = await getSupabase()
      .from("goal_contributions")
      .insert({ goal_id: req.params.id, amount, date })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
