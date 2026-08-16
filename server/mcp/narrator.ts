import { generateWithGemini } from "./geminiClient";
import type { FinancePlan } from "./planSchema";

function buildPrompt(question: string, result: Record<string, unknown>) {
  return [
    "You are FinTrack's finance advisor voice. Answer the user's question in 1-3 short sentences.",
    "Use ONLY the numbers in the query result below — never invent or estimate a number that isn't there.",
    "Be specific and warm. Plain sentences only, no markdown and no bullet points.",
    "",
    `User question: ${question}`,
    `Query result (ground truth): ${JSON.stringify(result)}`,
  ].join("\n");
}

/** Deterministic fallback used if the Narrator LLM call itself fails, so a real answer still reaches the user. */
export function fallbackNarration(plan: FinancePlan, result: Record<string, unknown>): string {
  if (plan.operation === "monthly_summary") {
    const { month, income, expense, net } = result as { month: string; income: number; expense: number; net: number };
    return `For ${month}: income $${income.toFixed(2)}, expenses $${expense.toFixed(2)}, net $${net.toFixed(2)}.`;
  }
  if (plan.operation === "count") {
    return `Count: ${result.count}.`;
  }
  if (plan.operation === "sum" || plan.operation === "avg") {
    const label = plan.operation === "avg" ? "Average" : "Total";
    return `${label}: $${Number(result.value).toFixed(2)}.`;
  }
  if (plan.operation === "group_by" || plan.operation === "top_n") {
    const categories = (result.categories ?? []) as { category: string; amount: number }[];
    if (categories.length === 0) return "No matching transactions were found.";
    return `Top categories: ${categories.map((c) => `${c.category} $${c.amount.toFixed(2)}`).join(", ")}.`;
  }
  return "Here's what I found in your data.";
}

/** Turns a real query result into a natural-language, advisor-style answer. Never sees the database — only this one result. */
export async function narrateAnswer(question: string, plan: FinancePlan, result: Record<string, unknown>): Promise<string> {
  const text = await generateWithGemini({
    prompt: buildPrompt(question, result),
    temperature: 0.4,
    maxOutputTokens: 256,
  });
  return text || fallbackNarration(plan, result);
}
