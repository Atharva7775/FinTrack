// Domain types shared between the web app (src/) and the mobile app (mobile/).
// Single source of truth so both clients stay in sync on category/goal/budget shapes.

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
  originalCurrency?: string;
  originalAmount?: number;
  usdAmount?: number;
  isPending?: boolean;
  /** Origin of this transaction row, e.g. 'manual' | 'telegram_bot' | 'mobile_sms' | 'mobile_notification' | 'mobile_email' | 'mobile_spreadsheet' */
  source?: string;
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
  /** YYYY-MM – the month this budget applies to */
  month: string;
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
  budgetSplit?: [number, number, number]; // [needs, wants, savings] as percentages (0-100)
  budgets?: Budget[]; // per-category monthly budgets
}
