import { McpToolRegistry } from "./registry";
import { monthlySummaryTool } from "./tools/monthlySummary";
import { textToSqlFinanceTool } from "./tools/textToSqlFinance";

const FINANCE_INTENT_RE =
  /\b(spend|spent|expense|budget|goal|savings|income|cashflow|financial|finance|transaction|category|monthly|month)\b/i;

export function isFinanceIntent(inputText: string) {
  return FINANCE_INTENT_RE.test(inputText);
}

export function pickFinanceTool(inputText: string) {
  const q = inputText.toLowerCase();
  if (q.includes("summary") || q.includes("overview") || q.includes("net")) {
    return "finance.monthly_summary";
  }
  return "finance.text_to_sql";
}

export function createMcpServer() {
  const registry = new McpToolRegistry();
  registry.register(textToSqlFinanceTool);
  registry.register(monthlySummaryTool);
  return registry;
}
