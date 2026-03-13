import { getSupabase } from "./supabase";
import type { Transaction, Goal, GoalContribution, HydratePayload } from "@/store/financeStore";

const SETTINGS_KEY_SAVINGS = "savings_balance";

/** Fetch all data from Supabase and return in app shape. */
export async function fetchFromSupabase(): Promise<HydratePayload | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const [txRes, goalsRes, contribRes, settingsRes] = await Promise.all([
      supabase.from("transactions").select("id, type, amount, category, date, note").order("date", { ascending: false }),
      supabase.from("goals").select("id, title, target_amount, current_amount, deadline, monthly_contribution").order("created_at", { ascending: true }),
      supabase.from("goal_contributions").select("goal_id, amount, date").order("date", { ascending: false }),
      supabase.from("app_settings").select("key, value").eq("key", SETTINGS_KEY_SAVINGS).maybeSingle(),
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
    if (settingsRes.data?.value != null) savingsBalance = Number(settingsRes.data.value);

    return { transactions, goals, savingsBalance };
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

    // Upsert savings_balance
    const { error: settingsError } = await supabase.from("app_settings").upsert(
      { key: SETTINGS_KEY_SAVINGS, value: payload.savingsBalance, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    if (settingsError) throw settingsError;

    return true;
  } catch (e) {
    console.error("FinTrack: failed to persist to Supabase", e);
    return false;
  }
}
