import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Target } from "lucide-react";
import { useFinanceStore, type Goal } from "@/store/financeStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

function CircularProgress({ percent, size = 100 }: { percent: number; size?: number }) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (Math.min(percent, 100) / 100) * circ;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </svg>
  );
}

function MilestoneIndicator({ percent }: { percent: number }) {
  const milestones = [25, 50, 75, 100];
  return (
    <div className="flex gap-1.5 mt-3">
      {milestones.map((m) => (
        <div key={m} className="flex-1 flex flex-col items-center gap-1">
          <div className={`h-1.5 w-full rounded-full transition-colors ${percent >= m ? "bg-primary" : "bg-muted"}`} />
          <span className="text-[10px] text-muted-foreground">{m}%</span>
        </div>
      ))}
    </div>
  );
}

export default function Goals() {
  const { goals, addGoal, deleteGoal, updateGoal } = useFinanceStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", targetAmount: "", currentAmount: "0", deadline: "2026-08-01", monthlyContribution: "" });

  const handleSubmit = () => {
    const target = parseFloat(form.targetAmount);
    const current = parseFloat(form.currentAmount) || 0;
    const monthly = parseFloat(form.monthlyContribution) || 0;
    if (!form.title || !target) return;
    addGoal({ title: form.title, targetAmount: target, currentAmount: current, deadline: form.deadline, monthlyContribution: monthly });
    setOpen(false);
    setForm({ title: "", targetAmount: "", currentAmount: "0", deadline: "2026-08-01", monthlyContribution: "" });
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Savings Goals</h1>
          <p className="text-muted-foreground text-sm mt-1">Track progress toward your financial milestones</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Goal
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {goals.map((goal) => {
          const percent = (goal.currentAmount / goal.targetAmount) * 100;
          const remaining = goal.targetAmount - goal.currentAmount;
          const monthsLeft = goal.monthlyContribution > 0 ? Math.ceil(remaining / goal.monthlyContribution) : null;

          return (
            <motion.div key={goal.id} variants={item} className="glass-card rounded-2xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-savings-muted">
                    <Target className="h-5 w-5 text-savings" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-foreground">{goal.title}</h3>
                    <p className="text-xs text-muted-foreground">Due {goal.deadline}</p>
                  </div>
                </div>
                <button onClick={() => deleteGoal(goal.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  <CircularProgress percent={percent} size={80} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-display font-bold text-foreground">{Math.round(percent)}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Saved</p>
                  <p className="text-xl font-display font-bold text-foreground">${goal.currentAmount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">of ${goal.targetAmount.toLocaleString()}</p>
                </div>
              </div>

              <MilestoneIndicator percent={percent} />

              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="font-medium text-foreground">${remaining.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly</span>
                  <span className="font-medium text-foreground">${goal.monthlyContribution.toLocaleString()}/mo</span>
                </div>
                {monthsLeft !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Est. completion</span>
                    <span className="font-medium text-primary">{monthsLeft} months</span>
                  </div>
                )}
              </div>

              {/* Quick add */}
              <div className="mt-4 flex gap-2">
                {[50, 100, 200].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => updateGoal(goal.id, { currentAmount: Math.min(goal.currentAmount + amt, goal.targetAmount) })}
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-muted hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
                  >
                    +${amt}
                  </button>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Create Savings Goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Goal Title</Label><Input placeholder="e.g., Emergency Fund" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Target Amount</Label><Input type="number" placeholder="10000" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} /></div>
            <div><Label>Current Amount</Label><Input type="number" placeholder="0" value={form.currentAmount} onChange={(e) => setForm({ ...form, currentAmount: e.target.value })} /></div>
            <div><Label>Monthly Contribution</Label><Input type="number" placeholder="500" value={form.monthlyContribution} onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })} /></div>
            <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
            <Button onClick={handleSubmit} className="w-full">Create Goal</Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
