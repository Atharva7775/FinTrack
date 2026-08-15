import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";

export const budgetsRouter = Router();

/**
 * @openapi
 * /api/budgets:
 *   get:
 *     summary: List budgets for a user, optionally filtered by month
 *     tags: [Budgets]
 *     parameters:
 *       - $ref: '#/components/parameters/userEmail'
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *           example: '2026-04'
 *         description: Filter by YYYY-MM month
 *     responses:
 *       200:
 *         description: List of budgets
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Budget'
 *       400:
 *         description: Missing user_email
 *       500:
 *         description: Supabase error
 */
budgetsRouter.get("/", async (req: Request, res: Response) => {
  const { user_email, month } = req.query as Record<string, string>;
  if (!user_email) return res.status(400).json({ error: "user_email is required" });

  try {
    let query = getSupabase()
      .from("budgets")
      .select("*")
      .eq("user_email", user_email)
      .order("created_at", { ascending: true });

    if (month) query = query.eq("month", month);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @openapi
 * /api/budgets:
 *   post:
 *     summary: Create or update a budget (upsert by user_email + category + month)
 *     tags: [Budgets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/Budget'
 *               - type: object
 *                 required: [user_email]
 *                 properties:
 *                   user_email:
 *                     type: string
 *     responses:
 *       200:
 *         description: Created/updated budget
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Budget'
 *       400:
 *         description: Validation error
 *       500:
 *         description: Supabase error
 */
budgetsRouter.post("/", async (req: Request, res: Response) => {
  const { user_email, ...rest } = req.body;
  if (!user_email) return res.status(400).json({ error: "user_email is required" });
  if (!rest.category || !rest.month || !rest.type) {
    return res.status(400).json({ error: "category, month, and type are required" });
  }

  try {
    const { data, error } = await getSupabase()
      .from("budgets")
      .upsert(
        { ...rest, user_email, updated_at: new Date().toISOString() },
        { onConflict: "user_email,category,month" }
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
 * /api/budgets/{id}:
 *   delete:
 *     summary: Delete a budget by ID
 *     tags: [Budgets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted successfully
 *       500:
 *         description: Supabase error
 */
budgetsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { error } = await getSupabase()
      .from("budgets")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @openapi
 * /api/budgets/snapshots:
 *   get:
 *     summary: List monthly budget snapshots for a user
 *     tags: [Budgets]
 *     parameters:
 *       - $ref: '#/components/parameters/userEmail'
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: '2026-03'
 *         description: Filter by YYYY-MM month
 *     responses:
 *       200:
 *         description: List of snapshots
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BudgetSnapshot'
 *       400:
 *         description: Missing user_email
 *       500:
 *         description: Supabase error
 */
budgetsRouter.get("/snapshots", async (req: Request, res: Response) => {
  const { user_email, month } = req.query as Record<string, string>;
  if (!user_email) return res.status(400).json({ error: "user_email is required" });

  try {
    let query = getSupabase()
      .from("budget_month_snapshots")
      .select("*")
      .eq("user_email", user_email)
      .order("month", { ascending: false });

    if (month) query = query.eq("month", month);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @openapi
 * /api/budgets/snapshots:
 *   post:
 *     summary: Save a monthly budget snapshot (upsert by user_email + category + month)
 *     tags: [Budgets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BudgetSnapshot'
 *     responses:
 *       200:
 *         description: Saved snapshot
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BudgetSnapshot'
 *       400:
 *         description: Validation error
 *       500:
 *         description: Supabase error
 */
budgetsRouter.post("/snapshots", async (req: Request, res: Response) => {
  const { user_email, category, month, limit_amount, spent, rollover_to_next } = req.body;
  if (!user_email || !category || !month || limit_amount == null || spent == null) {
    return res.status(400).json({ error: "user_email, category, month, limit_amount, spent are required" });
  }

  try {
    const { data, error } = await getSupabase()
      .from("budget_month_snapshots")
      .upsert(
        { user_email, category, month, limit_amount, spent, rollover_to_next: rollover_to_next ?? 0 },
        { onConflict: "user_email,category,month" }
      )
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});
