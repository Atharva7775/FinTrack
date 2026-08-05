import { z } from "zod";
import { getSupabase } from "../../supabase";
import type { McpExecutionContext, McpTool } from "../types";

function monthRange(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 0);
  const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return { from, to };
}

function normalizeMonth(inputMonth: string | undefined, now: Date) {
  if (inputMonth) return inputMonth;
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export const monthlySummaryTool: McpTool<{ month?: string }> = {
  name: "finance.monthly_summary",
  description: "Returns monthly income, expense, and net summary for the current user.",
  inputSchema: z.object({
    month: z.string().regex(/^20\d{2}-\d{2}$/).optional(),
  }),
  async execute(input, context) {
    const month = normalizeMonth(input.month, context.now);
    const { from, to } = monthRange(month);

    const { data, error } = await getSupabase()
      .from("transactions")
      .select("type, amount")
      .eq("user_email", context.userEmail)
      .gte("date", from)
      .lte("date", to);

    if (error) throw new Error(error.message);

    let income = 0;
    let expense = 0;

    for (const row of data ?? []) {
      if (row.type === "income") income += Number(row.amount ?? 0);
      if (row.type === "expense") expense += Number(row.amount ?? 0);
    }

    const net = income - expense;

    return {
      answer: `Monthly summary for ${month}: income $${income.toFixed(2)}, expenses $${expense.toFixed(2)}, net $${net.toFixed(2)}.`,
      data: { month, income, expense, net },
      meta: {
        sql: `SELECT type, amount FROM transactions WHERE user_email = :user_email AND date BETWEEN '${from}' AND '${to}';`,
      },
    };
  },
};
