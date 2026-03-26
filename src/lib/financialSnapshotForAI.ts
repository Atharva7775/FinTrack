import type { Transaction, Goal } from "@/store/financeStore";
import { getCurrentMonthKey, getPrevMonthKey } from "@/lib/utils";

function txAmount(t: Transaction): number {
  return t.usdAmount ?? t.amount;
}

/** Filter transactions by view mode (same as Dashboard/Transactions). */
export function filterTransactionsForView(
  all: Transaction[],
  viewMode: "personal" | "splitwise"
): Transaction[] {
  return all.filter((t) => (viewMode === "splitwise" ? t.isSplitwise : !t.isSplitwise));
}

export interface FinancialSnapshotForAI {
  viewMode: "personal" | "splitwise";
  savingsBalance: number;
  splitwiseBalances: { owe: number; owed: number } | null;
  currentMonthKey: string;
  previousMonthKey: string;
  currentMonth: {
    income: number;
    expenses: number;
    net: number;
  };
  previousMonth: {
    income: number;
    expenses: number;
    net: number;
  };
  expenseChangeVsPreviousMonthPercent: number;
  insightsStyle: {
    totalGoalMonthlyContributions: number;
    safeToSpend: number;
    recommendedBudget503020: { needs: number; wants: number; savings: number };
    topExpenseCategoriesThisMonth: { category: string; amount: number }[];
  };
  goals: {
    id: string;
    title: string;
    targetAmount: number;
    currentAmount: number;
    progressPercent: number;
    deadline: string;
    monthlyContribution: number;
  }[];
  totalsAllTimeInView: {
    totalIncome: number;
    totalExpenses: number;
    netSavings: number;
  };
  recentTransactions: {
    id: string;
    type: string;
    amount: number;
    category: string;
    date: string;
    note: string;
    isSplitwise?: boolean;
    isPending?: boolean;
    originalCurrency?: string;
  }[];
}

/** Capped to keep Ollama/GPU context small for faster replies. */
const MAX_RECENT = 72;

/**
 * Single JSON snapshot for the AI: mirrors Dashboard / Transactions / Insights / Goals.
 */
export function buildFinancialSnapshotForAI(params: {
  transactions: Transaction[];
  goals: Goal[];
  savingsBalance: number;
  viewMode: "personal" | "splitwise";
  splitwiseBalances: { owe: number; owed: number } | null;
}): FinancialSnapshotForAI {
  const { transactions: allTx, goals, savingsBalance, viewMode, splitwiseBalances } = params;
  const transactions = filterTransactionsForView(allTx, viewMode);

  const currentMonthKey = getCurrentMonthKey();
  const previousMonthKey = getPrevMonthKey();

  const current = transactions.filter((t) => t.date.startsWith(currentMonthKey));
  const previous = transactions.filter((t) => t.date.startsWith(previousMonthKey));

  const curIncome = current.filter((t) => t.type === "income").reduce((s, t) => s + txAmount(t), 0);
  const curExpense = current.filter((t) => t.type === "expense").reduce((s, t) => s + txAmount(t), 0);
  const prevIncome = previous.filter((t) => t.type === "income").reduce((s, t) => s + txAmount(t), 0);
  const prevExpense = previous.filter((t) => t.type === "expense").reduce((s, t) => s + txAmount(t), 0);

  const expenseChangeVsPreviousMonthPercent =
    prevExpense > 0 ? ((curExpense - prevExpense) / prevExpense) * 100 : 0;

  const totalGoalMonthly = goals.reduce((s, g) => s + g.monthlyContribution, 0);
  const safeToSpend = curIncome - totalGoalMonthly;

  const catSpend: Record<string, number> = {};
  current
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      catSpend[t.category] = (catSpend[t.category] || 0) + txAmount(t);
    });
  const topExpenseCategoriesThisMonth = Object.entries(catSpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([category, amount]) => ({ category, amount }));

  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + txAmount(t), 0);
  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + txAmount(t), 0);

  const sortedTx = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sortedTx.slice(-MAX_RECENT);

  return {
    viewMode,
    savingsBalance,
    splitwiseBalances,
    currentMonthKey,
    previousMonthKey,
    currentMonth: {
      income: curIncome,
      expenses: curExpense,
      net: curIncome - curExpense,
    },
    previousMonth: {
      income: prevIncome,
      expenses: prevExpense,
      net: prevIncome - prevExpense,
    },
    expenseChangeVsPreviousMonthPercent,
    insightsStyle: {
      totalGoalMonthlyContributions: totalGoalMonthly,
      safeToSpend,
      recommendedBudget503020: {
        needs: curIncome * 0.5,
        wants: curIncome * 0.3,
        savings: curIncome * 0.2,
      },
      topExpenseCategoriesThisMonth,
    },
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      progressPercent: g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0,
      deadline: g.deadline,
      monthlyContribution: g.monthlyContribution,
    })),
    totalsAllTimeInView: {
      totalIncome,
      totalExpenses,
      netSavings: totalIncome - totalExpenses,
    },
    recentTransactions: recent.map((t) => ({
      id: t.id,
      type: t.type,
      amount: txAmount(t),
      category: t.category,
      date: t.date,
      note: t.note,
      isSplitwise: t.isSplitwise,
      isPending: t.isPending,
      originalCurrency: t.originalCurrency,
    })),
  };
}
