import { getSupabase } from "./supabase";
import type { Transaction, Goal, GoalContribution, HydratePayload } from "@/store/financeStore";

const SETTINGS_KEY_SAVINGS = "savings_balance";
const SETTINGS_KEY_SW_KEY = "splitwise_key";
const SETTINGS_KEY_SW_SYNC = "splitwise_last_sync";
const SETTINGS_KEY_VIEW_MODE = "view_mode";
const SETTINGS_KEY_SW_BAL = "splitwise_balances";

/** Fetch all data from Supabase and return in app shape. */
export async function fetchFromSupabase(): Promise<HydratePayload | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const [txRes, goalsRes, contribRes, settingsRes] = await Promise.all([
      supabase.from("transactions").select("id, type, amount, category, date, note, is_splitwise, splitwise_id, original_currency, original_amount, usd_amount, is_pending").order("date", { ascending: false }),
      supabase.from("goals").select("id, title, target_amount, current_amount, deadline, monthly_contribution").order("created_at", { ascending: true }),
      supabase.from("goal_contributions").select("goal_id, amount, date").order("date", { ascending: false }),
      supabase.from("app_settings").select("key, value").in("key", [SETTINGS_KEY_SAVINGS, SETTINGS_KEY_SW_KEY, SETTINGS_KEY_SW_SYNC, SETTINGS_KEY_VIEW_MODE, SETTINGS_KEY_SW_BAL]),
    ]);

    if (txRes.error) throw txRes.error;
    if (goalsRes.error) throw goalsRes.error;
    if (contribRes.error) throw contribRes.error;

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
      if (row.key === SETTINGS_KEY_SAVINGS && row.value != null) savingsBalance = Number(row.value);
      if (row.key === SETTINGS_KEY_SW_KEY && row.value != null) splitwiseKey = String(row.value);
      if (row.key === SETTINGS_KEY_SW_SYNC && row.value != null) splitwiseLastSync = String(row.value);
      if (row.key === SETTINGS_KEY_SW_BAL && row.value != null) splitwiseBalances = row.value as { owe: number; owed: number };
      if (row.key === SETTINGS_KEY_VIEW_MODE && row.value != null) viewMode = String(row.value) as any;
    });

    return { transactions, goals, savingsBalance, splitwiseKey, splitwiseLastSync, splitwiseBalances, viewMode };
  } catch (e) {
    console.error("FinTrack: failed to fetch from Supabase", e);
    return null;
  }
}

/** Write full app state to Supabase (replace all rows). */
export async function persistToSupabase(payload: HydratePayload): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    // Replace all transactions (delete all then insert; PostgREST requires a filter so we use a no-op match)
    const existingTx = await supabase.from("transactions").select("id");
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

    // Replace all goals
    const existingGoals = await supabase.from("goals").select("id");
    if (existingGoals.data && existingGoals.data.length > 0) {
      const goalIds = existingGoals.data.map((r) => r.id);
      const { error } = await supabase.from("goals").delete().in("id", goalIds);
      if (error) throw error;
    }
    if (payload.goals.length > 0) {
      const rows = payload.goals.map((g) => ({
        id: g.id,
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

    // Upsert app_settings (savings, splitwise key, splitwise sync)
    const settingsRows: any[] = [
      { key: SETTINGS_KEY_SAVINGS, value: payload.savingsBalance, updated_at: new Date().toISOString() },
      { key: SETTINGS_KEY_VIEW_MODE, value: payload.viewMode, updated_at: new Date().toISOString() },
    ];
    if (payload.splitwiseKey !== undefined && payload.splitwiseKey !== null) {
      settingsRows.push({ key: SETTINGS_KEY_SW_KEY, value: payload.splitwiseKey, updated_at: new Date().toISOString() });
    }
    if (payload.splitwiseLastSync !== undefined && payload.splitwiseLastSync !== null) {
      settingsRows.push({ key: SETTINGS_KEY_SW_SYNC, value: payload.splitwiseLastSync, updated_at: new Date().toISOString() });
    }
    if (payload.splitwiseBalances !== undefined && payload.splitwiseBalances !== null) {
      settingsRows.push({ key: SETTINGS_KEY_SW_BAL, value: payload.splitwiseBalances, updated_at: new Date().toISOString() });
    }
    const { error: settingsError } = await supabase.from("app_settings").upsert(
      settingsRows,
      { onConflict: "key" }
    );
    if (settingsError) throw settingsError;

    return true;
  } catch (e) {
    console.error("FinTrack: failed to persist to Supabase", e);
    return false;
  }
}
