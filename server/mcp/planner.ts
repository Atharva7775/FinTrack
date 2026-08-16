import { generateWithGemini } from "./geminiClient";
import { financePlanResponseSchema } from "./planSchema";

function isoDate(now: Date) {
  return now.toISOString().slice(0, 10);
}

function buildPrompt(question: string, now: Date, defaultMonth?: string) {
  return [
    "You are a query planner for a personal finance app called FinTrack.",
    "Read the user's question and output ONLY a JSON object describing how to look up the answer.",
    "Never output SQL. Never output prose. Never include a user_email, id, or any identifying field — the server attaches the account separately.",
    "",
    "Fields:",
    "  table: transactions | goals | budgets",
    "  operation: sum | avg | count | group_by | top_n | monthly_summary",
    "  metric: which column to aggregate (optional; omit to use the sensible default for the table)",
    "  filters.type: income | expense (transactions only)",
    "  filters.category: a category name, if the question names one",
    "  filters.month: YYYY-MM, if the question is about a specific month",
    "  limit: 1-10, only meaningful with operation = top_n",
    "",
    "Rules of thumb:",
    "  - \"how much did I spend/earn\" -> table transactions, operation sum, filters.type expense/income",
    "  - \"top categories\" / \"where did my money go\" -> table transactions, operation top_n",
    "  - \"breakdown by category\" -> table transactions, operation group_by",
    "  - \"summary\" / \"overview\" / \"net\" for a month -> table transactions, operation monthly_summary",
    "  - questions about goals or budgets themselves (not transactions) -> table goals or budgets",
    "",
    `Today's date is ${isoDate(now)}. Resolve relative dates ("last month", "this month") into filters.month as YYYY-MM.`,
    defaultMonth
      ? `If the question does not name a month, default filters.month to ${defaultMonth} (the month currently open in the app).`
      : "If the question does not name or imply a month, omit filters.month entirely.",
    "",
    `User question: ${question}`,
  ].join("\n");
}

/**
 * Turns a natural-language finance question into a structured plan.
 * Returns the raw parsed JSON — it is NOT validated here. Validation
 * against the allowlist happens one step later, in planSchema.validatePlan,
 * so a malformed or out-of-bounds plan never reaches the database.
 */
export async function planFinanceQuery(question: string, now: Date, defaultMonth?: string): Promise<unknown> {
  const text = await generateWithGemini({
    prompt: buildPrompt(question, now, defaultMonth),
    temperature: 0.1,
    maxOutputTokens: 512,
    responseSchema: financePlanResponseSchema,
  });

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Planner LLM returned invalid JSON");
  }
}
