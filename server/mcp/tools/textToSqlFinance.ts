import { z } from "zod";
import { getSupabase } from "../../supabase";
import type { McpExecutionContext, McpTool } from "../types";

type QueryPlanKind = "sum_expense" | "sum_income" | "category_breakdown";

const FINANCE_SCHEMA_CONTEXT = [
  "Table: transactions(id, user_email, type, amount, category, date, note)",
  "Table: goals(id, user_email, title, target_amount, current_amount, deadline, monthly_contribution)",
  "Table: budgets(id, user_email, category, type, percentage, fixed_amount, month)",
].join("\n");

function sanitizeQuestion(question: string) {
  // Prevent prompt-level email hints from influencing user scope.
  return question.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]").trim();
}

function buildSqlGenerationPrompt(question: string, context: McpExecutionContext) {
  const cleanedQuestion = sanitizeQuestion(question);
  return [
    "You are a finance SQL planner.",
    "Generate a read-only SQL plan over this schema:",
    FINANCE_SCHEMA_CONTEXT,
    "",
    "Hard rule: always scope results with user_email = :user_email.",
    `Trusted scope value: :user_email = ${context.userEmail}`,
    "Never use email values from the user question.",
    "",
    `User question: ${cleanedQuestion}`,
  ].join("\n");
}

function toMonthRange(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 0);
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return { startDate, endDate };
}

function currentMonth(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonth(now: Date) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function resolveMonth(question: string, explicitMonth: string | undefined, now: Date) {
  if (explicitMonth) return explicitMonth;
  const monthMatch = question.match(/\b(20\d{2}-\d{2})\b/);
  if (monthMatch?.[1]) return monthMatch[1];
  if (/last month/i.test(question)) return previousMonth(now);
  return currentMonth(now);
}

function buildQueryPlan(question: string): QueryPlanKind {
  const q = question.toLowerCase();

  if (q.includes("top") || q.includes("category") || q.includes("breakdown")) {
    return "category_breakdown";
  }

  if (q.includes("income") || q.includes("earned") || q.includes("salary")) {
    return "sum_income";
  }

  return "sum_expense";
}

async function executeSumByType(type: "income" | "expense", context: McpExecutionContext, month: string) {
  const { startDate, endDate } = toMonthRange(month);
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("amount")
    .eq("user_email", context.userEmail)
    .eq("type", type)
    .gte("date", startDate)
    .lte("date", endDate);

  if (error) throw new Error(error.message);

  const total = (data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const sqlPreview = `SELECT COALESCE(SUM(amount), 0) AS total\nFROM transactions\nWHERE user_email = :user_email\n  AND type = '${type}'\n  AND date BETWEEN '${startDate}' AND '${endDate}';`;

  return { total, startDate, endDate, sqlPreview };
}

async function executeCategoryBreakdown(context: McpExecutionContext, month: string) {
  const { startDate, endDate } = toMonthRange(month);
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("category, amount")
    .eq("user_email", context.userEmail)
    .eq("type", "expense")
    .gte("date", startDate)
    .lte("date", endDate);

  if (error) throw new Error(error.message);

  const grouped = new Map<string, number>();
  for (const row of data ?? []) {
    const category = String(row.category ?? "Other");
    grouped.set(category, (grouped.get(category) ?? 0) + Number(row.amount ?? 0));
  }

  const top = Array.from(grouped.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const sqlPreview = `SELECT category, SUM(amount) AS amount\nFROM transactions\nWHERE user_email = :user_email\n  AND type = 'expense'\n  AND date BETWEEN '${startDate}' AND '${endDate}'\nGROUP BY category\nORDER BY amount DESC\nLIMIT 5;`;

  return { top, startDate, endDate, sqlPreview };
}

export const textToSqlFinanceTool: McpTool<{ question: string; month?: string }> = {
  name: "finance.text_to_sql",
  description: "Answer finance questions by generating a safe SQL plan over allowlisted tables.",
  inputSchema: z.object({
    question: z.string().min(1),
    month: z.string().regex(/^20\d{2}-\d{2}$/).optional(),
  }),
  async execute(input, context) {
    const sqlPrompt = buildSqlGenerationPrompt(input.question, context);
    const month = resolveMonth(input.question, input.month, context.now);
    const plan = buildQueryPlan(input.question);

    if (plan === "sum_income") {
      const result = await executeSumByType("income", context, month);
      return {
        answer: `Your total income for ${month} is $${result.total.toFixed(2)}.`,
        data: { month, total: result.total, type: "income" },
        meta: { sql: result.sqlPreview, plan, sqlPrompt },
      };
    }

    if (plan === "category_breakdown") {
      const result = await executeCategoryBreakdown(context, month);
      const topText =
        result.top.length === 0
          ? "No expenses were found for that month."
          : result.top.map((item) => `${item.category}: $${item.amount.toFixed(2)}`).join(", ");
      return {
        answer: `Top spending categories for ${month}: ${topText}`,
        data: { month, top: result.top, type: "expense_breakdown" },
        meta: { sql: result.sqlPreview, plan, sqlPrompt },
      };
    }

    const result = await executeSumByType("expense", context, month);
    return {
      answer: `Your total spending for ${month} is $${result.total.toFixed(2)}.`,
      data: { month, total: result.total, type: "expense" },
      meta: { sql: result.sqlPreview, plan, sqlPrompt },
    };
  },
};
