import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, DollarSign, PiggyBank } from "lucide-react";
import AnimatedCounter from "@/components/AnimatedCounter";
import { useFinanceStore } from "@/store/financeStore";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

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

  const currentMonth = "2026-02";
  const monthTx = transactions.filter((t) => t.date.startsWith(currentMonth));
  const totalIncome = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  // Bar chart data (last 4 months)
  const months = ["2025-11", "2025-12", "2026-01", "2026-02"];
  const monthLabels = ["Nov", "Dec", "Jan", "Feb"];
  const barData = months.map((m, i) => {
    const mt = transactions.filter((t) => t.date.startsWith(m));
    return {
      month: monthLabels[i],
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

  // Line chart (cumulative savings)
  const lineData = months.map((m, i) => {
    const mt = transactions.filter((t) => t.date.startsWith(m));
    const inc = mt.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const exp = mt.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { month: monthLabels[i], Savings: inc - exp };
  });

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">February 2026 overview</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <motion.div variants={item} className="stat-card-income rounded-2xl p-5">
          <div className="relative z-10 flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-income-muted">
              <TrendingUp className="h-5 w-5 text-income" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Total Income</span>
          </div>
          <AnimatedCounter value={totalIncome} className="relative z-10 text-2xl font-display font-bold text-foreground" />
        </motion.div>

        <motion.div variants={item} className="stat-card-expense rounded-2xl p-5">
          <div className="relative z-10 flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-expense-muted">
              <TrendingDown className="h-5 w-5 text-expense" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Total Expenses</span>
          </div>
          <AnimatedCounter value={totalExpense} className="relative z-10 text-2xl font-display font-bold text-foreground" />
        </motion.div>

        <motion.div variants={item} className="stat-card-savings rounded-2xl p-5">
          <div className="relative z-10 flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-savings-muted">
              <PiggyBank className="h-5 w-5 text-savings" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Net Savings</span>
          </div>
          <AnimatedCounter value={netSavings} className="relative z-10 text-2xl font-display font-bold text-foreground" />
        </motion.div>

        <motion.div variants={item} className="stat-card-warning rounded-2xl p-5">
          <div className="relative z-10 flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-accent">
              <DollarSign className="h-5 w-5 text-warning" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Savings Rate</span>
          </div>
          <AnimatedCounter value={savingsRate} suffix="%" decimals={1} prefix="" className="relative z-10 text-2xl font-display font-bold text-foreground" />
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
      </div>
    </motion.div>
  );
}
