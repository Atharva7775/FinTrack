import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Target, Wallet, Zap, LogIn } from "lucide-react";
import { useFinanceStore, type Goal } from "@/store/financeStore";
import { useAuth } from "@/hooks/useAuth";
import { CursorTooltip } from "@/components/CursorTooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCurrentMonthKey } from "@/lib/utils";
import { GoalOptimizerModal } from "@/components/GoalOptimizerModal";

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

function contributionThisMonth(goal: Goal): number {
  const currentMonth = getCurrentMonthKey();
  return (goal.contributions || []).filter((c) => c.date.startsWith(currentMonth)).reduce((s, c) => s + c.amount, 0);
}

export default function Goals() {
  const { goals, addGoal, deleteGoal, updateGoal, addGoalContribution } = useFinanceStore();
  const { user, isLoading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", targetAmount: "", currentAmount: "0", deadline: "2026-08-01", monthlyContribution: "" });
  const [contributionGoalId, setContributionGoalId] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState("");
  const [contributionDate, setContributionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [optimizerGoalId, setOptimizerGoalId] = useState<string | null>(null);
  const currentMonth = getCurrentMonthKey();

  if (!authLoading && !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <LogIn className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-display font-semibold text-foreground">Sign in to view your goals</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          Your savings goals are private and tied to your account. Sign in to view and manage them.
        </p>
      </div>
    );
  }

  const handleSubmit = () => {
    const target = parseFloat(form.targetAmount);
    const current = parseFloat(form.currentAmount) || 0;
    const monthly = parseFloat(form.monthlyContribution) || 0;
    if (!form.title || !target) return;
    addGoal({ title: form.title, targetAmount: target, currentAmount: current, deadline: form.deadline, monthlyContribution: monthly });
    setOpen(false);
    setForm({ title: "", targetAmount: "", currentAmount: "0", deadline: "2026-08-01", monthlyContribution: "" });
  };

  const handleRecordContribution = () => {
    const amount = parseFloat(contributionAmount);
    if (!contributionGoalId || !amount || amount <= 0) return;
    addGoalContribution(contributionGoalId, amount, contributionDate);
    setContributionGoalId(null);
    setContributionAmount("");
    setContributionDate(new Date().toISOString().slice(0, 10));
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Savings Goals</h1>
          <p className="text-muted-foreground text-sm mt-1">Track progress toward your financial milestones</p>
        </div>
        <CursorTooltip content="Open the form to create a new savings goal (e.g. emergency fund, vacation).">
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Goal
          </Button>
        </CursorTooltip>
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
                <CursorTooltip content="Delete this goal permanently. Progress is not recovered.">
                  <button onClick={() => deleteGoal(goal.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </CursorTooltip>
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
                  <span className="text-muted-foreground">Planned / mo</span>
                  <span className="font-medium text-foreground">${goal.monthlyContribution.toLocaleString()}/mo</span>
                </div>
                {contributionThisMonth(goal) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">This month</span>
                    <span className="font-medium text-primary">+${contributionThisMonth(goal).toLocaleString()} contributed</span>
                  </div>
                )}
                {monthsLeft !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Est. completion</span>
                    <span className="font-medium text-primary">{monthsLeft} months</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <CursorTooltip content="Record money you set aside this month for this goal (e.g. from your income).">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setContributionGoalId(goal.id); setContributionAmount(""); setContributionDate(new Date().toISOString().slice(0, 10)); }}>
                    <Wallet className="h-3.5 w-3.5" /> Record contribution
                  </Button>
                </CursorTooltip>
                <CursorTooltip content="Get a plan to reach this goal faster: required savings, spending cuts, and revised timeline.">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOptimizerGoalId(goal.id)}>
                    <Zap className="h-3.5 w-3.5" /> Optimize
                  </Button>
                </CursorTooltip>
              </div>

              <CursorTooltip content="Quick-add this amount to the current saved amount for this goal (capped at target).">
                <div className="mt-3 flex gap-2">
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
              </CursorTooltip>
            </motion.div>
          );
        })}
      </div>

      {/* Record contribution dialog */}
      <Dialog open={!!contributionGoalId} onOpenChange={(o) => !o && setContributionGoalId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Record contribution</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Log money you set aside for this goal (e.g. monthly allocation from income).</p>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Amount ($)</Label>
              <Input type="number" placeholder="0" value={contributionAmount} onChange={(e) => setContributionAmount(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={contributionDate} onChange={(e) => setContributionDate(e.target.value)} />
            </div>
            <Button onClick={handleRecordContribution} className="w-full" disabled={!contributionAmount || parseFloat(contributionAmount) <= 0}>Add contribution</Button>
          </div>
        </DialogContent>
      </Dialog>

      {optimizerGoalId && (
        <GoalOptimizerModal goalId={optimizerGoalId} onClose={() => setOptimizerGoalId(null)} />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Create Savings Goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <CursorTooltip content="A short name for your goal (e.g. Emergency Fund, New Car).">
              <div><Label>Goal Title</Label><Input placeholder="e.g., Emergency Fund" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            </CursorTooltip>
            <CursorTooltip content="The total amount you want to save for this goal in dollars.">
              <div><Label>Target Amount</Label><Input type="number" placeholder="10000" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} /></div>
            </CursorTooltip>
            <CursorTooltip content="How much you have already saved toward this goal so far.">
              <div><Label>Current Amount</Label><Input type="number" placeholder="0" value={form.currentAmount} onChange={(e) => setForm({ ...form, currentAmount: e.target.value })} /></div>
            </CursorTooltip>
            <CursorTooltip content="How much you plan to add to this goal each month (used to estimate time to reach target).">
              <div><Label>Monthly Contribution</Label><Input type="number" placeholder="500" value={form.monthlyContribution} onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })} /></div>
            </CursorTooltip>
            <CursorTooltip content="Target date by which you want to reach this goal.">
              <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
            </CursorTooltip>
            <CursorTooltip content="Save this goal and add it to your list.">
              <Button onClick={handleSubmit} className="w-full">Create Goal</Button>
            </CursorTooltip>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
