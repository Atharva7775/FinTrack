import { apiFetch, ApiAuthError } from "./apiClient";
import type { Transaction, Goal, HydratePayload, Budget } from "@/store/financeStore";

// ─── Server row shapes (snake_case, as returned by server/routes/*.ts) ─────────

interface ServerTransaction {
  id: string;
  type: string;
  amount: number;
  category: string;
  date: string;
  note: string | null;
  original_currency: string | null;
  original_amount: number | null;
  usd_amount: number | null;
  is_pending: boolean | null;
  source?: string;
}

interface ServerGoal {
  id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
  monthly_contribution: number;
  contributions?: { goal_id: string; amount: number; date: string }[];
}

interface ServerBudget {
  id: string;
  category: string;
  month: string;
  type: string;
  percentage: number | null;
  fixed_amount: number | null;
  rollover_balance: number;
  alert_threshold: number;
}

function toTransaction(r: ServerTransaction): Transaction {
  return {
    id: r.id,
    type: r.type as Transaction["type"],
    amount: Number(r.amount),
    category: r.category as Transaction["category"],
    date: r.date,
    note: r.note ?? "",
    originalCurrency: r.original_currency ?? undefined,
    originalAmount: r.original_amount != null ? Number(r.original_amount) : undefined,
    usdAmount: r.usd_amount != null ? Number(r.usd_amount) : undefined,
    isPending: r.is_pending ?? false,
    source: r.source,
  };
}

function toGoal(r: ServerGoal): Goal {
  return {
    id: r.id,
    title: r.title,
    targetAmount: Number(r.target_amount),
    currentAmount: Number(r.current_amount),
    deadline: r.deadline,
    monthlyContribution: Number(r.monthly_contribution),
    contributions: (r.contributions ?? []).map((c) => ({ date: c.date, amount: Number(c.amount) })),
  };
}

function toBudget(r: ServerBudget): Budget {
  return {
    id: r.id,
    category: r.category as Budget["category"],
    month: r.month,
    type: r.type as Budget["type"],
    percentage: r.percentage != null ? Number(r.percentage) : undefined,
    fixedAmount: r.fixed_amount != null ? Number(r.fixed_amount) : undefined,
    rolloverBalance: Number(r.rollover_balance ?? 0),
    alertThreshold: Number(r.alert_threshold ?? 80),
  };
}

/**
 * Fetch all data from the server and return in app shape. `idToken` must be a
 * real, verified Google ID token — manual/demo sign-ins have none, so this
 * returns null for them and the app stays in-memory-only for that session.
 */
export async function fetchFromSupabase(idToken: string | null): Promise<HydratePayload | null> {
  if (!idToken) return null;

  try {
    const [transactions, goals, settings, budgets] = await Promise.all([
      apiFetch<ServerTransaction[]>("/api/transactions", idToken),
      apiFetch<ServerGoal[]>("/api/goals", idToken),
      apiFetch<Record<string, unknown>>("/api/settings", idToken),
      apiFetch<ServerBudget[]>("/api/budgets", idToken),
    ]);

    let savingsBalance = 0;
    if (typeof settings.savings_balance === "number") savingsBalance = settings.savings_balance;

    let budgetSplit: [number, number, number] = [50, 30, 20];
    if (Array.isArray(settings.budget_split) && settings.budget_split.length === 3) {
      budgetSplit = settings.budget_split as [number, number, number];
    }

    return {
      transactions: transactions.map(toTransaction),
      goals: goals.map(toGoal),
      savingsBalance,
      budgetSplit,
      budgets: budgets.map(toBudget),
    };
  } catch (e) {
    console.error("FinTrack: failed to fetch from server", e);
    return null;
  }
}

/**
 * Write full app state to the server (replaces all rows for this user).
 * Transactions and goals go through the bulk-sync endpoints (one round trip
 * each, mirroring the old delete-all/insert-all semantics); budgets go
 * through the existing safe per-row upsert + stale cleanup, same as before.
 */
export async function persistToSupabase(idToken: string | null, payload: HydratePayload): Promise<boolean> {
  if (!idToken) return false;

  try {
    await apiFetch("/api/transactions/bulk-sync", idToken, {
      method: "PUT",
      body: JSON.stringify({
        transactions: payload.transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          category: t.category,
          date: t.date,
          note: t.note,
          original_currency: t.originalCurrency ?? null,
          original_amount: t.originalAmount ?? null,
          usd_amount: t.usdAmount ?? null,
          is_pending: t.isPending ?? false,
          source: t.source ?? "manual",
        })),
      }),
    });

    await apiFetch("/api/goals/bulk-sync", idToken, {
      method: "PUT",
      body: JSON.stringify({
        goals: payload.goals.map((g) => ({
          id: g.id,
          title: g.title,
          target_amount: g.targetAmount,
          current_amount: g.currentAmount,
          deadline: g.deadline,
          monthly_contribution: g.monthlyContribution,
          contributions: g.contributions ?? [],
        })),
      }),
    });

    await apiFetch("/api/settings", idToken, {
      method: "PUT",
      body: JSON.stringify({
        settings: { savings_balance: payload.savingsBalance, budget_split: payload.budgetSplit },
      }),
    });

    // Sync budgets: safe upsert by (category, month) — never delete-all first.
    // Individual saveBudget() / deleteBudgetRow() calls are the primary persistence path;
    // this is the background fallback that catches any gaps.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validBudgets = (payload.budgets ?? []).filter((b) => UUID_RE.test(b.id));

    await Promise.all(
      validBudgets.map((b) =>
        apiFetch("/api/budgets", idToken, {
          method: "POST",
          body: JSON.stringify({
            category: b.category,
            month: b.month,
            type: b.type,
            percentage: b.percentage ?? null,
            fixed_amount: b.fixedAmount ?? null,
            rollover_balance: b.rolloverBalance,
            alert_threshold: b.alertThreshold,
          }),
        })
      )
    );

    const remoteBudgets = await apiFetch<ServerBudget[]>("/api/budgets", idToken);
    const currentKeys = new Set(validBudgets.map((b) => `${b.category}|${b.month}`));
    const staleIds = remoteBudgets.filter((r) => !currentKeys.has(`${r.category}|${r.month}`)).map((r) => r.id);
    if (staleIds.length > 0) {
      await Promise.all(staleIds.map((id) => apiFetch(`/api/budgets/${id}`, idToken, { method: "DELETE" })));
    }

    return true;
  } catch (e) {
    if (!(e instanceof ApiAuthError)) console.error("FinTrack: failed to persist to server", e);
    return false;
  }
}

/** Check if this user has already completed onboarding. Returns false if no record exists. */
export async function fetchOnboardingStatus(idToken: string | null): Promise<boolean> {
  if (!idToken) return false;
  try {
    const data = await apiFetch<{ has_onboarded: boolean }>("/api/onboarding", idToken);
    return data?.has_onboarded === true;
  } catch {
    // Covers both "no record yet" (404) and any transient failure — both mean "not onboarded".
    return false;
  }
}

/** Mark onboarding as completed for this user. */
export async function completeOnboarding(idToken: string | null): Promise<void> {
  if (!idToken) return;
  try {
    await apiFetch("/api/onboarding", idToken, {
      method: "POST",
      body: JSON.stringify({ has_onboarded: true }),
    });
  } catch (e) {
    console.error("FinTrack: failed to save onboarding status", e);
  }
}

/** Upsert a single budget row for this user. Returns the saved budget (with server-generated id if new). */
export async function saveBudget(idToken: string | null, budget: Budget): Promise<Budget | null> {
  if (!idToken) return null;
  try {
    const saved = await apiFetch<ServerBudget>("/api/budgets", idToken, {
      method: "POST",
      body: JSON.stringify({
        category: budget.category,
        month: budget.month,
        type: budget.type,
        percentage: budget.percentage ?? null,
        fixed_amount: budget.fixedAmount ?? null,
        rollover_balance: budget.rolloverBalance,
        alert_threshold: budget.alertThreshold,
      }),
    });
    return toBudget(saved);
  } catch (e) {
    console.error("FinTrack: failed to save budget", e);
    return null;
  }
}

/** Delete a budget row by id. */
export async function deleteBudgetRow(idToken: string | null, budgetId: string): Promise<void> {
  if (!idToken) return;
  try {
    await apiFetch(`/api/budgets/${budgetId}`, idToken, { method: "DELETE" });
  } catch (e) {
    console.error("FinTrack: failed to delete budget", e);
  }
}

/** Save a monthly budget snapshot (called when a month closes). */
export async function saveBudgetSnapshot(
  idToken: string | null,
  category: string,
  month: string,
  limitAmount: number,
  spent: number,
  rolloverToNext: number
): Promise<void> {
  if (!idToken) return;
  try {
    await apiFetch("/api/budgets/snapshots", idToken, {
      method: "POST",
      body: JSON.stringify({
        category,
        month,
        limit_amount: limitAmount,
        spent,
        rollover_to_next: rolloverToNext,
      }),
    });
  } catch (e) {
    console.error("FinTrack: failed to save budget snapshot", e);
  }
}
