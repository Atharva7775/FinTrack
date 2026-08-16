const FINANCE_INTENT_RE =
  /\b(spend|spent|expense|budget|goal|savings|income|cashflow|financial|finance|transaction|category|monthly|month)\b/i;

/** Cheap keyword gate: is this worth sending to the Planner LLM at all? */
export function isFinanceIntent(inputText: string) {
  return FINANCE_INTENT_RE.test(inputText);
}
