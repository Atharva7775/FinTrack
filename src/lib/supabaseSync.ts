import { getSupabase } from "./supabase";
import type { Transaction, Goal, GoalContribution, HydratePayload, Budget } from "@/store/financeStore";

const SETTINGS_KEYS = {
  savings: 'savings_balance',
  swKey: 'splitwise_key',
  swSync: 'splitwise_last_sync',
  viewMode: 'view_mode',
  swBal: 'splitwise_balances',
  budgetSplit: 'budget_split',
} as const;

/** Fetch all data from Supabase and return in app shape. */
export async function fetchFromSupabase(userEmail: string): Promise<HydratePayload | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const [txRes, goalsRes, contribRes, settingsRes, budgetsRes] = await Promise.all([
      supabase.from("transactions").select("id, type, amount, category, date, note, is_splitwise, splitwise_id, original_currency, original_amount, usd_amount, is_pending").eq("user_email", userEmail).order("date", { ascending: false }),
      supabase.from("goals").select("id, title, target_amount, current_amount, deadline, monthly_contribution").eq("user_email", userEmail).order("created_at", { ascending: true }),
      supabase.from("goal_contributions").select("goal_id, amount, date").order("date", { ascending: false }),
      supabase.from("app_settings").select("key, value").in("key", Object.values(SETTINGS_KEYS)).eq("user_email", userEmail),
      supabase.from("budgets").select("id, category, month, type, percentage, fixed_amount, rollover_balance, alert_threshold").eq("user_email", userEmail).order("created_at", { ascending: true }),
    ]);

    if (txRes.error) throw txRes.error;
    if (goalsRes.error) throw goalsRes.error;
    if (contribRes.error) throw contribRes.error;
    if (budgetsRes.error) {
      // If the month column doesn't exist yet, log clearly and continue with empty budgets
      console.error("FinTrack: budget fetch failed — schema may be missing 'month' column. Run the migration in supabase/migrations/007_add_budget_month.sql", budgetsRes.error);
    }
    const transactions: Transaction[] = (txRes.data || []).map((r) => ({
      id: r.id,
      type: r.type as Transaction["type"],
      amount: Number(r.amount),
      category: r.category as Transaction["category"],
      date: r.date,
      note: r.note ?? "",
      isSplitwise: r.is_splitwise ?? false,
      splitwiseId: r.splitwise_id ?? undefined,
      originalCurrency: r.original_currency ?? undefined,
      originalAmount: r.original_amount != null ? Number(r.original_amount) : undefined,
      usdAmount: r.usd_amount != null ? Number(r.usd_amount) : undefined,
      isPending: r.is_pending ?? false,
    }));

    const contributionsByGoal: Record<string, GoalContribution[]> = {};
    (contribRes.data || []).forEach((r) => {
      const list = contributionsByGoal[r.goal_id] ?? [];
      list.push({ date: r.date, amount: Number(r.amount) });
      contributionsByGoal[r.goal_id] = list;
    });

    const goals: Goal[] = (goalsRes.data || []).map((r) => ({
      id: r.id,
      title: r.title,
      targetAmount: Number(r.target_amount),
      currentAmount: Number(r.current_amount),
      deadline: r.deadline,
      monthlyContribution: Number(r.monthly_contribution),
      contributions: contributionsByGoal[r.id] ?? [],
    }));

    let savingsBalance = 0;
    let splitwiseKey: string | null = null;
    let splitwiseLastSync: string | null = null;
    let splitwiseBalances: { owe: number; owed: number } | null = null;
    let viewMode: "personal" | "splitwise" = "personal";

    (settingsRes.data || []).forEach(row => {
      if (row.key === SETTINGS_KEYS.savings && row.value != null) savingsBalance = Number(row.value);
      if (row.key === SETTINGS_KEYS.swKey && row.value != null) splitwiseKey = String(row.value);
      if (row.key === SETTINGS_KEYS.swSync && row.value != null) splitwiseLastSync = String(row.value);
      if (row.key === SETTINGS_KEYS.swBal && row.value != null) splitwiseBalances = row.value as { owe: number; owed: number };
      if (row.key === SETTINGS_KEYS.viewMode && row.value != null) viewMode = String(row.value) as "personal" | "splitwise";
    });

    let budgetSplit: [number, number, number] = [50, 30, 20];
    const budgetRow = (settingsRes.data || []).find(r => r.key === SETTINGS_KEYS.budgetSplit);
    if (budgetRow?.value && Array.isArray(budgetRow.value) && budgetRow.value.length === 3) {
      budgetSplit = budgetRow.value as [number, number, number];
    }

    const currentMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
    const budgets: Budget[] = (budgetsRes.data || []).map((r) => ({
      id: r.id,
      category: r.category as Budget['category'],
      month: r.month || currentMonth,
      type: r.type as Budget['type'],
      percentage: r.percentage != null ? Number(r.percentage) : undefined,
      fixedAmount: r.fixed_amount != null ? Number(r.fixed_amount) : undefined,
      rolloverBalance: Number(r.rollover_balance ?? 0),
      alertThreshold: Number(r.alert_threshold ?? 80),
    }));

    return { transactions, goals, savingsBalance, splitwiseKey, splitwiseLastSync, splitwiseBalances, viewMode, budgetSplit, budgets };
  } catch (e) {
    console.error("FinTrack: failed to fetch from Supabase", e);
    return null;
  }
}

/** Write full app state to Supabase (replace all rows for this user). */
export async function persistToSupabase(userEmail: string, payload: HydratePayload): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    // Replace this user's transactions
    const existingTx = await supabase.from("transactions").select("id").eq("user_email", userEmail);
    if (existingTx.data && existingTx.data.length > 0) {
      const idsToDelete = existingTx.data.map((r) => r.id);
      for (let i = 0; i < idsToDelete.length; i += 100) {
        const chunk = idsToDelete.slice(i, i + 100);
        const { error } = await supabase.from("transactions").delete().in("id", chunk);
        if (error) throw error;
      }
    }
    if (payload.transactions.length > 0) {
      const rows = payload.transactions.map((t) => ({
        id: t.id,
        user_email: userEmail,
        type: t.type,
        amount: t.amount,
        category: t.category,
        date: t.date,
        note: t.note,
        is_splitwise: t.isSplitwise ?? false,
        splitwise_id: t.splitwiseId ?? null,
        original_currency: t.originalCurrency ?? null,
        original_amount: t.originalAmount ?? null,
        usd_amount: t.usdAmount ?? null,
        is_pending: t.isPending ?? false,
      }));
      const { error } = await supabase.from("transactions").insert(rows);
      if (error) throw error;
    }

    // Replace this user's goals
    const existingGoals = await supabase.from("goals").select("id").eq("user_email", userEmail);
    if (existingGoals.data && existingGoals.data.length > 0) {
      const goalIds = existingGoals.data.map((r) => r.id);
      const { error } = await supabase.from("goals").delete().in("id", goalIds);
      if (error) throw error;
    }
    if (payload.goals.length > 0) {
      const rows = payload.goals.map((g) => ({
        id: g.id,
        user_email: userEmail,
        title: g.title,
        target_amount: g.targetAmount,
        current_amount: g.currentAmount,
        deadline: g.deadline,
        monthly_contribution: g.monthlyContribution,
      }));
      const { error } = await supabase.from("goals").insert(rows);
      if (error) throw error;
    }

    // Replace all goal_contributions
    const existingContrib = await supabase.from("goal_contributions").select("id");
    if (existingContrib.data && existingContrib.data.length > 0) {
      const contribIds = existingContrib.data.map((r) => r.id);
      for (let i = 0; i < contribIds.length; i += 100) {
        const chunk = contribIds.slice(i, i + 100);
        const { error } = await supabase.from("goal_contributions").delete().in("id", chunk);
        if (error) throw error;
      }
    }
    const allContributions: { goal_id: string; amount: number; date: string }[] = [];
    payload.goals.forEach((g) => {
      (g.contributions || []).forEach((c) => allContributions.push({ goal_id: g.id, amount: c.amount, date: c.date }));
    });
    if (allContributions.length > 0) {
      const { error } = await supabase.from("goal_contributions").insert(allContributions);
      if (error) throw error;
    }

    // Upsert user-scoped app_settings (user_email column ensures per-user isolation)
    const now = new Date().toISOString();
    const settingsRows: { key: string; user_email: string; value: unknown; updated_at: string }[] = [
      { key: SETTINGS_KEYS.savings, user_email: userEmail, value: payload.savingsBalance, updated_at: now },
      { key: SETTINGS_KEYS.viewMode, user_email: userEmail, value: payload.viewMode, updated_at: now },
    ];
    if (payload.splitwiseKey !== undefined && payload.splitwiseKey !== null) {
      settingsRows.push({ key: SETTINGS_KEYS.swKey, user_email: userEmail, value: payload.splitwiseKey, updated_at: now });
    }
    if (payload.splitwiseLastSync !== undefined && payload.splitwiseLastSync !== null) {
      settingsRows.push({ key: SETTINGS_KEYS.swSync, user_email: userEmail, value: payload.splitwiseLastSync, updated_at: now });
    }
    if (payload.splitwiseBalances !== undefined && payload.splitwiseBalances !== null) {
      settingsRows.push({ key: SETTINGS_KEYS.swBal, user_email: userEmail, value: payload.splitwiseBalances, updated_at: now });
    }
    if (payload.budgetSplit !== undefined) {
      settingsRows.push({ key: SETTINGS_KEYS.budgetSplit, user_email: userEmail, value: payload.budgetSplit, updated_at: now });
    }
    const { error: settingsError } = await supabase.from("app_settings").upsert(
      settingsRows,
      { onConflict: "key,user_email" }
    );
    if (settingsError) throw settingsError;

    // Replace this user's budgets (delete-all + reinsert so deletions are honoured)
    const { error: budgetDeleteError } = await supabase.from("budgets").delete().eq("user_email", userEmail);
    if (budgetDeleteError) throw budgetDeleteError;
    if (payload.budgets && payload.budgets.length > 0) {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const budgetRows = payload.budgets.map((b) => ({
        // Only send the id if it is a real UUID; otherwise let the DB generate one
        ...(UUID_RE.test(b.id) ? { id: b.id } : {}),
        user_email: userEmail,
        category: b.category,
        month: b.month,
        type: b.type,
        percentage: b.percentage ?? null,
        fixed_amount: b.fixedAmount ?? null,
        rollover_balance: b.rolloverBalance,
        alert_threshold: b.alertThreshold,
      }));
      const { error: budgetError } = await supabase.from("budgets").insert(budgetRows);
      if (budgetError) throw budgetError;
    }

    return true;
  } catch (e) {
    console.error("FinTrack: failed to persist to Supabase", e);
    return false;
  }
}

/** Check if this user has already completed onboarding. Returns false if no record exists. */
export async function fetchOnboardingStatus(userEmail: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { data } = await supabase
      .from("user_onboarding")
      .select("has_onboarded")
      .eq("user_email", userEmail)
      .maybeSingle();
    return data?.has_onboarded === true;
  } catch {
    return false;
  }
}

/** Mark onboarding as completed for this user. */
export async function completeOnboarding(userEmail: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from("user_onboarding").upsert(
      { user_email: userEmail, has_onboarded: true, completed_at: new Date().toISOString() },
      { onConflict: "user_email" }
    );
  } catch (e) {
    console.error("FinTrack: failed to save onboarding status", e);
  }
}

/** Upsert a single budget row for this user. Returns the saved budget (with server-generated id if new). */
export async function saveBudget(userEmail: string, budget: Budget): Promise<Budget | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const row = {
      id: budget.id,
      user_email: userEmail,
      category: budget.category,
      month: budget.month,
      type: budget.type,
      percentage: budget.percentage ?? null,
      fixed_amount: budget.fixedAmount ?? null,
      rollover_balance: budget.rolloverBalance,
      alert_threshold: budget.alertThreshold,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("budgets")
      .upsert(row, { onConflict: "user_email,category,month" })
      .select("id, category, month, type, percentage, fixed_amount, rollover_balance, alert_threshold")
      .single();
    if (error) throw error;
    return {
      id: data.id,
      category: data.category as Budget['category'],
      month: data.month,
      type: data.type as Budget['type'],
      percentage: data.percentage != null ? Number(data.percentage) : undefined,
      fixedAmount: data.fixed_amount != null ? Number(data.fixed_amount) : undefined,
      rolloverBalance: Number(data.rollover_balance ?? 0),
      alertThreshold: Number(data.alert_threshold ?? 80),
    };
  } catch (e) {
    console.error("FinTrack: failed to save budget", e);
    return null;
  }
}

/** Delete a budget row by id. */
export async function deleteBudgetRow(budgetId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from("budgets").delete().eq("id", budgetId);
  } catch (e) {
    console.error("FinTrack: failed to delete budget", e);
  }
}

/** Save a monthly budget snapshot (called when a month closes). */
export async function saveBudgetSnapshot(
  userEmail: string,
  category: string,
  month: string,
  limitAmount: number,
  spent: number,
  rolloverToNext: number
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from("budget_month_snapshots").upsert(
      { user_email: userEmail, category, month, limit_amount: limitAmount, spent, rollover_to_next: rolloverToNext },
      { onConflict: "user_email,category,month" }
    );
  } catch (e) {
    console.error("FinTrack: failed to save budget snapshot", e);
  }
}
