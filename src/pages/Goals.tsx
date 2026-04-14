import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Target, Wallet, Zap, LogIn, PiggyBank, Settings2, TrendingUp, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useFinanceStore, type Goal, type GoalMilestone, selectBudgetStatuses, type Budget, type BudgetStatus } from "@/store/financeStore";
import { useAuth } from "@/hooks/useAuth";
import { useBudgetAlerts } from "@/hooks/useBudgetAlerts";
import { CursorTooltip } from "@/components/CursorTooltip";
import { BudgetSetupWizard } from "@/components/BudgetSetupWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCurrentMonthKey, getLastNMonths, getMonthLabel, getPrevMonthKey } from "@/lib/utils";
import { GoalOptimizerModal } from "@/components/GoalOptimizerModal";
import { saveBudget, deleteBudgetRow } from "@/lib/supabaseSync";
import { toast } from "sonner";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

function CircularProgress({ percent, size = 100, color }: { percent: number; size?: number; color?: string }) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (Math.min(percent, 100) / 100) * circ;
  const strokeColor = color ?? "hsl(var(--primary))";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={strokeColor}
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

// ─── Budget status helpers ─────────────────────────────────────────────────────
function statusColor(status: BudgetStatus["status"]) {
  if (status === "exceeded") return "hsl(0,72%,55%)";
  if (status === "danger") return "hsl(24,95%,55%)";
  if (status === "warning") return "hsl(38,92%,50%)";
  return "hsl(142,52%,42%)";
}

function statusBadge(status: BudgetStatus["status"]) {
  if (status === "exceeded") return <Badge variant="destructive" className="text-xs">Over budget</Badge>;
  if (status === "danger") return <Badge className="bg-orange-500 text-white text-xs">Danger zone</Badge>;
  if (status === "warning") return <Badge className="bg-yellow-500 text-black text-xs">Warning</Badge>;
  return <Badge variant="secondary" className="text-xs text-green-600 bg-green-500/10">On track</Badge>;
}

// ─── Budget edit dialog ────────────────────────────────────────────────────────
interface EditBudgetDialogProps {
  budget: Budget | null;
  onClose: () => void;
  onSave: (updated: Budget) => void;
}
function EditBudgetDialog({ budget, onClose, onSave }: EditBudgetDialogProps) {
  const [form, setForm] = useState({
    type: budget?.type ?? ("percentage" as Budget["type"]),
    percentage: budget?.percentage ?? 0,
    fixedAmount: budget?.fixedAmount ?? 0,
    alertThreshold: budget?.alertThreshold ?? 80,
  });
  if (!budget) return null;
  return (
    <Dialog open={!!budget} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit {budget.category} Budget</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <Button variant={form.type === "percentage" ? "default" : "outline"} className="flex-1" onClick={() => setForm((f) => ({ ...f, type: "percentage" }))}>% of income</Button>
            <Button variant={form.type === "fixed" ? "default" : "outline"} className="flex-1" onClick={() => setForm((f) => ({ ...f, type: "fixed" }))}>Fixed $</Button>
          </div>
          {form.type === "percentage" ? (
            <div>
              <Label>Percentage of monthly income</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="number" min={0} max={100} value={form.percentage} onChange={(e) => setForm((f) => ({ ...f, percentage: Number(e.target.value) }))} />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ) : (
            <div>
              <Label>Fixed amount per month ($)</Label>
              <Input type="number" min={0} value={form.fixedAmount} onChange={(e) => setForm((f) => ({ ...f, fixedAmount: Number(e.target.value) }))} className="mt-1" />
            </div>
          )}
          <div>
            <Label>Alert when usage reaches (%)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min={50} max={99} value={form.alertThreshold} onChange={(e) => setForm((f) => ({ ...f, alertThreshold: Number(e.target.value) }))} />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <Button className="w-full" onClick={() => onSave({ ...budget, ...form })}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export default function Goals() {
  const { goals, addGoal, deleteGoal, updateGoal, addGoalContribution, budgets, deleteBudget, updateBudget, setBudgets, transactions } = useFinanceStore();
  const { user, isLoading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editBudget, setEditBudget] = useState<Budget | null>(null);
  const [form, setForm] = useState({
    title: "",
    targetAmount: "",
    currentAmount: "0",
    deadline: new Date(new Date().getFullYear(), new Date().getMonth() + 6, 1).toISOString().slice(0, 10),
    monthlyContribution: "",
    isShared: false,
    members: "",
  });
  const [contributionGoalId, setContributionGoalId] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState("");
  const [contributionDate, setContributionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [optimizerGoalId, setOptimizerGoalId] = useState<string | null>(null);
  const currentMonth = getCurrentMonthKey();
  const [selectedBudgetMonth, setSelectedBudgetMonth] = useState(currentMonth);
  const isCurrentMonth = selectedBudgetMonth === currentMonth;
  const monthOptions = getLastNMonths(12).reverse(); // oldest first → newest last

  useBudgetAlerts();

  // Income and status for the selected budget month
  const rawMonthlyIncome = transactions
    .filter(t => t.type === 'income' && t.date.startsWith(selectedBudgetMonth))
    .reduce((sum, t) => sum + t.amount, 0);
  const totalGoalSavings = goals.reduce((s, g) => s + g.monthlyContribution, 0);
  const monthlyIncome = Math.max(rawMonthlyIncome - totalGoalSavings, 0);

  const monthBudgets = budgets.filter(b => b.month === selectedBudgetMonth);
  const budgetStatuses = selectBudgetStatuses(monthBudgets, transactions, monthlyIncome, selectedBudgetMonth);

  // For "copy from last month" functionality
  const prevMonthKey = getPrevMonthKey();
  const prevMonthBudgets = budgets.filter(b => b.month === prevMonthKey);

  const hasBudgetsForSelectedMonth = monthBudgets.length > 0;

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
    addGoal({ title: form.title, targetAmount: target, currentAmount: current, deadline: form.deadline, monthlyContribution: monthly, type: 'savings', isShared: form.isShared, members: membersList });
    setOpen(false);
    setForm({ title: "", targetAmount: "", currentAmount: "0", deadline: new Date(new Date().getFullYear(), new Date().getMonth() + 6, 1).toISOString().slice(0, 10), monthlyContribution: "", isShared: false, members: "" });
  };

  const handleRecordContribution = () => {
    const amount = parseFloat(contributionAmount);
    if (!contributionGoalId || !amount || amount <= 0) return;
    addGoalContribution(contributionGoalId, amount, contributionDate);
    setContributionGoalId(null);
    setContributionAmount("");
    setContributionDate(new Date().toISOString().slice(0, 10));
  };

  const handleCopyFromLastMonth = async () => {
    if (!user?.email || prevMonthBudgets.length === 0) return;
    const targetMonth = selectedBudgetMonth;
    const copied: Budget[] = [];
    for (const b of prevMonthBudgets) {
      const draft: Budget = {
        ...b,
        id: crypto.randomUUID(),
        month: targetMonth,
        rolloverBalance: 0,
      };
      const result = await saveBudget(user.email, draft);
      copied.push(result ?? draft);
    }
    const otherMonths = budgets.filter(bx => bx.month !== targetMonth);
    useFinanceStore.getState().setBudgets([...otherMonths, ...copied]);
    toast.success(`Copied ${copied.length} budgets from ${getMonthLabel(prevMonthKey)} to ${getMonthLabel(targetMonth)}`);
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Budget & Goals</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your monthly spending budgets and savings targets</p>
        </div>
        <div className="flex gap-2">
          {isCurrentMonth && (
            <CursorTooltip content={hasBudgetsForSelectedMonth ? "Reconfigure this month's budgets." : "Set up monthly spending budgets with a guided wizard."}>
              <Button variant={hasBudgetsForSelectedMonth ? "outline" : "default"} onClick={() => setWizardOpen(true)} className="gap-2">
                <PiggyBank className="h-4 w-4" /> {hasBudgetsForSelectedMonth ? "Edit Budgets" : "Set Up Budgets"}
              </Button>
            </CursorTooltip>
          )}
          <CursorTooltip content="Create a new savings goal (e.g. emergency fund, vacation).">
            <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New Goal
            </Button>
          </CursorTooltip>
        </div>
      </div>

      {/* Section A: Monthly Budgets */}
      <div className="space-y-4">
        {/* Month selector */}
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Monthly Budgets
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const idx = monthOptions.findIndex(m => m.key === selectedBudgetMonth);
                if (idx > 0) setSelectedBudgetMonth(monthOptions[idx - 1].key);
              }}
              disabled={monthOptions[0]?.key === selectedBudgetMonth}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              value={selectedBudgetMonth}
              onChange={e => setSelectedBudgetMonth(e.target.value)}
              className="text-sm font-medium bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {monthOptions.map(m => (
                <option key={m.key} value={m.key}>
                  {getMonthLabel(m.key)}{m.key === currentMonth ? " (Current)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const idx = monthOptions.findIndex(m => m.key === selectedBudgetMonth);
                if (idx < monthOptions.length - 1) setSelectedBudgetMonth(monthOptions[idx + 1].key);
              }}
              disabled={monthOptions[monthOptions.length - 1]?.key === selectedBudgetMonth}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {hasBudgetsForSelectedMonth && budgetStatuses.length > 0 ? (
          <>
            {!isCurrentMonth && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground">
                <span className="text-base">📅</span>
                Viewing history for <strong className="text-foreground">{getMonthLabel(selectedBudgetMonth)}</strong>.
                Budgets are read-only for past months.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {budgetStatuses.map((bs) => {
                const budget = monthBudgets.find(b => b.category === bs.category)!;
                return (
                  <motion.div key={bs.category} variants={item} className="glass-card rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display font-semibold text-foreground">{bs.category}</span>
                          {statusBadge(bs.status)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">${bs.spent.toFixed(0)} / ${bs.limitAmount.toFixed(0)}</p>
                      </div>
                      {isCurrentMonth && (
                        <div className="flex gap-1">
                          <button onClick={() => setEditBudget(budget)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
                            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button onClick={() => { deleteBudget(budget.id); toast.success(`Removed ${bs.category} budget`); }} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden mb-2">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(bs.percentageUsed, 100)}%`, backgroundColor: statusColor(bs.status) }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>${bs.remaining.toFixed(0)} left</span>
                      <span>{bs.percentageUsed.toFixed(0)}% used</span>
                    </div>
                    {isCurrentMonth && bs.dailyAllowance > 0 && (
                      <p className="text-xs mt-1.5 text-muted-foreground">${bs.dailyAllowance.toFixed(0)}/day remaining</p>
                    )}
                    {budget.rolloverBalance !== 0 && (
                      <p className="text-xs mt-2 text-primary/70">
                        {budget.rolloverBalance > 0 ? `+$${budget.rolloverBalance.toFixed(0)} rollover from last month` : `$${Math.abs(budget.rolloverBalance).toFixed(0)} overspend carried forward`}
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </>
        ) : isCurrentMonth ? (
          <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-4 text-center border-dashed border-2 border-primary/20">
            <PiggyBank className="h-12 w-12 text-primary/40" />
            <div>
              <h3 className="font-display font-semibold text-foreground">No budget set up for {getMonthLabel(currentMonth)}</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">Set up category budgets to track your spending and get smart alerts.</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Button onClick={() => setWizardOpen(true)} className="gap-2">
                <PiggyBank className="h-4 w-4" /> Set Up Budgets
              </Button>
              {prevMonthBudgets.length > 0 && (
                <CursorTooltip content={`Copy all ${prevMonthBudgets.length} budget categories from ${getMonthLabel(prevMonthKey)}`}>
                  <Button variant="outline" onClick={handleCopyFromLastMonth} className="gap-2">
                    <Copy className="h-4 w-4" /> Copy from {getMonthLabel(prevMonthKey)}
                  </Button>
                </CursorTooltip>
              )}
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-4 text-center border-dashed border-2 border-border/40">
            <span className="text-4xl">📅</span>
            <div>
              <h3 className="font-display font-semibold text-foreground">No budget was set for {getMonthLabel(selectedBudgetMonth)}</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">No budget categories were configured for this month.</p>
            </div>
          </div>
        )}
      </div>

      {/* Section B: Savings Goals */}
      <div className="space-y-4">
        <h2 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
          <Target className="h-5 w-5 text-savings" /> Savings Goals
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {goals.filter(g => g.type !== 'budget').map((goal) => {
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
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-semibold text-foreground">{goal.title}</h3>
                        {goal.isShared && (
                          <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase tracking-wider">Shared</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">Savings Target • {goal.deadline}</p>
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
          {goals.filter(g => g.type !== 'budget').length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center p-12 glass-card rounded-2xl border-dashed border-2 border-border gap-3 text-center">
              <Target className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">No savings goals yet. Create one to start tracking your targets.</p>
              <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New Goal</Button>
            </div>
          )}
        </div>
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
            <DialogTitle className="font-display">New Savings Goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <CursorTooltip content="A short name for your goal (e.g. Emergency Fund, Vacation).">
              <div><Label>Title</Label><Input placeholder="e.g., Emergency Fund" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            </CursorTooltip>

            <div>
              <Label>Visibility</Label>
              <div className="flex gap-2 mt-1.5">
                <Button variant={!form.isShared ? 'default' : 'outline'} className="flex-1" onClick={() => setForm({ ...form, isShared: false })}>Personal</Button>
                <Button variant={form.isShared ? 'default' : 'outline'} className="flex-1" onClick={() => setForm({ ...form, isShared: true })}>Shared</Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <CursorTooltip content="Total amount you want to save.">
                <div><Label>Target Amount</Label><Input type="number" placeholder="10000" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} /></div>
              </CursorTooltip>
              <CursorTooltip content="Target date to reach this goal.">
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
              <Button onClick={handleSubmit} className="w-full h-12 text-lg font-display">Create Goal</Button>
            </CursorTooltip>
          </div>
        </DialogContent>
      </Dialog>

      <BudgetSetupWizard open={wizardOpen} onClose={() => setWizardOpen(false)} month={selectedBudgetMonth} />
      {editBudget && (
        <EditBudgetDialog
          budget={editBudget}
          onClose={() => setEditBudget(null)}
          onSave={async (updated) => {
            if (user?.email) {
              const result = await saveBudget(user.email, updated);
              updateBudget(updated.id, result ?? updated);
            } else {
              updateBudget(updated.id, updated);
            }
            setEditBudget(null);
            toast.success(`${updated.category} budget updated`);
          }}
        />
      )}
    </motion.div>
  );
}
