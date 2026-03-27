import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Info, ShieldCheck, ShoppingBag, Target, ArrowRight } from "lucide-react";
import { useFinanceStore, selectExpenseAutopsy, expenseCategories } from "@/store/financeStore";
import { getCurrentMonthKey, getMonthLabel } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function ExpenseAutopsy() {
  const { transactions } = useFinanceStore();
  const navigate = useNavigate();
  const currentMonthKey = getCurrentMonthKey();
  const autopsy = useMemo(() => selectExpenseAutopsy(transactions, currentMonthKey), [transactions, currentMonthKey]);

  const discretionaryPercent = autopsy.totalExpenses > 0 
    ? Math.round((autopsy.optionalTotal / autopsy.totalExpenses) * 100) 
    : 0;

  const highGrowthCategories = autopsy.categories.filter(c => c.momDelta !== null && c.momDelta > 10);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8 pb-12">
      <motion.div variants={item} className="flex flex-col gap-2">
        <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground tracking-tight">Expense Autopsy</h1>
        <p className="text-muted-foreground">Detailed breakdown of {getMonthLabel(currentMonthKey)} spending: Essential vs. Optional.</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Discretionary Summary */}
        <motion.div variants={item} className="lg:col-span-2 glass-card rounded-3xl p-8 flex flex-col justify-between overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-8 opacity-5 transition-transform duration-500 group-hover:scale-110">
            <ShoppingBag className="w-32 h-32" />
          </div>
          <div className="space-y-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                <Info className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-display font-bold">Discretionary Analysis</CardTitle>
                <CardDescription>Your optional spending this month</CardDescription>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-4xl lg:text-5xl font-display font-black text-primary">{discretionaryPercent}%</span>
                  <span className="text-sm text-muted-foreground font-medium pb-1.5 uppercase tracking-wide">of total spending</span>
                </div>
                <Progress value={discretionaryPercent} className="h-4" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  You spent <span className="text-foreground font-bold">${autopsy.optionalTotal.toLocaleString()}</span> on optional items this month. 
                  Focusing on these categories is the fastest way to hit your savings goals.
                </p>
              </div>
              
              <div className="bg-muted/30 rounded-2xl p-6 border border-border/50">
                <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                  <ShieldCheck className="h-3 w-3" /> Base Survival
                </h4>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-foreground">Essential Core</span>
                  <span className="text-sm font-bold font-display">${autopsy.essentialTotal.toLocaleString()}</span>
                </div>
                <Progress value={100 - discretionaryPercent} className="h-1.5 bg-muted" />
                <p className="text-[10px] text-muted-foreground mt-3">
                  Fixed expenses like rent, utilities, and healthcare.
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* High Growth Highlight */}
        <motion.div variants={item} className="glass-card rounded-3xl p-8 bg-expense/5 border-expense/20 ring-1 ring-expense/10">
          <div className="flex flex-col h-full justify-between">
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-expense/10 text-expense w-fit">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-display font-bold text-foreground">Spike Warning</h3>
              <p className="text-sm text-muted-foreground">Categories that grew by more than 10% since last month.</p>
            </div>
            
            <div className="space-y-3 mt-6">
              {highGrowthCategories.length > 0 ? (
                highGrowthCategories.map(cat => (
                  <div key={cat.category} className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-expense/20">
                    <span className="text-sm font-medium">{cat.category}</span>
                    <span className="text-sm font-bold text-expense flex items-center gap-1">
                      +{cat.momDelta?.toFixed(0)}% <TrendingUp className="h-3 w-3" />
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-primary font-medium flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> No significant spikes detected!
                </div>
              )}
            </div>
            
            <Button variant="ghost" className="mt-8 group flex items-center gap-2 text-primary" onClick={() => navigate('/scenario-lab')}>
              Ask AI to fix this <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Categories Grid */}
      <motion.div variants={item} className="space-y-4">
        <h3 className="text-xl font-display font-bold text-foreground">Full Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {autopsy.categories.map(cat => (
            <div key={cat.category} className={`p-5 rounded-2xl glass-card transition-all duration-300 hover:shadow-lg border ${cat.type === 'essential' ? 'border-primary/20' : 'border-border'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cat.type === 'essential' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {cat.type}
                </span>
                {cat.momDelta !== null && (
                  <span className={`text-[10px] font-bold flex items-center gap-0.5 ${cat.momDelta > 0 ? 'text-expense' : 'text-primary'}`}>
                    {cat.momDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(cat.momDelta).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground font-medium">{cat.category}</p>
              <p className="text-2xl font-display font-bold text-foreground mt-1">${cat.amount.toLocaleString()}</p>
              
              <div className="mt-4 h-1 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full ${cat.type === 'essential' ? 'bg-primary' : 'bg-savings'}`}
                  style={{ width: `${Math.min(100, (cat.amount / autopsy.totalExpenses) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
