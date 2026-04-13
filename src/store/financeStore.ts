import { create } from 'zustand';

export type TransactionType = 'income' | 'expense';

export type Category =
  | 'Salary' | 'Freelance' | 'Investments' | 'Other Income'
  | 'Rent' | 'Food' | 'Travel' | 'Subscriptions' | 'Shopping'
  | 'Utilities' | 'Healthcare' | 'Entertainment' | 'Education' | 'Savings' | 'Other';

export const incomeCategories: Category[] = ['Salary', 'Freelance', 'Investments', 'Other Income'];
export const expenseCategories: Category[] = ['Rent', 'Food', 'Travel', 'Subscriptions', 'Shopping', 'Utilities', 'Healthcare', 'Entertainment', 'Education', 'Savings', 'Other'];

export type CategoryType = 'essential' | 'optional';

export const CATEGORY_TYPE: Record<Category, CategoryType> = {
  Salary: 'essential',
  Freelance: 'essential',
  Investments: 'essential',
  'Other Income': 'essential',
  Rent: 'essential',
  Utilities: 'essential',
  Healthcare: 'essential',
  Education: 'essential',
  Food: 'optional',
  Travel: 'optional',
  Subscriptions: 'optional',
  Shopping: 'optional',
  Entertainment: 'optional',
  Savings: 'essential',
  Other: 'optional',
};

export const categoryColors: Record<Category, string> = {
  Salary: 'hsl(172, 66%, 38%)',
  Freelance: 'hsl(172, 80%, 48%)',
  Investments: 'hsl(234, 62%, 56%)',
  'Other Income': 'hsl(172, 50%, 55%)',
  Rent: 'hsl(12, 76%, 58%)',
  Food: 'hsl(38, 92%, 50%)',
  Travel: 'hsl(234, 62%, 56%)',
  Subscriptions: 'hsl(292, 60%, 50%)',
  Shopping: 'hsl(330, 65%, 55%)',
  Utilities: 'hsl(200, 60%, 50%)',
  Healthcare: 'hsl(0, 72%, 55%)',
  Entertainment: 'hsl(270, 55%, 55%)',
  Education: 'hsl(190, 65%, 45%)',
  Savings: 'hsl(142, 52%, 42%)',
  Other: 'hsl(210, 10%, 55%)',
};

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: Category;
  date: string;
  note: string;
  isSplitwise?: boolean;
  splitwiseId?: number;
  originalCurrency?: string;
  originalAmount?: number;
  usdAmount?: number;
  isPending?: boolean;
}

export interface GoalContribution {
  date: string; // YYYY-MM-DD
  amount: number;
}

export interface GoalMilestone {
  label: string;
  amount: number;
}

export type GoalType = 'savings' | 'budget';

export interface GoalMember {
  email: string;
  status: 'invited' | 'active';
  name?: string;
}

export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  monthlyContribution: number;
  contributions?: GoalContribution[];
  milestones?: GoalMilestone[];
  type?: GoalType;
  isShared?: boolean;
  members?: GoalMember[];
}

// User-editable category type overrides
export type UserCategoryTypeOverrides = Partial<Record<Category, CategoryType>>;

export interface Budget {
  id: string;
  category: Category;
  /** 'percentage' = % of monthly income; 'fixed' = fixed dollar limit */
  type: 'percentage' | 'fixed';
  percentage?: number;      // set when type === 'percentage'
  fixedAmount?: number;     // set when type === 'fixed'
  rolloverBalance: number;  // unused amount carried forward from previous month
  alertThreshold: number;   // % usage at which to show alert (default 80)
}

export interface BudgetStatus {
  category: Category;
  limitAmount: number;      // computed $ limit this month (including rollover)
  spent: number;            // total spent this month in this category
  remaining: number;        // limitAmount - spent (floored at 0)
  percentageUsed: number;   // spent / limitAmount * 100
  dailyAllowance: number;   // remaining / days left in month
  projectedSpend: number;   // extrapolated full-month spend at current burn rate
  status: 'ok' | 'warning' | 'danger' | 'exceeded';
  isInRedZone: boolean;     // true when status is 'danger' or 'exceeded'
}

export interface HydratePayload {
  transactions: Transaction[];
  goals: Goal[];
  savingsBalance: number;
  splitwiseKey: string | null;
  splitwiseLastSync: string | null;
  splitwiseBalances: { owe: number; owed: number } | null;
  viewMode: "personal" | "splitwise";
  budgetSplit?: [number, number, number]; // [needs, wants, savings] as percentages (0-100)
  budgets?: Budget[]; // per-category monthly budgets
}

interface FinanceStore {
  transactions: Transaction[];
  goals: Goal[];
  savingsBalance: number;
  splitwiseKey: string | null;
  splitwiseLastSync: string | null;
  splitwiseBalances: { owe: number; owed: number } | null;
  viewMode: "personal" | "splitwise";
  budgetSplit: [number, number, number];
  setBudgetSplit: (split: [number, number, number]) => void;
  setViewMode: (mode: "personal" | "splitwise") => void;
  setSplitwiseKey: (key: string | null) => void;
  setSplitwiseLastSync: (dateStr: string) => void;
  setSplitwiseBalances: (balances: { owe: number; owed: number } | null) => void;
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
  splitwiseKey: null,
  splitwiseLastSync: null,
  splitwiseBalances: null,
  viewMode: "personal",
  budgetSplit: [50, 30, 20],
  hasOnboarded: false,
  setHasOnboarded: (v) => set({ hasOnboarded: v }),
  isHydrated: false,
  setIsHydrated: (v) => set({ isHydrated: v }),
  budgets: [],
  setBudgets: (budgets) => set({ budgets, hasBudgetSetup: budgets.length > 0 }),
  addBudget: (b) => set((s) => {
    const budget = { ...b, id: String(nextId++) };
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
  setViewMode: (mode) => set({ viewMode: mode }),
  setSplitwiseKey: (key) => set({ splitwiseKey: key }),
  setSplitwiseLastSync: (dateStr) => set({ splitwiseLastSync: dateStr }),
  setSplitwiseBalances: (balances) => set({ splitwiseBalances: balances }),
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
      splitwiseKey: payload.splitwiseKey,
      splitwiseLastSync: payload.splitwiseLastSync,
      splitwiseBalances: payload.splitwiseBalances,
      viewMode: payload.viewMode,
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
      splitwiseKey: null,
      splitwiseLastSync: null,
      splitwiseBalances: null,
      viewMode: "personal",
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
  const today = new Date();
  const daysElapsed = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(daysInMonth - daysElapsed, 0);

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
