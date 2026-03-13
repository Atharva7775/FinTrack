import { create } from 'zustand';

export type TransactionType = 'income' | 'expense';

export type Category =
  | 'Salary' | 'Freelance' | 'Investments' | 'Other Income'
  | 'Rent' | 'Food' | 'Travel' | 'Subscriptions' | 'Shopping'
  | 'Utilities' | 'Healthcare' | 'Entertainment' | 'Education' | 'Savings' | 'Other';

export const incomeCategories: Category[] = ['Salary', 'Freelance', 'Investments', 'Other Income'];
export const expenseCategories: Category[] = ['Rent', 'Food', 'Travel', 'Subscriptions', 'Shopping', 'Utilities', 'Healthcare', 'Entertainment', 'Education', 'Savings', 'Other'];

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
}

export interface GoalContribution {
  date: string; // YYYY-MM-DD
  amount: number;
}

export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  monthlyContribution: number;
  contributions?: GoalContribution[];
}

export interface HydratePayload {
  transactions: Transaction[];
  goals: Goal[];
  savingsBalance: number;
}

interface FinanceStore {
  transactions: Transaction[];
  goals: Goal[];
  savingsBalance: number;
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  deleteTransaction: (id: string) => void;
  updateTransaction: (id: string, t: Partial<Transaction>) => void;
  addGoal: (g: Omit<Goal, 'id'>) => void;
  updateGoal: (id: string, g: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  addGoalContribution: (goalId: string, amount: number, date: string) => void;
  setSavingsBalance: (amount: number) => void;
  /** Load data from database; also resets nextId from max existing id */
  hydrate: (payload: HydratePayload) => void;
}

let nextId = 1;

export const useFinanceStore = create<FinanceStore>((set) => ({
  transactions: [],
  goals: [],
  savingsBalance: 0,
  addTransaction: (t) => set((s) => ({
    transactions: [{ ...t, id: String(nextId++) }, ...s.transactions],
  })),
  deleteTransaction: (id) => set((s) => ({
    transactions: s.transactions.filter((t) => t.id !== id),
  })),
  updateTransaction: (id, updates) => set((s) => ({
    transactions: s.transactions.map((t) => t.id === id ? { ...t, ...updates } : t),
  })),
  addGoal: (g) => set((s) => ({
    goals: [...s.goals, { ...g, id: String(nextId++), contributions: [] }],
  })),
  updateGoal: (id, updates) => set((s) => ({
    goals: s.goals.map((g) => g.id === id ? { ...g, ...updates } : g),
  })),
  deleteGoal: (id) => set((s) => ({
    goals: s.goals.filter((g) => g.id !== id),
  })),
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
    set({ transactions: payload.transactions, goals: payload.goals, savingsBalance: payload.savingsBalance });
  },
}));
