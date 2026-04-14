import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useFinanceStore, selectBudgetStatuses } from "@/store/financeStore";
import { useChatStore } from "@/store/chatStore";

/**
 * Runs once per mount (and whenever transactions change) and fires toast
 * alerts for any budget categories that have crossed their alertThreshold
 * or are exceeded. Each category only fires once per page session to avoid
 * repeated toasting.
 */
export function useBudgetAlerts() {
  const navigate = useNavigate();
  const { budgets, transactions, goals } = useFinanceStore();
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt);
  const alertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (budgets.length === 0) return;

    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    // Derive monthly income after reserving savings-goal contributions ("pay yourself first")
    const rawIncome = transactions
      .filter((t) => t.type === "income" && t.date.startsWith(month))
      .reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
    const totalGoalSavings = goals.reduce((s, g) => s + g.monthlyContribution, 0);
    const monthlyIncome = Math.max(rawIncome - totalGoalSavings, 0);

    const statuses = selectBudgetStatuses(budgets.filter(b => b.month === month), transactions, monthlyIncome, month);

    for (const s of statuses) {
      if (s.status === "ok") continue;
      const key = `${s.category}-${month}-${s.status}`;
      if (alertedRef.current.has(key)) continue;
      alertedRef.current.add(key);

      const pct = Math.round(s.percentageUsed);
      const label =
        s.status === "exceeded"
          ? `🚨 ${s.category} budget exceeded! (${pct}% used)`
          : s.status === "danger"
          ? `⚠️ ${s.category} budget at ${pct}% — only $${s.remaining.toFixed(0)} left`
          : `${s.category} budget at ${pct}% — $${s.remaining.toFixed(0)} remaining`;

      const prompt = `My ${s.category} budget is at ${pct}% for ${month}. I've spent $${s.spent.toFixed(2)} of $${s.limitAmount.toFixed(2)}. Help me cut spending.`;

      toast(label, {
        duration: 8000,
        action: {
          label: "Fix it ↗",
          onClick: () => {
            setPendingPrompt(prompt);
            navigate("/scenario-lab");
          },
        },
      });
    }
  }, [budgets, transactions, navigate, setPendingPrompt]);
}
