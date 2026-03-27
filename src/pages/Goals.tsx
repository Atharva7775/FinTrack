import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Target, Wallet, Zap, LogIn } from "lucide-react";
import { useFinanceStore, type Goal, type GoalMilestone } from "@/store/financeStore";
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

function MilestoneIndicator({ percent, milestones, currentAmount }: { percent: number; milestones?: GoalMilestone[]; currentAmount: number }) {
  const displayMilestones = milestones && milestones.length > 0 
    ? milestones 
    : [
        { label: "Quarter", amount: 0.25 },
        { label: "Halfway", amount: 0.5 },
        { label: "Three-quarters", amount: 0.75 },
        { label: "Complete", amount: 1 }
      ].map(m => ({ label: m.label, amount: m.amount * (percent > 0 ? currentAmount / (percent/100) : 0) }));

  return (
    <div className="space-y-3 mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Milestones</h4>
        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
          {milestones && milestones.length > 0 ? "AI Optimized" : "Standard"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {displayMilestones.slice(0, 4).map((m, idx) => {
          const isReached = currentAmount >= m.amount;
          return (
            <div key={idx} className={`p-2 rounded-xl border transition-all ${isReached ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-transparent text-muted-foreground"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold truncate pr-1">{m.label}</span>
                {isReached && <Zap className="h-3 w-3 text-primary" />}
              </div>
              <div className="text-xs font-display font-bold text-foreground">
                ${m.amount.toLocaleString()}
              </div>
              <div className="mt-1.5 h-1 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${isReached ? "bg-primary" : "bg-muted-foreground/20"}`}
                  style={{ width: `${Math.min(100, (currentAmount / m.amount) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
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
  const [form, setForm] = useState({ 
    title: "", 
    targetAmount: "", 
    currentAmount: "0", 
    deadline: new Date(new Date().getFullYear(), new Date().getMonth() + 6, 1).toISOString().slice(0,10), 
    monthlyContribution: "",
    type: 'savings' as 'savings' | 'budget',
    isShared: false,
    members: ""
  });
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
    
    const membersList = form.members.split(',').map(m => m.trim()).filter(m => m.includes('@')).map(email => ({ email, status: 'invited' as const }));

    addGoal({ 
      title: form.title, 
      targetAmount: target, 
      currentAmount: current, 
      deadline: form.deadline, 
      monthlyContribution: monthly,
      type: form.type,
      isShared: form.isShared,
      members: membersList
    });
    setOpen(false);
    setForm({ 
      title: "", 
      targetAmount: "", 
      currentAmount: "0", 
      deadline: new Date(new Date().getFullYear(), new Date().getMonth() + 6, 1).toISOString().slice(0,10), 
      monthlyContribution: "",
      type: 'savings',
      isShared: false,
      members: ""
    });
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
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Goals & Budgets</h1>
          <p className="text-muted-foreground text-sm mt-1">Track savings targets and shared monthly budgets</p>
        </div>
        <div className="flex gap-2">
          <CursorTooltip content="Create a new savings goal (e.g. emergency fund, vacation).">
            <Button onClick={() => { setForm(f => ({ ...f, type: 'savings' })); setOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> New Goal
            </Button>
          </CursorTooltip>
          <CursorTooltip content="Create a new monthly spending budget (e.g. food limit, shopping cap).">
            <Button variant="outline" onClick={() => { setForm(f => ({ ...f, type: 'budget' })); setOpen(true); }} className="gap-2 border-primary/20 hover:border-primary/50 text-primary">
              <Plus className="h-4 w-4" /> New Budget
            </Button>
          </CursorTooltip>
        </div>
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
                  <div className={`p-2 rounded-xl ${goal.type === 'budget' ? 'bg-orange-500/10' : 'bg-savings-muted'}`}>
                    {goal.type === 'budget' ? <Wallet className="h-5 w-5 text-orange-500" /> : <Target className="h-5 w-5 text-savings" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-semibold text-foreground">{goal.title}</h3>
                      {goal.isShared && (
                        <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase tracking-wider">Shared</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{goal.type === 'budget' ? 'Spending Limit' : 'Savings Target'} • {goal.deadline}</p>
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
                  <p className="text-sm text-muted-foreground">{goal.type === 'budget' ? 'Limit spent' : 'Saved'}</p>
                  <p className="text-xl font-display font-bold text-foreground">${goal.currentAmount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">of ${goal.targetAmount.toLocaleString()}</p>
                </div>
              </div>

              {goal.isShared && goal.members && goal.members.length > 0 && (
                <div className="mb-4 flex flex-col gap-1.5 p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60">Collaborators</p>
                  <div className="flex flex-wrap gap-1">
                    {goal.members.map((m, idx) => (
                      <span key={idx} className="text-[10px] bg-background border border-border px-1.5 py-0.5 rounded-md text-foreground font-medium" title={m.status}>
                        {m.email.split('@')[0]}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <MilestoneIndicator 
                percent={percent} 
                milestones={goal.milestones} 
                currentAmount={goal.currentAmount} 
              />

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
            <DialogTitle className="font-display">Create {form.type === 'budget' ? 'Spending Budget' : 'Savings Goal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <CursorTooltip content="A short name for your goal or budget (e.g. Wedding Savings, Dining Limit).">
              <div><Label>Title</Label><Input placeholder="e.g., Emergency Fund" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            </CursorTooltip>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2">
                  <Button variant={form.type === 'savings' ? 'default' : 'outline'} className="flex-1" onClick={() => setForm({ ...form, type: 'savings' })}>Savings</Button>
                  <Button variant={form.type === 'budget' ? 'default' : 'outline'} className="flex-1" onClick={() => setForm({ ...form, type: 'budget' })}>Budget</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Visibility</Label>
                <div className="flex gap-2">
                  <Button variant={!form.isShared ? 'default' : 'outline'} className="flex-1" onClick={() => setForm({ ...form, isShared: false })}>Personal</Button>
                  <Button variant={form.isShared ? 'default' : 'outline'} className="flex-1" onClick={() => setForm({ ...form, isShared: true })}>Shared</Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <CursorTooltip content="Total amount to save OR monthly spending limit.">
                <div><Label>Target Amount</Label><Input type="number" placeholder="10000" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} /></div>
              </CursorTooltip>
              <CursorTooltip content="Target date or budget expiry.">
                <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
              </CursorTooltip>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <CursorTooltip content="How much you have starting now.">
                <div><Label>Current Amount</Label><Input type="number" placeholder="0" value={form.currentAmount} onChange={(e) => setForm({ ...form, currentAmount: e.target.value })} /></div>
              </CursorTooltip>
              <CursorTooltip content="Planned monthly saving toward this target.">
                <div><Label>Monthly Plan</Label><Input type="number" placeholder="500" value={form.monthlyContribution} onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })} /></div>
              </CursorTooltip>
            </div>

            {form.isShared && (
              <CursorTooltip content="Enter email addresses separated by commas to invite people who have a FinTrack account.">
                <div className="animate-in fade-in slide-in-from-top-2">
                  <Label>Invite Collaborators (emails)</Label>
                  <Input placeholder="friend@email.com, partner@fintrack.com" value={form.members} onChange={(e) => setForm({ ...form, members: e.target.value })} />
                </div>
              </CursorTooltip>
            )}

            <CursorTooltip content="Save this goal and add it to your list.">
              <Button onClick={handleSubmit} className="w-full h-12 text-lg font-display">Create {form.type === 'budget' ? 'Budget' : 'Goal'}</Button>
            </CursorTooltip>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
