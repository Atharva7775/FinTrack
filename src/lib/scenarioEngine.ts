/**
 * Deterministic financial modeling engine: 12-month cash flow and savings projection.
 * Baseline from income, fixed/variable expenses, current savings, goals.
 * Scenario = baseline + user-defined adjustments (e.g. higher rent, new car, reduced dining).
 */

export interface ScenarioAdjustment {
  id: string;
  label: string;
  type: "income" | "expense";
  category?: string; // for expense: category name; for income: e.g. "Salary"
  amountDelta: number; // positive = more income or more expense (e.g. +200 rent)
}

export interface BaselineInputs {
  monthlyIncome: number;
  expensesByCategory: Record<string, number>; // category -> monthly amount
  currentSavings: number;
  goals: { monthlyContribution: number; targetAmount: number; currentAmount: number }[];
}

export interface MonthProjection {
  monthIndex: number;
  monthLabel: string;
  income: number;
  expenses: number;
  netSavings: number;
  cumulativeSavings: number;
  goalContributionsTotal: number;
}

export interface ScenarioResult {
  months: MonthProjection[];
  totalSavingsEnd: number;
  totalGoalContributions: number;
  deficitMonths: number;
  lastMonthRunway: number; // cumulative at end
}

function getMonthLabel(monthIndex: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthIndex);
  return d.toLocaleString("default", { month: "short", year: "2-digit" });
}

function applyAdjustments(
  baseIncome: number,
  baseExpenses: Record<string, number>,
  adjustments: ScenarioAdjustment[]
): { income: number; expenses: Record<string, number> } {
  let income = baseIncome;
  const expenses = { ...baseExpenses };
  for (const a of adjustments) {
    if (a.type === "income") {
      income += a.amountDelta;
    } else {
      const cat = a.category ?? "Other";
      expenses[cat] = (expenses[cat] ?? 0) + a.amountDelta;
    }
  }
  return { income, expenses };
}

function totalExpenses(exp: Record<string, number>): number {
  return Object.values(exp).reduce((s, v) => s + v, 0);
}

/**
 * Run 12-month projection for given baseline (or baseline + scenario adjustments).
 */
export function runProjection(
  inputs: BaselineInputs,
  adjustments: ScenarioAdjustment[] = [],
  numMonths: number = 12
): ScenarioResult {
  const { income: monthlyIncome, expenses: expensesByCategory } = applyAdjustments(
    inputs.monthlyIncome,
    inputs.expensesByCategory,
    adjustments
  );
  const totalMonthlyExpense = totalExpenses(expensesByCategory);
  const monthlyNet = monthlyIncome - totalMonthlyExpense;
  const goalMonthlyTotal = inputs.goals.reduce((s, g) => s + g.monthlyContribution, 0);

  const months: MonthProjection[] = [];
  let cumulative = inputs.currentSavings;
  let deficitMonths = 0;
  for (let i = 0; i < numMonths; i++) {
    const net = monthlyNet;
    if (net < 0) deficitMonths++;
    cumulative += net;
    months.push({
      monthIndex: i + 1,
      monthLabel: getMonthLabel(i),
      income: monthlyIncome,
      expenses: totalMonthlyExpense,
      netSavings: net,
      cumulativeSavings: cumulative,
      goalContributionsTotal: goalMonthlyTotal,
    });
  }

  return {
    months,
    totalSavingsEnd: cumulative,
    totalGoalContributions: goalMonthlyTotal * numMonths,
    deficitMonths,
    lastMonthRunway: cumulative,
  };
}
