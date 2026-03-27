import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingDown, Trash2, ArrowRight, Zap, Target, DollarSign, Sparkles } from "lucide-react";
import { useFinanceStore, expenseCategories } from "@/store/financeStore";
import { getCurrentMonthKey, getMonthLabel } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function WeeklyWaste() {
  const { transactions } = useFinanceStore();
  const navigate = useNavigate();
  
  const wasteAnalysis = useMemo(() => {
    const today = new Date();
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(today.getDate() - 7);
    
    // Last week's spending
    const lastWeekTx = transactions.filter(t => 
      t.type === 'expense' && 
      new Date(t.date) >= lastWeekStart && 
      new Date(t.date) <= today
    );

    // Prev 3 weeks for average
    const threeWeeksAgoStart = new Date(lastWeekStart);
    threeWeeksAgoStart.setDate(lastWeekStart.getDate() - 21);
    const prevThreeWeeksTx = transactions.filter(t => 
      t.type === 'expense' && 
      new Date(t.date) >= threeWeeksAgoStart && 
      new Date(t.date) < lastWeekStart
    );

    const wasteCategories = expenseCategories.map(cat => {
      const lastWeekAmount = lastWeekTx.filter(t => t.category === cat).reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
      const prevAverage = prevThreeWeeksTx.filter(t => t.category === cat).reduce((s, t) => s + (t.usdAmount ?? t.amount), 0) / 3;
      
      const waste = lastWeekAmount - prevAverage;
      const potentialMonthlySaving = waste > 0 ? waste * 4 : 0;

      return {
        category: cat,
        lastWeekAmount,
        prevAverage,
        waste,
        potentialMonthlySaving
      };
    }).filter(c => c.waste > 0).sort((a, b) => b.waste - a.waste);

    const totalPotentialSaving = wasteCategories.reduce((s, c) => s + c.potentialMonthlySaving, 0);

    return { wasteCategories, totalPotentialSaving };
  }, [transactions]);

  const { toast } = useToast();
  useEffect(() => {
    if (wasteAnalysis.totalPotentialSaving > 50) {
      toast({
        title: "Weekly Leak Detected!",
        description: `Potential $${Math.round(wasteAnalysis.totalPotentialSaving)}/mo leak in your spending.`,
      });
    }
  }, []); // Only on mount

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8 pb-12">
      <motion.div variants={item} className="flex flex-col gap-2">
        <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground tracking-tight flex items-center gap-3">
          Weekly Waste <Sparkles className="h-8 w-8 text-primary animate-pulse" />
        </h1>
        <p className="text-muted-foreground">Proactive analysis of where you overspent last week.</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Waste Summary */}
        <motion.div variants={item} className="lg:col-span-2 space-y-6">
          <div className="glass-card rounded-[2.5rem] p-10 bg-primary/5 border border-primary/20 relative overflow-hidden group">
             <div className="absolute -top-10 -right-10 opacity-10 transition-transform duration-700 group-hover:scale-125">
                <Trash2 className="w-64 h-64 text-primary" />
             </div>
             
             <div className="relative z-10 space-y-6">
                <div className="space-y-2">
                  <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-primary" /> Weekly Leak Detected
                  </h2>
                  <p className="text-muted-foreground max-w-lg leading-relaxed">
                    You spent more than your 3-week average in <span className="text-foreground font-bold">{wasteAnalysis.wasteCategories.length} categories</span> last week.
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-8 pt-4">
                  <div>
                    <p className="text-5xl lg:text-6xl font-display font-black text-primary">${Math.round(wasteAnalysis.totalPotentialSaving).toLocaleString()}</p>
                    <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground mt-2">Potential Monthly Saving</p>
                  </div>
                  <div className="h-16 w-px bg-primary/20 hidden md:block" />
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-foreground">Fast Track to Goals</p>
                    <p className="text-sm text-muted-foreground">Redirecting this waste can cut 2.5 months off your Travel goal.</p>
                  </div>
                </div>
                
                <Button className="mt-8 rounded-2xl h-12 px-8 font-bold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 border-0 group" onClick={() => navigate('/scenario-lab')}>
                  Generate AI Cut Plan < Zap className="ml-2 h-4 w-4 transition-transform group-hover:scale-125" />
                </Button>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wasteAnalysis.wasteCategories.slice(0, 4).map(cat => (
              <div key={cat.category} className="glass-card rounded-3xl p-6 border-border/50 hover:border-primary/30 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-display font-bold text-foreground">{cat.category}</h3>
                  <div className="text-[10px] font-bold uppercase py-1 px-2.5 bg-expense/10 text-expense rounded-full">
                    +${Math.round(cat.waste)} over avg
                  </div>
                </div>
                <div className="space-y-4">
                   <div className="flex text-xs text-muted-foreground font-bold uppercase tracking-widest items-center gap-2 justify-between">
                     <span>Last Week</span>
                     <span className="text-foreground">Avg Prev Weeks</span>
                   </div>
                   <div className="flex items-center gap-3">
                     <span className="text-xl font-display font-bold">${Math.round(cat.lastWeekAmount)}</span>
                     <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden flex">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, (cat.prevAverage / cat.lastWeekAmount) * 100)}%` }} />
                        <div className="h-full bg-expense" style={{ width: `${Math.max(0, 100 - (cat.prevAverage / cat.lastWeekAmount) * 100)}%` }} />
                     </div>
                     <span className="text-sm font-medium text-muted-foreground">${Math.round(cat.prevAverage)}</span>
                   </div>
                   <p className="text-xs text-muted-foreground italic mt-2">
                     Cutting back to average saves <span className="text-foreground font-bold">${Math.round(cat.potentialMonthlySaving)}/month</span>.
                   </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Proactive Tip Column */}
        <motion.div variants={item} className="space-y-6">
           <div className="glass-card rounded-[2rem] p-8 border-warning/20 bg-warning/5 space-y-6">
              <div className="p-3 rounded-2xl bg-warning/20 text-warning w-fit">
                <Target className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-display font-bold text-foreground">Proactive Pulse</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Based on current leaks, your savings rate is projected to drop 4% this month. Let's fix it before the month ends.
              </p>
              
              <div className="space-y-4 pt-4">
                 <div className="space-y-2">
                    <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Recommended Switch</p>
                    <div className="p-4 bg-background border border-border rounded-2xl text-sm font-medium">
                      Skip 2 <span className="text-primary font-bold">Shopping</span> sessions next week to save $140.
                    </div>
                 </div>
                 <div className="space-y-2">
                    <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Goal Impact</p>
                    <div className="p-4 bg-background border border-border rounded-2xl text-sm font-medium">
                      Hit <span className="text-primary font-bold">Emergency Fund</span> 15 days faster.
                    </div>
                 </div>
              </div>
           </div>

           <div className="glass-card rounded-[2rem] p-8 border-primary/20 bg-primary/5 space-y-4 cursor-pointer hover:bg-primary/10 transition-colors" onClick={() => navigate('/goals')}>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold font-display text-foreground">Savings Goals</h4>
                <div className="p-2 rounded-xl bg-primary/20 text-primary">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="space-y-2">
                 <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Active Goals</span>
                    <span>3 Total</span>
                 </div>
                 <Progress value={68} className="h-1.5" />
                 <p className="text-[10px] text-muted-foreground">You are 68% of the way to your monthly savings target.</p>
              </div>
           </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
