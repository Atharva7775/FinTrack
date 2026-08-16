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
  const { type, from, to } = req.query as Record<string, string>;
  const resolvedUserEmail = authenticatedReq.authUser?.email;
  if (!resolvedUserEmail) return res.status(401).json({ error: "Missing authenticated user context" });

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
  const { user_email: _ignoredUserEmail, ...rest } = req.body;
  const resolvedUserEmail = authenticatedReq.authUser?.email;

  if (!resolvedUserEmail) return res.status(401).json({ error: "Missing authenticated user context" });
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
/**
 * @openapi
 * /api/transactions/bulk-sync:
 *   put:
 *     summary: Replace all of the authenticated user's transactions in one call
 *     description: Used by the web client's debounced full-state sync. Deletes every existing transaction for this user, then inserts the given list — mirrors the previous client-side delete-all/insert-all behavior, now server-side and authenticated.
 *     tags: [Transactions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [transactions]
 *             properties:
 *               transactions:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Transaction'
 *     responses:
 *       204:
 *         description: Synced successfully
 *       401:
 *         description: Missing or invalid auth
 *       500:
 *         description: Supabase error
 */
transactionsRouter.put("/bulk-sync", async (req: Request, res: Response) => {
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) return res.status(401).json({ error: "Missing authenticated user context" });
  const transactions = Array.isArray(req.body?.transactions) ? req.body.transactions : null;
  if (!transactions) return res.status(400).json({ error: "transactions array is required" });

  try {
    const { error: deleteError } = await getSupabase()
      .from("transactions")
      .delete()
      .eq("user_email", userEmail);
    if (deleteError) throw deleteError;

    if (transactions.length > 0) {
      const rows = transactions.map((t) => ({
        id: String(t.id),
        user_email: userEmail,
        type: String(t.type),
        amount: Number(t.amount),
        category: String(t.category),
        date: String(t.date),
        note: t.note != null ? String(t.note) : "",
        source: t.source != null ? String(t.source) : "manual",
        is_pending: Boolean(t.is_pending ?? false),
        original_currency: t.original_currency ?? null,
        original_amount: t.original_amount != null ? Number(t.original_amount) : null,
        usd_amount: t.usd_amount != null ? Number(t.usd_amount) : null,
      }));
      const { error: insertError } = await getSupabase().from("transactions").insert(rows);
      if (insertError) throw insertError;
    }

    res.status(204).send();
  } catch (e: unknown) {
    res.status(500).json({ error: (e as Error).message });
  }
});

transactionsRouter.delete("/:id", async (req: Request, res: Response) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const resolvedUserEmail = authenticatedReq.authUser?.email;
  if (!resolvedUserEmail) return res.status(401).json({ error: "Missing authenticated user context" });

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
