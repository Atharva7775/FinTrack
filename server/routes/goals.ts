import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";
import { requireGoogleAuth, type AuthenticatedRequest } from "../middleware/requireGoogleAuth";

export const goalsRouter = Router();
goalsRouter.use(requireGoogleAuth);

/**
 * @openapi
 * /api/goals:
 *   get:
 *     summary: List all goals for the authenticated user (with contributions)
 *     tags: [Goals]
 *     responses:
 *       200:
 *         description: List of goals
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Goal'
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
goalsRouter.get("/", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const goalsRes = await getSupabase()
      .from("goals")
      .select("*")
      .eq("user_email", userEmail)
      .order("created_at", { ascending: true });
    if (goalsRes.error) throw goalsRes.error;

    const goalIds = (goalsRes.data || []).map((g) => g.id);
    const contribRes = goalIds.length
      ? await getSupabase()
          .from("goal_contributions")
          .select("goal_id, amount, date")
          .in("goal_id", goalIds)
          .order("date", { ascending: false })
      : { data: [], error: null };
    if (contribRes.error) throw contribRes.error;

    const contribMap: Record<string, { goal_id: string; amount: number; date: string }[]> = {};
    (contribRes.data || []).forEach((c) => {
      contribMap[c.goal_id] = [...(contribMap[c.goal_id] ?? []), c];
    });

    const goals = (goalsRes.data || []).map((g) => ({
      ...g,
      contributions: contribMap[g.id] ?? [],
    }));

    res.json(goals);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @openapi
 * /api/goals:
 *   post:
 *     summary: Create or update a goal for the authenticated user
 *     tags: [Goals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Goal'
 *     responses:
 *       200:
 *         description: Created/updated goal
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Goal'
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
goalsRouter.post("/", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const { user_email: _ignoredUserEmail, ...rest } = req.body;

  try {
    const { data, error } = await getSupabase()
      .from("goals")
      .upsert({ ...rest, user_email: userEmail }, { onConflict: "id" })
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
 * /api/goals/{id}:
 *   delete:
 *     summary: Delete a goal (and its contributions) for the authenticated user
 *     tags: [Goals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Deleted successfully
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
goalsRouter.delete("/:id", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    // Only delete contributions belonging to a goal this user actually owns.
    const { data: owned } = await getSupabase()
      .from("goals")
      .select("id")
      .eq("id", req.params.id)
      .eq("user_email", userEmail)
      .maybeSingle();
    if (owned) {
      await getSupabase().from("goal_contributions").delete().eq("goal_id", req.params.id);
    }
    const { error } = await getSupabase()
      .from("goals")
      .delete()
      .eq("id", req.params.id)
      .eq("user_email", userEmail);
    if (error) throw error;
    res.status(204).send();
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @openapi
 * /api/goals/{id}/contributions:
 *   get:
 *     summary: List all contributions for a goal owned by the authenticated user
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
 *       401:
 *         description: Missing or invalid auth
 *       404:
 *         description: Goal not found or not owned by this user
 *       500:
 *         description: Supabase error
 */
/**
 * @openapi
 * /api/goals/bulk-sync:
 *   put:
 *     summary: Replace all of the authenticated user's goals (and their contributions) in one call
 *     description: Used by the web client's debounced full-state sync. Deletes every existing goal and contribution for this user, then inserts the given list — mirrors the previous client-side delete-all/insert-all behavior, now server-side and authenticated.
 *     tags: [Goals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [goals]
 *             properties:
 *               goals:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Goal'
 *     responses:
 *       204:
 *         description: Synced successfully
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
goalsRouter.put("/bulk-sync", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const goals = Array.isArray(req.body?.goals) ? req.body.goals : null;
  if (!goals) return res.status(400).json({ error: "goals array is required" });

  try {
    const { data: existing } = await getSupabase()
      .from("goals")
      .select("id")
      .eq("user_email", userEmail);
    const existingIds = (existing || []).map((g) => g.id);
    if (existingIds.length > 0) {
      await getSupabase().from("goal_contributions").delete().in("goal_id", existingIds);
      const { error: deleteError } = await getSupabase()
        .from("goals")
        .delete()
        .eq("user_email", userEmail);
      if (deleteError) throw deleteError;
    }

    if (goals.length > 0) {
      const goalRows = goals.map((g) => ({
        id: String(g.id),
        user_email: userEmail,
        title: String(g.title),
        target_amount: Number(g.target_amount),
        current_amount: Number(g.current_amount ?? 0),
        deadline: String(g.deadline),
        monthly_contribution: Number(g.monthly_contribution ?? 0),
      }));
      const { error: insertError } = await getSupabase().from("goals").insert(goalRows);
      if (insertError) throw insertError;

      const contributionRows: { goal_id: string; amount: number; date: string }[] = [];
      for (const g of goals) {
        for (const c of g.contributions ?? []) {
          contributionRows.push({ goal_id: String(g.id), amount: Number(c.amount), date: String(c.date) });
        }
      }
      if (contributionRows.length > 0) {
        const { error: contribError } = await getSupabase().from("goal_contributions").insert(contributionRows);
        if (contribError) throw contribError;
      }
    }

    res.status(204).send();
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

goalsRouter.get("/:id/contributions", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const { data: owned } = await getSupabase()
      .from("goals")
      .select("id")
      .eq("id", req.params.id)
      .eq("user_email", userEmail)
      .maybeSingle();
    if (!owned) return res.status(404).json({ error: "Goal not found" });

    const { data, error } = await getSupabase()
      .from("goal_contributions")
      .select("*")
      .eq("goal_id", req.params.id)
      .order("date", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @openapi
 * /api/goals/{id}/contributions:
 *   post:
 *     summary: Add a contribution to a goal owned by the authenticated user
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
 *       401:
 *         description: Missing or invalid auth
 *       404:
 *         description: Goal not found or not owned by this user
 *       500:
 *         description: Supabase error
 */
goalsRouter.post("/:id/contributions", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const { amount, date } = req.body;
  if (!amount || !date) return res.status(400).json({ error: "amount and date are required" });

  try {
    const { data: owned } = await getSupabase()
      .from("goals")
      .select("id")
      .eq("id", req.params.id)
      .eq("user_email", userEmail)
      .maybeSingle();
    if (!owned) return res.status(404).json({ error: "Goal not found" });

    const { data, error } = await getSupabase()
      .from("goal_contributions")
      .insert({ goal_id: req.params.id, amount, date })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});
