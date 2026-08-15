import { create } from 'zustand';
import type {
  TransactionType,
  Category,
  CategoryType,
  Transaction,
  GoalContribution,
  GoalMilestone,
  GoalType,
  GoalMember,
  Goal,
  UserCategoryTypeOverrides,
  Budget,
  BudgetStatus,
  HydratePayload,
} from '@fintrack/shared-types';
import {
  incomeCategories,
  expenseCategories,
  CATEGORY_TYPE,
  categoryColors,
} from '@fintrack/shared-types';

// Re-export so existing imports like `import { type Budget } from '@/store/financeStore'` keep working.
export type {
  TransactionType,
  Category,
  CategoryType,
  Transaction,
  GoalContribution,
  GoalMilestone,
  GoalType,
  GoalMember,
  Goal,
  UserCategoryTypeOverrides,
  Budget,
  BudgetStatus,
  HydratePayload,
};
export { incomeCategories, expenseCategories, CATEGORY_TYPE, categoryColors };


interface FinanceStore {
  transactions: Transaction[];
  goals: Goal[];
  savingsBalance: number;
  budgetSplit: [number, number, number];
  setBudgetSplit: (split: [number, number, number]) => void;
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  deleteTransaction: (id: string) => void;
  updateTransaction: (id: string, t: Partial<Transaction>) => void;
  addGoal: (g: Omit<Goal, 'id'>) => void;
  updateGoal: (id: string, g: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  addGoalContribution: (goalId: string, amount: number, date: string) => void;
  setSavingsBalance: (amount: number) => void;
  /** Whether the current user has completed or skipped onboarding */
  hasOnboarded: boolean;
  setHasOnboarded: (v: boolean) => void;
  /** Whether SupabaseSync has finished its initial data fetch */
  isHydrated: boolean;
  setIsHydrated: (v: boolean) => void;
  /** Per-category monthly budgets */
  budgets: Budget[];
  setBudgets: (budgets: Budget[]) => void;
  addBudget: (b: Omit<Budget, 'id'>) => void;
  updateBudget: (id: string, changes: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  /** True once the user has saved at least one budget */
  hasBudgetSetup: boolean;
  setHasBudgetSetup: (v: boolean) => void;
  /** Load data from database; also resets nextId from max existing id */
  hydrate: (payload: HydratePayload) => void;
  /** Reset store to empty state (used on sign-out or user change) */
  clearStore: () => void;
  userCategoryType: UserCategoryTypeOverrides;
  setCategoryType: (category: Category, type: CategoryType) => void;
}

let nextId = 1;

export const useFinanceStore = create<FinanceStore>((set, get) => ({
  transactions: [],
  goals: [],
  savingsBalance: 0,
  budgetSplit: [50, 30, 20],
  hasOnboarded: false,
  setHasOnboarded: (v) => set({ hasOnboarded: v }),
  isHydrated: false,
  setIsHydrated: (v) => set({ isHydrated: v }),
  budgets: [],
  setBudgets: (budgets) => set({ budgets, hasBudgetSetup: budgets.length > 0 }),
  addBudget: (b) => set((s) => {
    const budget = { ...b, id: crypto.randomUUID() };
    return { budgets: [...s.budgets, budget], hasBudgetSetup: true };
  }),
  updateBudget: (id, changes) => set((s) => ({
    budgets: s.budgets.map((b) => b.id === id ? { ...b, ...changes } : b),
  })),
  deleteBudget: (id) => set((s) => {
    const next = s.budgets.filter((b) => b.id !== id);
    return { budgets: next, hasBudgetSetup: next.length > 0 };
  }),
  hasBudgetSetup: false,
  setHasBudgetSetup: (v) => set({ hasBudgetSetup: v }),
  setBudgetSplit: (split) => set({ budgetSplit: split }),
  addTransaction: (t) => set((s) => ({
    transactions: [{ ...t, id: String(nextId++) }, ...s.transactions],
  })),
  deleteTransaction: (id) => set((s) => ({
    transactions: s.transactions.filter((t) => t.id !== id),
  })),
  updateTransaction: (id, updates) => set((s) => ({
    transactions: s.transactions.map((t) => t.id === id ? { ...t, ...updates } : t),
  })),
  /** Add a new goal to the store */
  addGoal: (g) => set((s) => ({
    goals: [...s.goals, { ...g, id: String(nextId++), contributions: [] }],
  })),
  /** Edit a transaction by id */
  editTransaction: (id, updates) => set((s) => ({
    transactions: s.transactions.map((t) => t.id === id ? { ...t, ...updates } : t),
  })),
  updateGoal: (id, updates) => set((s) => ({
    goals: s.goals.map((g) => g.id === id ? { ...g, ...updates } : g),
  })),
  deleteGoal: async (id) => {
    set((s) => ({
      goals: s.goals.filter((g) => g.id !== id),
    }));
  },
  addGoalContribution: (goalId, amount, date) => set((s) => {
    const goal = s.goals.find((g) => g.id === goalId);
    const title = goal?.title ?? 'Goal';
    const newTx: Omit<Transaction, 'id'> = {
      type: 'expense',
      amount,
      category: 'Savings',
      date,
      note: `Contribution to ${title}`,
    };
    return {
      transactions: [{ ...newTx, id: String(nextId++) }, ...s.transactions],
      goals: s.goals.map((g) => {
        if (g.id !== goalId) return g;
        const contributions = [...(g.contributions || []), { date, amount }];
        return { ...g, currentAmount: g.currentAmount + amount, contributions };
      }),
    };
  }),
  setSavingsBalance: (amount) => set({ savingsBalance: amount }),
  hydrate: (payload) => {
    let maxId = 0;
    payload.transactions.forEach((t) => { const n = parseInt(t.id, 10); if (!isNaN(n)) maxId = Math.max(maxId, n); });
    payload.goals.forEach((g) => { const n = parseInt(g.id, 10); if (!isNaN(n)) maxId = Math.max(maxId, n); });
    nextId = maxId + 1;
    const budgets = payload.budgets ?? [];
    set({ 
      transactions: payload.transactions, 
      goals: payload.goals, 
      savingsBalance: payload.savingsBalance,
      budgetSplit: payload.budgetSplit || [50, 30, 20],
      budgets,
      hasBudgetSetup: budgets.length > 0,
    });
  },
  clearStore: () => {
    nextId = 1;
    set({
      transactions: [],
      goals: [],
      savingsBalance: 0,
      budgetSplit: [50, 30, 20],
      userCategoryType: {},
      hasOnboarded: false,
      isHydrated: false,
      budgets: [],
      hasBudgetSetup: false,
    });
  },
  userCategoryType: {},
  setCategoryType: (category, type) => set((s) => ({
    userCategoryType: { ...s.userCategoryType, [category]: type },
  })),
}));
// ─── Selectors ───────────────────────────────────────────────────────────────

export function selectExpenseAutopsy(transactions: Transaction[], monthKey: string) {
  const monthTx = transactions.filter(t => t.date.startsWith(monthKey) && t.type === 'expense');
  
  // Calculate previous month for MoM comparison
  const d = new Date(`${monthKey}-01`);
  d.setMonth(d.getMonth() - 1);
  const prevMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prevMonthTx = transactions.filter(t => t.date.startsWith(prevMonthKey) && t.type === 'expense');

  const totalExpenses = monthTx.reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
  
  const categorySummary = expenseCategories.map(cat => {
    const amount = monthTx.filter(t => t.category === cat).reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
    const prevAmount = prevMonthTx.filter(t => t.category === cat).reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
    
    let momDelta = null;
    if (prevAmount > 0) {
      momDelta = ((amount - prevAmount) / prevAmount) * 100;
    }

    return {
      category: cat,
      type: CATEGORY_TYPE[cat],
      amount,
      momDelta
    };
  }).filter(c => c.amount > 0);

  const essentialTotal = categorySummary.filter(c => c.type === 'essential').reduce((s, c) => s + c.amount, 0);
  const optionalTotal = categorySummary.filter(c => c.type === 'optional').reduce((s, c) => s + c.amount, 0);

  return {
    totalExpenses,
    essentialTotal,
    optionalTotal,
    categories: categorySummary.sort((a, b) => b.amount - a.amount)
  };
}

/**
 * Pure selector: compute per-category budget status for the given month (YYYY-MM).
 * monthlyIncome is the total income for that month (used for percentage-type budgets).
 */
export function selectBudgetStatuses(
  budgets: Budget[],
  transactions: Transaction[],
  monthlyIncome: number,
  month: string  // YYYY-MM
): BudgetStatus[] {
  const expenses = transactions.filter(
    (t) => t.type === 'expense' && t.date.startsWith(month)
  );

  // For past months: treat the whole month as elapsed
  const today = new Date();
  const [mYear, mMonth] = month.split('-').map(Number);
  const isPastMonth =
    mYear < today.getFullYear() ||
    (mYear === today.getFullYear() && mMonth < today.getMonth() + 1);
  const daysInMonth = new Date(mYear, mMonth, 0).getDate();
  const daysElapsed = isPastMonth ? daysInMonth : today.getDate();
  const daysLeft = isPastMonth ? 0 : Math.max(daysInMonth - daysElapsed, 0);

  return budgets.map((b) => {
    const base =
      b.type === 'percentage'
        ? ((b.percentage ?? 0) / 100) * monthlyIncome
        : (b.fixedAmount ?? 0);
    const limitAmount = base + b.rolloverBalance;

    const spent = expenses
      .filter((t) => t.category === b.category)
      .reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);

    const remaining = Math.max(limitAmount - spent, 0);
    const percentageUsed = limitAmount > 0 ? (spent / limitAmount) * 100 : 0;
    const dailyAllowance = daysLeft > 0 ? remaining / daysLeft : 0;
    const projectedSpend =
      daysElapsed > 0 ? (spent / daysElapsed) * daysInMonth : 0;

    const status: BudgetStatus['status'] =
      percentageUsed >= 100
        ? 'exceeded'
        : percentageUsed >= 90
        ? 'danger'
        : percentageUsed >= (b.alertThreshold ?? 80)
        ? 'warning'
        : 'ok';

    return {
      category: b.category,
      limitAmount,
      spent,
      remaining,
      percentageUsed,
      dailyAllowance,
      projectedSpend,
      status,
      isInRedZone: status === 'danger' || status === 'exceeded',
    };
  });
}
