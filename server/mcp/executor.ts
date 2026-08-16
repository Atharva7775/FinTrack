import { getSupabase } from "../supabase";
import type { FinancePlan } from "./planSchema";
import type { McpExecutionContext } from "./types";

export interface ExecutionOutcome {
  result: Record<string, unknown>;
  sqlPreview: string;
}

function currentMonth(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    to: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

/**
 * Runs exactly one parameterized Supabase query chosen by a validated plan.
 * user_email always comes from the trusted auth context — it is never a
 * field the plan itself can carry (see planSchema's .strict() plan shape).
 */
export async function executePlan(plan: FinancePlan, context: McpExecutionContext): Promise<ExecutionOutcome> {
  if (plan.table === "transactions") return executeTransactions(plan, context);
  if (plan.table === "goals") return executeGoals(plan, context);
  return executeBudgets(plan, context);
}

async function executeTransactions(plan: FinancePlan, context: McpExecutionContext): Promise<ExecutionOutcome> {
  const { userEmail } = context;

  if (plan.operation === "monthly_summary") {
    const month = plan.filters?.month ?? currentMonth(context.now);
    const { from, to } = monthRange(month);
    const { data, error } = await getSupabase()
      .from("transactions")
      .select("type, amount")
      .eq("user_email", userEmail)
      .gte("date", from)
      .lte("date", to);
    if (error) throw new Error(error.message);

    let income = 0;
    let expense = 0;
    for (const row of data ?? []) {
      if (row.type === "income") income += Number(row.amount ?? 0);
      if (row.type === "expense") expense += Number(row.amount ?? 0);
    }

    return {
      result: { month, income, expense, net: income - expense },
      sqlPreview: `SELECT type, amount FROM transactions WHERE user_email = :user_email AND date BETWEEN '${from}' AND '${to}';`,
    };
  }

  const needsCategory = plan.operation === "group_by" || plan.operation === "top_n";
  let query = getSupabase()
    .from("transactions")
    .select(needsCategory ? "category, amount" : "amount")
    .eq("user_email", userEmail);

  const whereParts = ["user_email = :user_email"];
  if (plan.filters?.type) {
    query = query.eq("type", plan.filters.type);
    whereParts.push(`type = '${plan.filters.type}'`);
  }
  if (plan.filters?.category) {
    query = query.eq("category", plan.filters.category);
    whereParts.push(`category = '${plan.filters.category}'`);
  }

  let month: string | undefined;
  if (plan.filters?.month) {
    month = plan.filters.month;
    const { from, to } = monthRange(month);
    query = query.gte("date", from).lte("date", to);
    whereParts.push(`date BETWEEN '${from}' AND '${to}'`);
  }

  const { data, error } = await query.returns<{ amount: number; category?: string }[]>();
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  if (plan.operation === "sum" || plan.operation === "avg") {
    const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const value = plan.operation === "avg" && rows.length > 0 ? total / rows.length : total;
    return {
      result: { operation: plan.operation, value, count: rows.length, month, filters: plan.filters ?? {} },
      sqlPreview: `SELECT ${plan.operation === "avg" ? "AVG" : "SUM"}(amount) FROM transactions WHERE ${whereParts.join(" AND ")};`,
    };
  }

  if (plan.operation === "count") {
    return {
      result: { count: rows.length, month, filters: plan.filters ?? {} },
      sqlPreview: `SELECT COUNT(*) FROM transactions WHERE ${whereParts.join(" AND ")};`,
    };
  }

  // group_by / top_n
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const category = row.category ?? "Other";
    grouped.set(category, (grouped.get(category) ?? 0) + Number(row.amount ?? 0));
  }
  const limit = plan.operation === "top_n" ? plan.limit ?? 5 : 20;
  const categories = Array.from(grouped.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);

  return {
    result: { categories, month },
    sqlPreview: `SELECT category, SUM(amount) FROM transactions WHERE ${whereParts.join(" AND ")} GROUP BY category ORDER BY SUM(amount) DESC LIMIT ${limit};`,
  };
}

async function executeGoals(plan: FinancePlan, context: McpExecutionContext): Promise<ExecutionOutcome> {
  const metric = plan.metric ?? "current_amount";
  const { data, error } = await getSupabase()
    .from("goals")
    .select(plan.operation === "count" ? "id" : metric)
    .eq("user_email", context.userEmail)
    .returns<Record<string, number>[]>();
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  if (plan.operation === "count") {
    return {
      result: { count: rows.length },
      sqlPreview: `SELECT COUNT(*) FROM goals WHERE user_email = :user_email;`,
    };
  }

  const total = rows.reduce((sum, row) => sum + Number(row[metric] ?? 0), 0);
  return {
    result: { metric, value: total, count: rows.length },
    sqlPreview: `SELECT SUM(${metric}) FROM goals WHERE user_email = :user_email;`,
  };
}

async function executeBudgets(plan: FinancePlan, context: McpExecutionContext): Promise<ExecutionOutcome> {
  const metric = "fixed_amount";
  let query = getSupabase()
    .from("budgets")
    .select(plan.operation === "count" ? "id" : metric)
    .eq("user_email", context.userEmail);

  const whereParts = ["user_email = :user_email"];
  if (plan.filters?.category) {
    query = query.eq("category", plan.filters.category);
    whereParts.push(`category = '${plan.filters.category}'`);
  }
  if (plan.filters?.month) {
    query = query.eq("month", plan.filters.month);
    whereParts.push(`month = '${plan.filters.month}'`);
  }

  const { data, error } = await query.returns<Record<string, number>[]>();
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  if (plan.operation === "count") {
    return {
      result: { count: rows.length },
      sqlPreview: `SELECT COUNT(*) FROM budgets WHERE ${whereParts.join(" AND ")};`,
    };
  }

  const total = rows.reduce((sum, row) => sum + Number(row[metric] ?? 0), 0);
  return {
    result: { metric, value: total, count: rows.length },
    sqlPreview: `SELECT SUM(${metric}) FROM budgets WHERE ${whereParts.join(" AND ")};`,
  };
}
