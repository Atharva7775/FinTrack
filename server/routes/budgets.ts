import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";
import { requireGoogleAuth, type AuthenticatedRequest } from "../middleware/requireGoogleAuth";

export const budgetsRouter = Router();
budgetsRouter.use(requireGoogleAuth);

/**
 * @openapi
 * /api/budgets:
 *   get:
 *     summary: List budgets for the authenticated user, optionally filtered by month
 *     tags: [Budgets]
 *     parameters:
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
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
budgetsRouter.get("/", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const { month } = req.query as Record<string, string>;

  try {
    let query = getSupabase()
      .from("budgets")
      .select("*")
      .eq("user_email", userEmail)
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
 *     summary: Create or update a budget for the authenticated user (upsert by category + month)
 *     tags: [Budgets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Budget'
 *     responses:
 *       200:
 *         description: Created/updated budget
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Budget'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
budgetsRouter.post("/", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const { user_email: _ignoredUserEmail, ...rest } = req.body;
  if (!rest.category || !rest.month || !rest.type) {
    return res.status(400).json({ error: "category, month, and type are required" });
  }

  try {
    const { data, error } = await getSupabase()
      .from("budgets")
      .upsert(
        { ...rest, user_email: userEmail, updated_at: new Date().toISOString() },
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
 *     summary: Delete a budget by ID, if owned by the authenticated user
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
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
budgetsRouter.delete("/:id", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });

  try {
    const { error } = await getSupabase()
      .from("budgets")
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
 * /api/budgets/snapshots:
 *   get:
 *     summary: List monthly budget snapshots for the authenticated user
 *     tags: [Budgets]
 *     parameters:
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
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
budgetsRouter.get("/snapshots", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const { month } = req.query as Record<string, string>;

  try {
    let query = getSupabase()
      .from("budget_month_snapshots")
      .select("*")
      .eq("user_email", userEmail)
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
 *     summary: Save a monthly budget snapshot for the authenticated user (upsert by category + month)
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
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
budgetsRouter.post("/snapshots", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const { category, month, limit_amount, spent, rollover_to_next } = req.body;
  if (!category || !month || limit_amount == null || spent == null) {
    return res.status(400).json({ error: "category, month, limit_amount, spent are required" });
  }

  try {
    const { data, error } = await getSupabase()
      .from("budget_month_snapshots")
      .upsert(
        { user_email: userEmail, category, month, limit_amount, spent, rollover_to_next: rollover_to_next ?? 0 },
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
