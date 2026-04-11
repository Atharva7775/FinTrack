# Insights Overview — Backup

Restore this into the `<TabsContent value="overview">` block in `Insights.tsx` when needed.

---

## Imports needed

```tsx
import { useFinanceStore } from "@/store/financeStore";
import { CursorTooltip } from "@/components/CursorTooltip";
import { getCurrentMonthKey, getPrevMonthKey } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info } from "lucide-react";
```

---

## Field guides

```tsx
const DASHBOARD_FIELD_GUIDE = [
  { term: "Total Income", description: "Total money received this month from salary, freelance, investments, and other income sources." },
  { term: "Total Expenses", description: "Total money spent this month across all expense categories (rent, food, travel, subscriptions, etc.)." },
  { term: "Net Savings", description: "Income minus expenses for this month. Positive means you saved; negative means you spent more than you earned." },
  { term: "Savings Rate", description: "Percentage of your income that you saved this month (Net savings ÷ Total income × 100)." },
  { term: "Income vs Expenses", description: "Bar chart comparing your total income and total expenses for each of the last few months." },
  { term: "Expense Breakdown", description: "Pie chart showing how this month's expenses are split by category (e.g. rent, food, travel)." },
  { term: "Savings Trend", description: "Line chart showing your net savings (income minus expenses) for each of the last few months." },
];

const INSIGHTS_FIELD_GUIDE = [
  { term: "Safe to Spend", description: "Needs budget (from your split) minus actual essential expenses for this month." },
  { term: "Monthly Goal Contributions", description: "Sum of monthly contributions set for all your savings goals. Total you plan to put toward goals each month." },
  { term: "Expense Trend", description: "Percentage change in expenses compared to last month. Positive means you spent more; negative means you spent less." },
  { term: "Spending Insights", description: "Automatically generated tips and alerts based on your spending and goals (e.g. expense changes, category spikes, goal progress)." },
];
```

---

## Logic (inside Insights component)

```tsx
const { transactions: allTx, goals, viewMode, budgetSplit } = useFinanceStore();

const transactions = useMemo(
  () => allTx.filter((t) => (viewMode === "splitwise" ? t.isSplitwise : !t.isSplitwise)),
  [allTx, viewMode]
);

const allMonths = useMemo(() => {
  const months = new Set<string>();
  transactions.forEach((t) => months.add(t.date.slice(0, 7)));
  return Array.from(months).sort().reverse();
}, [transactions]);

const [selectedMonth, setSelectedMonth] = useState(() => allMonths[0] || getCurrentMonthKey());

useEffect(() => {
  if (allMonths.length > 0 && !allMonths.includes(selectedMonth)) {
    setSelectedMonth(allMonths[0]);
  }
}, [allMonths]);

const currentMonth = selectedMonth;
const prevMonth = useMemo(() => {
  const idx = allMonths.indexOf(selectedMonth);
  return allMonths[idx + 1] || getPrevMonthKey();
}, [allMonths, selectedMonth]);

const current = transactions.filter((t) => t.date.startsWith(currentMonth));
const prev = transactions.filter((t) => t.date.startsWith(prevMonth));

const curIncome = current.filter((t) => t.type === "income").reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
const curExpense = current.filter((t) => t.type === "expense").reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
const prevExpense = prev.filter((t) => t.type === "expense").reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);

const expenseChange = prevExpense > 0 ? ((curExpense - prevExpense) / prevExpense) * 100 : 0;

const totalGoalMonthly = goals.reduce((s, g) => s + g.monthlyContribution, 0);
const essentialCategories = ['Rent', 'Utilities', 'Healthcare', 'Education'];
const essentialExpenses = current
  .filter((t) => t.type === 'expense' && essentialCategories.includes(t.category))
  .reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
const needsBudget = curIncome * (budgetSplit[0] / 100);
const safeToSpend = needsBudget - essentialExpenses;

const catSpend: Record<string, number> = {};
current.filter((t) => t.type === "expense").forEach((t) => {
  catSpend[t.category] = (catSpend[t.category] || 0) + (t.usdAmount ?? t.amount);
});

const prevCatSpend: Record<string, number> = {};
prev.filter((t) => t.type === "expense").forEach((t) => {
  prevCatSpend[t.category] = (prevCatSpend[t.category] || 0) + (t.usdAmount ?? t.amount);
});

const insights: { text: string; type: "up" | "down" | "warn" | "good" }[] = [];
if (expenseChange > 10) insights.push({ text: `Expenses up ${expenseChange.toFixed(0)}% vs last month`, type: "warn" });
else if (expenseChange < -5) insights.push({ text: `Expenses down ${Math.abs(expenseChange).toFixed(0)}% vs last month — great!`, type: "good" });

Object.entries(catSpend).forEach(([cat, amt]) => {
  const prevAmt = prevCatSpend[cat] || 0;
  if (prevAmt > 0 && amt > prevAmt * 1.3) {
    insights.push({ text: `${cat} spending increased ${((amt / prevAmt - 1) * 100).toFixed(0)}%`, type: "up" });
  }
});

if (safeToSpend < curIncome * 0.2) {
  insights.push({ text: "Your safe-to-spend is below 20% of income", type: "warn" });
}
if (goals.some((g) => g.currentAmount / g.targetAmount >= 0.75)) {
  insights.push({ text: "You're close to reaching one of your goals!", type: "good" });
}

const IconMap = { up: TrendingUp, down: TrendingDown, warn: AlertTriangle, good: CheckCircle };
const colorMap = { up: "text-expense", down: "text-income", warn: "text-warning", good: "text-income" };
const bgMap = { up: "bg-expense-muted", down: "bg-income-muted", warn: "bg-accent", good: "bg-income-muted" };
```

---

## Month selector + info dialog (header row)

```tsx
<div className="flex items-center justify-between gap-4">
  <div>
    <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Insights</h1>
    <p className="text-muted-foreground text-sm mt-1">AI-powered spending analysis & proactive advice</p>
  </div>
  <div className="flex items-center gap-2">
    <label htmlFor="month-select" className="text-sm text-muted-foreground">Month:</label>
    <select
      id="month-select"
      value={selectedMonth}
      onChange={e => setSelectedMonth(e.target.value)}
      className="border rounded px-2 py-1 text-sm bg-background"
    >
      {allMonths.map((m) => (
        <option key={m} value={m}>
          {new Date(m + "-01").toLocaleString('default', { month: 'long', year: 'numeric' })}
        </option>
      ))}
    </select>
    <Dialog>
      <CursorTooltip content="Hover and click to see what each Dashboard and Insights metric means.">
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground hover:text-foreground" aria-label="What do these fields mean?">
            <Info className="h-5 w-5" />
          </Button>
        </DialogTrigger>
      </CursorTooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">What each field means</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2 pr-2 max-h-[60vh] overflow-y-auto">
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dashboard overview</p>
            <ul className="space-y-3">
              {DASHBOARD_FIELD_GUIDE.map(({ term, description }) => (
                <li key={term}>
                  <p className="font-medium text-foreground text-sm">{term}</p>
                  <p className="text-muted-foreground text-sm mt-0.5">{description}</p>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Insights overview</p>
            <ul className="space-y-3">
              {INSIGHTS_FIELD_GUIDE.map(({ term, description }) => (
                <li key={term}>
                  <p className="font-medium text-foreground text-sm">{term}</p>
                  <p className="text-muted-foreground text-sm mt-0.5">{description}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</div>
```

---

## Overview TabsContent (the 3 cards + Spending Insights)

```tsx
<TabsContent value="overview" className="space-y-6 focus-visible:outline-none">
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <CursorTooltip content="Needs budget (from your split) minus actual essential expenses for this month.">
      <motion.div variants={item} className="glass-card rounded-2xl p-5">
        <p className="text-sm text-muted-foreground mb-1">Safe to Spend (after essentials)</p>
        <p className="text-2xl font-display font-bold text-foreground">${safeToSpend.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground mt-1">Needs budget: ${needsBudget.toLocaleString()}<br/>Essentials spent: ${essentialExpenses.toLocaleString()}</p>
      </motion.div>
    </CursorTooltip>
    <CursorTooltip content="Sum of monthly contributions set for all your savings goals.">
      <motion.div variants={item} className="glass-card rounded-2xl p-5">
        <p className="text-sm text-muted-foreground mb-1">Goal Contributions</p>
        <p className="text-2xl font-display font-bold text-foreground">${totalGoalMonthly.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground mt-1">{goals.length} active goals</p>
      </motion.div>
    </CursorTooltip>
    <CursorTooltip content="Percentage change in expenses compared to last month.">
      <motion.div variants={item} className="glass-card rounded-2xl p-5">
        <p className="text-sm text-muted-foreground mb-1">Expense Trend</p>
        <p className={`text-2xl font-display font-bold ${expenseChange > 0 ? "text-expense" : "text-income"}`}>
          {expenseChange > 0 ? "+" : ""}{expenseChange.toFixed(1)}%
        </p>
        <p className="text-xs text-muted-foreground mt-1">vs last month</p>
      </motion.div>
    </CursorTooltip>
  </div>

  <motion.div variants={item} className="space-y-2">
    <h3 className="font-display font-semibold text-foreground">Spending Insights</h3>
    {insights.length === 0 && (
      <p className="text-sm text-muted-foreground">Looking good! No alerts this month.</p>
    )}
    {insights.map((ins, i) => {
      const Icon = IconMap[ins.type];
      return (
        <div key={i} className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className={`p-2 rounded-xl ${bgMap[ins.type]}`}>
            <Icon className={`h-4 w-4 ${colorMap[ins.type]}`} />
          </div>
          <span className="text-sm text-foreground">{ins.text}</span>
        </div>
      );
    })}
  </motion.div>
</TabsContent>
```
