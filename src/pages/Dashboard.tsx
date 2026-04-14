import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, Info, ChevronLeft, ChevronRight, Sparkles, User, Calendar, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import AnimatedCounter from "@/components/AnimatedCounter";
import { CursorTooltip } from "@/components/CursorTooltip";
import { useFinanceStore, selectBudgetStatuses } from "@/store/financeStore";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentMonthKey, getMonthLabel, getAvailableMonthKeys, getLastNMonthsEndingAt } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { transactions: allTx, viewMode, splitwiseBalances, budgets, goals } = useFinanceStore();
  const { user } = useAuth();
  
  const transactions = useMemo(
    () => allTx.filter((t) => (viewMode === "splitwise" ? t.isSplitwise : !t.isSplitwise)),
    [allTx, viewMode]
  );
  
  const availableMonths = useMemo(
    () => getAvailableMonthKeys(transactions.map((t) => t.date)),
    [transactions]
  );

  const currentKey = getCurrentMonthKey();
  const rawMonthlyIncome = transactions
    .filter(t => t.type === 'income' && t.date.startsWith(currentKey))
    .reduce((sum, t) => sum + t.amount, 0);
  const totalGoalSavings = goals.reduce((s, g) => s + g.monthlyContribution, 0);
  const monthlyIncome = Math.max(rawMonthlyIncome - totalGoalSavings, 0);
  const alertBudgets = selectBudgetStatuses(budgets.filter(b => b.month === currentKey), transactions, monthlyIncome, currentKey)
    .filter(bs => bs.status === 'warning' || bs.status === 'danger' || bs.status === 'exceeded');
  const defaultMonth = availableMonths.includes(currentKey) ? currentKey : availableMonths[availableMonths.length - 1] ?? currentKey;
  const [selectedMonthKey, setSelectedMonthKey] = useState(defaultMonth);

  useEffect(() => {
    if (!availableMonths.includes(selectedMonthKey))
      setSelectedMonthKey(availableMonths[availableMonths.length - 1] ?? currentKey);
  }, [availableMonths, selectedMonthKey, currentKey]);

  const selectedMonthIndex = availableMonths.indexOf(selectedMonthKey);
  const monthTx = transactions.filter((t) => t.date.startsWith(selectedMonthKey));
  const last4Months = getLastNMonthsEndingAt(selectedMonthKey, 4);

  const totalIncome = viewMode === "splitwise" 
    ? (splitwiseBalances?.owed ?? 0)
    : monthTx.filter((t) => t.type === "income").reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
    
  const totalExpense = viewMode === "splitwise"
    ? (splitwiseBalances?.owe ?? 0)
    : monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
  
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  const barData = last4Months.map(({ key, label }) => {
    const mt = transactions.filter((t) => t.date.startsWith(key));
    return {
      month: label,
      Income: mt.filter((t) => t.type === "income").reduce((s, t) => s + (t.usdAmount ?? t.amount), 0),
      Expenses: mt.filter((t) => t.type === "expense").reduce((s, t) => s + (t.usdAmount ?? t.amount), 0),
    };
  });

  const expenseByCategory: Record<string, number> = {};
  monthTx.filter((t) => t.type === "expense").forEach((t) => {
    expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + (t.usdAmount ?? t.amount);
  });
  const pieData = Object.entries(expenseByCategory).map(([name, value]) => ({ name, value }));
  const pieColors = ["#10b981", "#f59e0b", "#6366f1", "#ec4899", "#ef4444", "#3b82f6", "#8b5cf6"];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      {/* Header section with personalized greeting */}
      <motion.div variants={item} className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full w-fit text-xs font-semibold">
            <Sparkles className="h-3 w-3" />
            <span>AI Powered Insights</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold tracking-tight text-foreground">
            {getTimeBasedGreeting()}, {user?.name?.split(' ')[0] || 'there'}!
          </h1>
          <p className="text-muted-foreground">
            Here's what's happening with your finances in <span className="text-foreground font-medium">{getMonthLabel(selectedMonthKey)}</span>.
          </p>
        </div>
        
        <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-2xl border border-border">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl hover:bg-background shadow-sm transition-all"
            disabled={selectedMonthIndex <= 0}
            onClick={() => setSelectedMonthKey(availableMonths[selectedMonthIndex - 1])}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-4 py-1.5 min-w-[140px] justify-center bg-background rounded-xl shadow-sm border border-border">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{getMonthLabel(selectedMonthKey)}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl hover:bg-background shadow-sm transition-all"
            disabled={selectedMonthIndex >= availableMonths.length - 1}
            onClick={() => setSelectedMonthKey(availableMonths[selectedMonthIndex + 1])}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>

      {/* Modern Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard 
          title={viewMode === "splitwise" ? "You are owed" : "Total Income"}
          amount={totalIncome}
          icon={TrendingUp}
          color="income"
          description="Total cash inflow this month"
        />
        <SummaryCard 
          title={viewMode === "splitwise" ? "You owe" : "Total Expenses"}
          amount={totalExpense}
          icon={TrendingDown}
          color="expense"
          description="Total cash outflow this month"
        />
        <SummaryCard 
          title="Net Savings"
          amount={netSavings}
          icon={PiggyBank}
          color="savings"
          description={netSavings >= 0 ? "You're building wealth!" : "Budget is currently tight"}
        />
        <SummaryCard 
          title="Savings Rate"
          amount={savingsRate}
          icon={DollarSign}
          color="warning"
          suffix="%"
          decimals={1}
          description="Efficiency of your saving"
        />
      </div>

      {/* Budget Alert Widget */}
      {alertBudgets.length > 0 && (
        <motion.div variants={item} className="glass-card rounded-2xl p-4 border border-destructive/20 bg-destructive/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-display font-semibold text-foreground">Budget Alerts</span>
            </div>
            <Link to="/goals" className="text-xs text-primary hover:underline">View budgets →</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {alertBudgets.map(bs => (
              <div key={bs.category} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                bs.status === 'exceeded' ? 'bg-destructive/10 text-destructive' :
                bs.status === 'danger' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' :
                'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
              }`}>
                <span>{bs.category}</span>
                <span className="opacity-70">{bs.percentageUsed.toFixed(0)}% used</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <motion.div variants={item} className="xl:col-span-2 glass-card rounded-3xl p-6 lg:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-display font-bold text-foreground">Monthly Flow</h3>
            <div className="flex gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-primary" /> Income</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-expense" /> Expenses</div>
            </div>
          </div>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted)/0.4)", radius: 10 }}
                  contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)", background: "hsl(var(--card))" }}
                />
                <Bar dataKey="Income" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                <Bar dataKey="Expenses" fill="hsl(var(--expense))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div variants={item} className="glass-card rounded-3xl p-6 lg:p-8 flex flex-col">
          <h3 className="text-xl font-display font-bold text-foreground mb-6">Allocation</h3>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="h-[280px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={pieData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={70} 
                    outerRadius={100} 
                    paddingAngle={5} 
                    stroke="none"
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Spending</span>
                <span className="text-2xl font-display font-bold">${totalExpense.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

interface SummaryCardProps {
  title: string;
  amount: number;
  icon: any;
  color: "income" | "expense" | "savings" | "warning";
  description: string;
  suffix?: string;
  decimals?: number;
}

function SummaryCard({ title, amount, icon: Icon, color, description, suffix = "", decimals = 0 }: SummaryCardProps) {
  const colorClass = {
    income: "bg-primary/10 text-primary border-primary/20",
    expense: "bg-expense/10 text-expense border-expense/20",
    savings: "bg-savings/10 text-savings border-savings/20",
    warning: "bg-warning/10 text-warning border-warning/20",
  }[color];

  const iconClass = {
    income: "bg-primary text-primary-foreground",
    expense: "bg-expense text-expense-foreground",
    savings: "bg-savings text-savings-foreground",
    warning: "bg-warning text-warning-foreground",
  }[color];

  return (
    <motion.div variants={item} className="group relative flex flex-col p-6 glass-card rounded-3xl transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2.5 rounded-2xl ${iconClass} shadow-lg shadow-current/20`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${colorClass}`}>
          {title}
        </div>
      </div>
      <div className="space-y-1">
        <AnimatedCounter 
          value={amount} 
          suffix={suffix} 
          decimals={decimals} 
          prefix={suffix ? "" : "$"} 
          className="text-2xl font-display font-bold text-foreground" 
        />
        <p className="text-xs text-muted-foreground line-clamp-1">{description}</p>
      </div>
    </motion.div>
  );
}
