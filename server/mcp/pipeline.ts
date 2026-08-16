import { planFinanceQuery } from "./planner";
import { validatePlan } from "./planSchema";
import { executePlan } from "./executor";
import { narrateAnswer, fallbackNarration } from "./narrator";
import type { McpExecutionContext } from "./types";

export interface PipelineResponse {
  route: "mcp";
  outcome: "answered" | "clarify";
  answer: string;
  data?: unknown;
  meta?: Record<string, unknown>;
}

const CLARIFY_MESSAGE =
  "I couldn't turn that into a query FinTrack understands. Try asking about a total, an average, a count, or your top spending categories for a specific month.";

/**
 * Planner -> Validator -> Executor -> Narrator, in that order.
 * If the Planner fails or the Validator rejects the plan, this short-circuits
 * to a plain "please rephrase" answer without the Executor ever touching the
 * database and without the Narrator ever running.
 */
export async function runFinancePipeline(
  question: string,
  context: McpExecutionContext,
  defaultMonth?: string
): Promise<PipelineResponse> {
  let rawPlan: unknown;
  try {
    rawPlan = await planFinanceQuery(question, context.now, defaultMonth);
  } catch (error) {
    return {
      route: "mcp",
      outcome: "clarify",
      answer: CLARIFY_MESSAGE,
      meta: { stage: "planner", error: error instanceof Error ? error.message : String(error) },
    };
  }

  const validated = validatePlan(rawPlan);
  if (validated.ok === false) {
    return {
      route: "mcp",
      outcome: "clarify",
      answer: CLARIFY_MESSAGE,
      meta: { stage: "validator", reason: validated.reason, rawPlan },
    };
  }

  const { result, sqlPreview } = await executePlan(validated.plan, context);

  let answer: string;
  try {
    answer = await narrateAnswer(question, validated.plan, result);
  } catch {
    answer = fallbackNarration(validated.plan, result);
  }

  return {
    route: "mcp",
    outcome: "answered",
    answer,
    data: result,
    meta: { plan: validated.plan, sqlPreview },
  };
}
