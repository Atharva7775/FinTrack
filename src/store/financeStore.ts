import { create } from 'zustand';

export type TransactionType = 'income' | 'expense';

export type Category =
  | 'Salary' | 'Freelance' | 'Investments' | 'Other Income'
  | 'Rent' | 'Food' | 'Travel' | 'Subscriptions' | 'Shopping'
  | 'Utilities' | 'Healthcare' | 'Entertainment' | 'Education' | 'Other';

export const incomeCategories: Category[] = ['Salary', 'Freelance', 'Investments', 'Other Income'];
export const expenseCategories: Category[] = ['Rent', 'Food', 'Travel', 'Subscriptions', 'Shopping', 'Utilities', 'Healthcare', 'Entertainment', 'Education', 'Other'];

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

export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  monthlyContribution: number;
}

interface FinanceStore {
  transactions: Transaction[];
  goals: Goal[];
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  deleteTransaction: (id: string) => void;
  updateTransaction: (id: string, t: Partial<Transaction>) => void;
  addGoal: (g: Omit<Goal, 'id'>) => void;
  updateGoal: (id: string, g: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
}

const sampleTransactions: Transaction[] = [
  { id: '1', type: 'income', amount: 5200, category: 'Salary', date: '2026-02-01', note: 'Monthly salary' },
  { id: '2', type: 'income', amount: 800, category: 'Freelance', date: '2026-02-05', note: 'Design project' },
  { id: '3', type: 'expense', amount: 1400, category: 'Rent', date: '2026-02-01', note: 'Apartment rent' },
  { id: '4', type: 'expense', amount: 320, category: 'Food', date: '2026-02-03', note: 'Groceries' },
  { id: '5', type: 'expense', amount: 150, category: 'Subscriptions', date: '2026-02-02', note: 'Software subs' },
  { id: '6', type: 'expense', amount: 200, category: 'Travel', date: '2026-02-07', note: 'Weekend trip gas' },
  { id: '7', type: 'expense', amount: 85, category: 'Entertainment', date: '2026-02-10', note: 'Concert tickets' },
  { id: '8', type: 'expense', amount: 120, category: 'Shopping', date: '2026-02-12', note: 'New shoes' },
  { id: '9', type: 'income', amount: 300, category: 'Investments', date: '2026-02-15', note: 'Dividend payout' },
  { id: '10', type: 'expense', amount: 95, category: 'Utilities', date: '2026-02-01', note: 'Electric bill' },
  // January
  { id: '11', type: 'income', amount: 5200, category: 'Salary', date: '2026-01-01', note: 'Monthly salary' },
  { id: '12', type: 'income', amount: 600, category: 'Freelance', date: '2026-01-10', note: 'Logo design' },
  { id: '13', type: 'expense', amount: 1400, category: 'Rent', date: '2026-01-01', note: 'Apartment rent' },
  { id: '14', type: 'expense', amount: 280, category: 'Food', date: '2026-01-05', note: 'Groceries' },
  { id: '15', type: 'expense', amount: 150, category: 'Subscriptions', date: '2026-01-02', note: 'Software subs' },
  { id: '16', type: 'expense', amount: 450, category: 'Travel', date: '2026-01-20', note: 'Flight tickets' },
  { id: '17', type: 'expense', amount: 90, category: 'Utilities', date: '2026-01-01', note: 'Electric bill' },
];

const sampleGoals: Goal[] = [
  { id: '1', title: 'Emergency Fund', targetAmount: 10000, currentAmount: 4500, deadline: '2026-08-01', monthlyContribution: 800 },
  { id: '2', title: 'Vacation Fund', targetAmount: 3000, currentAmount: 1200, deadline: '2026-06-01', monthlyContribution: 450 },
  { id: '3', title: 'New Laptop', targetAmount: 2000, currentAmount: 1600, deadline: '2026-04-01', monthlyContribution: 200 },
];

let nextId = 100;

export const useFinanceStore = create<FinanceStore>((set) => ({
  transactions: sampleTransactions,
  goals: sampleGoals,
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
    goals: [...s.goals, { ...g, id: String(nextId++) }],
  })),
  updateGoal: (id, updates) => set((s) => ({
    goals: s.goals.map((g) => g.id === id ? { ...g, ...updates } : g),
  })),
  deleteGoal: (id) => set((s) => ({
    goals: s.goals.filter((g) => g.id !== id),
  })),
}));
