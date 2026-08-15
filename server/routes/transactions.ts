import { Router, Request, Response } from "express";
import { getSupabase } from "../supabase";
import { requireGoogleAuth, type AuthenticatedRequest } from "../middleware/requireGoogleAuth";

export const transactionsRouter = Router();
transactionsRouter.use(requireGoogleAuth);

/**
 * @openapi
 * /api/transactions:
 *   get:
 *     summary: List all transactions for a user
 *     tags: [Transactions]
 *     parameters:
 *       - $ref: '#/components/parameters/userEmail'
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [income, expense]
 *         description: Filter by transaction type
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: List of transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Missing user_email
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Supabase error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
transactionsRouter.get("/", async (req: Request, res: Response) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { user_email, type, from, to } = req.query as Record<string, string>;
  const resolvedUserEmail = user_email || authenticatedReq.authUser?.email;
  if (!resolvedUserEmail) return res.status(400).json({ error: "user_email is required" });

  try {
    let query = getSupabase()
      .from("transactions")
      .select("*")
      .eq("user_email", resolvedUserEmail)
      .order("date", { ascending: false });

    if (type) query = query.eq("type", type);
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @openapi
 * /api/transactions:
 *   post:
 *     summary: Create or update a transaction
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/Transaction'
 *               - type: object
 *                 required: [user_email]
 *                 properties:
 *                   user_email:
 *                     type: string
 *     responses:
 *       200:
 *         description: Created/updated transaction
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Supabase error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
transactionsRouter.post("/", async (req: Request, res: Response) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { user_email, ...rest } = req.body;
  const resolvedUserEmail = user_email || authenticatedReq.authUser?.email;

  if (!resolvedUserEmail) return res.status(400).json({ error: "user_email is required" });
  if (!rest.id || !rest.type || rest.amount == null || !rest.category || !rest.date) {
    return res.status(400).json({ error: "id, type, amount, category, date are required" });
  }

  const sanitizedPayload = {
    id: String(rest.id),
    user_email: resolvedUserEmail,
    type: String(rest.type),
    amount: Number(rest.amount),
    category: String(rest.category),
    date: String(rest.date),
    note: rest.note != null ? String(rest.note) : "",
    source: rest.source != null ? String(rest.source) : "manual",
    is_pending: Boolean(rest.is_pending ?? rest.isPending ?? false),
    original_currency:
      rest.original_currency != null
        ? String(rest.original_currency)
        : rest.originalCurrency != null
          ? String(rest.originalCurrency)
          : null,
    original_amount:
      rest.original_amount != null
        ? Number(rest.original_amount)
        : rest.originalAmount != null
          ? Number(rest.originalAmount)
          : null,
    usd_amount:
      rest.usd_amount != null
        ? Number(rest.usd_amount)
        : rest.usdAmount != null
          ? Number(rest.usdAmount)
          : null,
  };

  try {
    const { data, error } = await getSupabase()
      .from("transactions")
      .upsert(sanitizedPayload, { onConflict: "id" })
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
 * /api/transactions/{id}:
 *   delete:
 *     summary: Delete a transaction by ID
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *       - $ref: '#/components/parameters/userEmail'
 *     responses:
 *       204:
 *         description: Deleted successfully
 *       400:
 *         description: Missing user_email
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Supabase error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
transactionsRouter.delete("/:id", async (req: Request, res: Response) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { user_email } = req.query as Record<string, string>;
  const resolvedUserEmail = user_email || authenticatedReq.authUser?.email;
  if (!resolvedUserEmail) return res.status(400).json({ error: "user_email is required" });

  try {
    const { error } = await getSupabase()
      .from("transactions")
      .delete()
      .eq("id", req.params.id)
      .eq("user_email", resolvedUserEmail);
    if (error) throw error;
    res.status(204).send();
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});
