import { motion } from "framer-motion";
import { useFinanceStore, categoryColors, type Category } from "@/store/financeStore";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function Insights() {
  const { transactions, goals } = useFinanceStore();

  const currentMonth = "2026-02";
  const prevMonth = "2026-01";
  const current = transactions.filter((t) => t.date.startsWith(currentMonth));
  const prev = transactions.filter((t) => t.date.startsWith(prevMonth));

  const curIncome = current.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const curExpense = current.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const prevExpense = prev.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const expenseChange = prevExpense > 0 ? ((curExpense - prevExpense) / prevExpense) * 100 : 0;

  // Budget allocation suggestion
  const totalGoalMonthly = goals.reduce((s, g) => s + g.monthlyContribution, 0);
  const safeToSpend = curIncome - totalGoalMonthly;

  // Category spending this month
  const catSpend: Record<string, number> = {};
  current.filter((t) => t.type === "expense").forEach((t) => {
    catSpend[t.category] = (catSpend[t.category] || 0) + t.amount;
  });
  const catData = Object.entries(catSpend)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value, fill: categoryColors[name as Category] || "hsl(210,10%,55%)" }));

  // Compare categories month-over-month
  const prevCatSpend: Record<string, number> = {};
  prev.filter((t) => t.type === "expense").forEach((t) => {
    prevCatSpend[t.category] = (prevCatSpend[t.category] || 0) + t.amount;
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

  // Recommended budget allocation
  const budgetSuggestions = [
    { label: "Needs (50%)", amount: curIncome * 0.5 },
    { label: "Wants (30%)", amount: curIncome * 0.3 },
    { label: "Savings (20%)", amount: curIncome * 0.2 },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Insights</h1>
        <p className="text-muted-foreground text-sm mt-1">AI-powered spending analysis</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div variants={item} className="glass-card rounded-2xl p-5">
          <p className="text-sm text-muted-foreground mb-1">Safe to Spend</p>
          <p className="text-2xl font-display font-bold text-foreground">${safeToSpend.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">After goals & savings</p>
        </motion.div>
        <motion.div variants={item} className="glass-card rounded-2xl p-5">
          <p className="text-sm text-muted-foreground mb-1">Monthly Goal Contributions</p>
          <p className="text-2xl font-display font-bold text-foreground">${totalGoalMonthly.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{goals.length} active goals</p>
        </motion.div>
        <motion.div variants={item} className="glass-card rounded-2xl p-5">
          <p className="text-sm text-muted-foreground mb-1">Expense Trend</p>
          <p className={`text-2xl font-display font-bold ${expenseChange > 0 ? "text-expense" : "text-income"}`}>
            {expenseChange > 0 ? "+" : ""}{expenseChange.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">vs last month</p>
        </motion.div>
      </div>

      {/* Insights cards */}
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

      {/* Budget allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={item} className="glass-card rounded-2xl p-6">
          <h3 className="font-display font-semibold text-foreground mb-4">Recommended Budget (50/30/20)</h3>
          <div className="space-y-3">
            {budgetSuggestions.map((b) => (
              <div key={b.label} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{b.label}</span>
                <span className="font-display font-semibold text-foreground">${b.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={item} className="glass-card rounded-2xl p-6">
          <h3 className="font-display font-semibold text-foreground mb-4">Top Spending Categories</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={catData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(210,10%,50%)" }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(210,10%,50%)" }} axisLine={false} tickLine={false} width={90} />
              <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {catData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </motion.div>
  );
}
