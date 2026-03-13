import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, Info, ChevronLeft, ChevronRight } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";
import { CursorTooltip } from "@/components/CursorTooltip";
import { useFinanceStore } from "@/store/financeStore";
import { getCurrentMonthKey, getMonthLabel, getAvailableMonthKeys, getLastNMonthsEndingAt } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

const DASHBOARD_FIELD_GUIDE = [
  { term: "Total Income", description: "Total money received this month from salary, freelance, investments, and other income sources." },
  { term: "Total Expenses", description: "Total money spent this month across all expense categories (rent, food, travel, subscriptions, etc.)." },
  { term: "Net Savings", description: "Income minus expenses for this month. Positive means you saved; negative means you spent more than you earned." },
  { term: "Savings Rate", description: "Percentage of your income that you saved this month (Net savings ÷ Total income × 100)." },
  { term: "Income vs Expenses", description: "Bar chart comparing your total income and total expenses for each of the last four months." },
  { term: "Expense Breakdown", description: "Pie chart showing how this month's expenses are split by category (e.g. rent, food, travel)." },
  { term: "Savings Trend", description: "Line chart showing your net savings (income minus expenses) for each of the last four months." },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function Dashboard() {
  const transactions = useFinanceStore((s) => s.transactions);
  const availableMonths = useMemo(
    () => getAvailableMonthKeys(transactions.map((t) => t.date)),
    [transactions]
  );
  const currentKey = getCurrentMonthKey();
  const defaultMonth = availableMonths.includes(currentKey) ? currentKey : availableMonths[availableMonths.length - 1] ?? currentKey;
  const [selectedMonthKey, setSelectedMonthKey] = useState(defaultMonth);
  useEffect(() => {
    if (!availableMonths.includes(selectedMonthKey))
      setSelectedMonthKey(availableMonths[availableMonths.length - 1] ?? currentKey);
  }, [availableMonths, selectedMonthKey, currentKey]);

  const selectedMonthIndex = availableMonths.indexOf(selectedMonthKey);
  const canPrev = selectedMonthIndex > 0;
  const canNext = selectedMonthIndex >= 0 && selectedMonthIndex < availableMonths.length - 1;

  const last4Months = getLastNMonthsEndingAt(selectedMonthKey, 4);
  const monthTx = transactions.filter((t) => t.date.startsWith(selectedMonthKey));
  const totalIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  const barData = last4Months.map(({ key, label }) => {
    const mt = transactions.filter((t) => t.date.startsWith(key));
    return {
      month: label,
      Income: mt.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
      Expenses: mt.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    };
  });

  // Pie chart data
  const expenseByCategory: Record<string, number> = {};
  monthTx.filter((t) => t.type === "expense").forEach((t) => {
    expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
  });
  const pieData = Object.entries(expenseByCategory).map(([name, value]) => ({ name, value }));
  const pieColors = ["hsl(12,76%,58%)", "hsl(38,92%,50%)", "hsl(234,62%,56%)", "hsl(292,60%,50%)", "hsl(330,65%,55%)", "hsl(200,60%,50%)", "hsl(0,72%,55%)"];

  const lineData = last4Months.map(({ key, label }) => {
    const mt = transactions.filter((t) => t.date.startsWith(key));
    const inc = mt.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const exp = mt.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { month: label, Savings: inc - exp };
  });

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <CursorTooltip content="Switch to the previous month in your transaction history.">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={!canPrev}
                onClick={() => setSelectedMonthKey(availableMonths[selectedMonthIndex - 1] ?? selectedMonthKey)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </CursorTooltip>
            <span className="text-muted-foreground text-sm min-w-[7rem] text-center font-medium">
              {getMonthLabel(selectedMonthKey)} overview
            </span>
            <CursorTooltip content="Switch to the next month (up to current month).">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={!canNext}
                onClick={() => setSelectedMonthKey(availableMonths[selectedMonthIndex + 1] ?? selectedMonthKey)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CursorTooltip>
          </div>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 rounded-full text-muted-foreground hover:text-foreground" aria-label="What do these fields mean?">
              <Info className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">What each field means</DialogTitle>
            </DialogHeader>
            <ul className="space-y-4 pt-2 pr-2 max-h-[60vh] overflow-y-auto">
              {DASHBOARD_FIELD_GUIDE.map(({ term, description }) => (
                <li key={term}>
                  <p className="font-medium text-foreground text-sm">{term}</p>
                  <p className="text-muted-foreground text-sm mt-0.5">{description}</p>
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <CursorTooltip content="Total money received this month from salary, freelance, investments, and other income sources.">
          <motion.div variants={item} className="stat-card-income rounded-2xl p-5">
            <div className="relative z-10 flex items-center gap-3 mb-3">
              <div className="p-2 rounded-xl bg-income-muted">
                <TrendingUp className="h-5 w-5 text-income" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">Total Income</span>
            </div>
            <AnimatedCounter value={totalIncome} className="relative z-10 text-2xl font-display font-bold text-foreground" />
          </motion.div>
        </CursorTooltip>

        <CursorTooltip content="Total money spent this month across all expense categories (rent, food, travel, etc.).">
          <motion.div variants={item} className="stat-card-expense rounded-2xl p-5">
            <div className="relative z-10 flex items-center gap-3 mb-3">
              <div className="p-2 rounded-xl bg-expense-muted">
                <TrendingDown className="h-5 w-5 text-expense" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">Total Expenses</span>
            </div>
            <AnimatedCounter value={totalExpense} className="relative z-10 text-2xl font-display font-bold text-foreground" />
          </motion.div>
        </CursorTooltip>

        <CursorTooltip content="Income minus expenses for this month. Positive means you saved; negative means you spent more than you earned.">
          <motion.div variants={item} className="stat-card-savings rounded-2xl p-5">
            <div className="relative z-10 flex items-center gap-3 mb-3">
              <div className="p-2 rounded-xl bg-savings-muted">
                <PiggyBank className="h-5 w-5 text-savings" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">Net Savings</span>
            </div>
            <AnimatedCounter value={netSavings} className="relative z-10 text-2xl font-display font-bold text-foreground" />
          </motion.div>
        </CursorTooltip>

        <CursorTooltip content="Percentage of your income that you saved this month. (Net savings ÷ Total income × 100).">
          <motion.div variants={item} className="stat-card-warning rounded-2xl p-5">
            <div className="relative z-10 flex items-center gap-3 mb-3">
              <div className="p-2 rounded-xl bg-accent">
                <DollarSign className="h-5 w-5 text-warning" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">Savings Rate</span>
            </div>
            <AnimatedCounter value={savingsRate} suffix="%" decimals={1} prefix="" className="relative z-10 text-2xl font-display font-bold text-foreground" />
          </motion.div>
        </CursorTooltip>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CursorTooltip content="Bar chart comparing your total income and total expenses for each of the last four months.">
          <motion.div variants={item} className="glass-card rounded-2xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-4">Income vs Expenses</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210,18%,90%)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(210,10%,50%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "hsl(210,10%,50%)" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(210,18%,90%)", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
              />
              <Bar dataKey="Income" fill="hsl(172,66%,38%)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Expenses" fill="hsl(12,76%,58%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </motion.div>
        </CursorTooltip>

        <CursorTooltip content="Pie chart showing how this month’s expenses are split by category (e.g. rent, food, travel).">
          <motion.div variants={item} className="glass-card rounded-2xl p-6">
            <h3 className="font-display font-semibold text-foreground mb-4">Expense Breakdown</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value">
                {pieData.map((_, i) => (
                  <Cell key={i} fill={pieColors[i % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          </motion.div>
        </CursorTooltip>

        <CursorTooltip content="Line chart showing your net savings (income minus expenses) for each of the last four months.">
          <motion.div variants={item} className="glass-card rounded-2xl p-6 lg:col-span-2">
            <h3 className="font-display font-semibold text-foreground mb-4">Savings Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210,18%,90%)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(210,10%,50%)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "hsl(210,10%,50%)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(210,18%,90%)" }} formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]} />
              <Line type="monotone" dataKey="Savings" stroke="hsl(234,62%,56%)" strokeWidth={3} dot={{ fill: "hsl(234,62%,56%)", r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
          </motion.div>
        </CursorTooltip>
      </div>
    </motion.div>
  );
}
