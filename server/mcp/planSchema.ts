import { z } from "zod";

export const ALLOWED_TABLES = ["transactions", "goals", "budgets"] as const;
export const ALLOWED_OPERATIONS = [
  "sum",
  "avg",
  "count",
  "group_by",
  "top_n",
  "monthly_summary",
] as const;
export const ALLOWED_METRICS = [
  "amount",
  "target_amount",
  "current_amount",
  "monthly_contribution",
  "fixed_amount",
] as const;

const METRICS_BY_TABLE: Record<(typeof ALLOWED_TABLES)[number], readonly string[]> = {
  transactions: ["amount"],
  goals: ["target_amount", "current_amount", "monthly_contribution"],
  budgets: ["fixed_amount"],
};

/**
 * The shape a Planner LLM is allowed to hand back. This is the plan itself,
 * never SQL and never a user identity — user_email is injected by the
 * Executor from the verified auth context, and .strict() means any extra
 * field the model invents (a stray user_email, a raw "sql" string, ...)
 * fails validation instead of being silently trusted.
 */
export const financePlanSchema = z
  .object({
    table: z.enum(ALLOWED_TABLES),
    operation: z.enum(ALLOWED_OPERATIONS),
    metric: z.enum(ALLOWED_METRICS).optional(),
    filters: z
      .object({
        type: z.enum(["income", "expense"]).optional(),
        category: z.string().min(1).max(60).optional(),
        month: z
          .string()
          .regex(/^20\d{2}-\d{2}$/, "month must be YYYY-MM")
          .optional(),
      })
      .strict()
      .optional(),
    limit: z.number().int().min(1).max(10).optional(),
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (plan.operation === "monthly_summary" && plan.table !== "transactions") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "monthly_summary only applies to the transactions table",
      });
    }
    if ((plan.operation === "group_by" || plan.operation === "top_n") && plan.table !== "transactions") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "group_by/top_n are only supported on the transactions table",
      });
    }
    if (plan.metric && !METRICS_BY_TABLE[plan.table].includes(plan.metric)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `metric "${plan.metric}" is not valid for table "${plan.table}"`,
      });
    }
    if (plan.filters?.type && plan.table !== "transactions") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `table "${plan.table}" has no type filter`,
      });
    }
  });

export type FinancePlan = z.infer<typeof financePlanSchema>;

export type PlanValidationResult =
  | { ok: true; plan: FinancePlan }
  | { ok: false; reason: string };

/** Validates a raw Planner LLM response. Never throws. */
export function validatePlan(raw: unknown): PlanValidationResult {
  const parsed = financePlanSchema.safeParse(raw);
  if (!parsed.success) {
    const reason = parsed.error.issues.map((issue) => issue.message).join("; ");
    return { ok: false, reason: reason || "Plan failed validation" };
  }
  return { ok: true, plan: parsed.data };
}

/**
 * OpenAPI-flavored schema handed to Gemini's `generationConfig.responseSchema`
 * so the Planner LLM is constrained at generation time, not just checked
 * after the fact. Kept in lockstep with financePlanSchema above by hand —
 * there are few enough fields that this is easier to audit than deriving one
 * from the other.
 */
export const financePlanResponseSchema = {
  type: "object",
  properties: {
    table: { type: "string", enum: ALLOWED_TABLES },
    operation: { type: "string", enum: ALLOWED_OPERATIONS },
    metric: { type: "string", enum: ALLOWED_METRICS },
    filters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense"] },
        category: { type: "string" },
        month: { type: "string", description: "YYYY-MM" },
      },
    },
    limit: { type: "integer" },
  },
  required: ["table", "operation"],
};
