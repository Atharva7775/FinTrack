import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, Target, Bot, MessageCircle, DollarSign,
  Plus, Trash2, ChevronRight, ChevronLeft, Sparkles,
  Brain, Wallet, BarChart3, Receipt, Send, Check, Zap,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useFinanceStore, type Category } from "@/store/financeStore";
import { useAuth } from "@/hooks/useAuth";
import { completeOnboarding } from "@/lib/supabaseSync";

// ─── Types ────────────────────────────────────────────────────────────────────
type IncomeEntry = { id: string; category: Category; amount: string };
type ExpenseItem = { category: Category; label: string; amount: string; enabled: boolean };

const INCOME_CATEGORIES: Category[] = ["Salary", "Freelance", "Investments", "Other Income"];

const DEFAULT_EXPENSES: ExpenseItem[] = [
  { category: "Rent", label: "Rent / Mortgage", amount: "", enabled: false },
  { category: "Food", label: "Food & Groceries", amount: "", enabled: false },
  { category: "Utilities", label: "Utilities (electric, water, internet)", amount: "", enabled: false },
  { category: "Subscriptions", label: "Subscriptions (Netflix, Spotify…)", amount: "", enabled: false },
  { category: "Healthcare", label: "Healthcare", amount: "", enabled: false },
  { category: "Travel", label: "Transport / Travel", amount: "", enabled: false },
  { category: "Entertainment", label: "Entertainment", amount: "", enabled: false },
  { category: "Shopping", label: "Shopping", amount: "", enabled: false },
  { category: "Education", label: "Education", amount: "", enabled: false },
];

const PRESET_GOALS = [
  { title: "Emergency Fund", targetAmount: "10000", deadline: "2027-04-01", monthlyContribution: "500", icon: "🛡️" },
  { title: "Vacation", targetAmount: "2000", deadline: "2026-12-01", monthlyContribution: "200", icon: "✈️" },
  { title: "New Laptop / Device", targetAmount: "1500", deadline: "2026-09-01", monthlyContribution: "150", icon: "💻" },
];

const CHAT_PROMPTS = [
  { label: "Log $45 for lunch today", icon: <Receipt className="w-3 h-3" /> },
  { label: "What's my spending trend this month?", icon: <BarChart3 className="w-3 h-3" /> },
  { label: "How can I save $500 more per month?", icon: <Brain className="w-3 h-3" /> },
  { label: "Scan a grocery receipt", icon: <Receipt className="w-3 h-3" /> },
  { label: "Create a vacation goal for $2,000", icon: <Target className="w-3 h-3" /> },
  { label: "What if I cut all subscriptions?", icon: <Zap className="w-3 h-3" /> },
];

const FEATURES = [
  { icon: TrendingUp, title: "Track spending", desc: "Log income and expenses in seconds" },
  { icon: Target, title: "Savings goals", desc: "Set goals and track your progress" },
  { icon: Brain, title: "AI insights", desc: "Chat with an AI to understand your finances" },
  { icon: Bot, title: "Telegram bot", desc: "Log transactions via chat, anywhere" },
];

const TOTAL_STEPS = 8;

// ─── Floating confetti for step 7 ─────────────────────────────────────────────
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: 5 + Math.random() * 90,
  delay: Math.random() * 0.6,
  color: ["#10b981", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9"][i % 6],
  size: 6 + Math.random() * 6,
}));

function Confetti() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
      {PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{ left: `${p.x}%`, bottom: 0, width: p.size, height: p.size, backgroundColor: p.color }}
          initial={{ y: 0, opacity: 1, rotate: 0 }}
          animate={{ y: -320, opacity: 0, rotate: 360 }}
          transition={{ duration: 1.8, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function OnboardingModal() {
  const { user } = useAuth();
  const {
    hasOnboarded, isHydrated,
    setHasOnboarded, addTransaction, addGoal, setBudgetSplit,
  } = useFinanceStore();

  const open = !!user && isHydrated && !hasOnboarded;

  // ── Step state ───────────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back

  // ── Income ───────────────────────────────────────────────────────────────────
  const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [activeAmount, setActiveAmount] = useState("");

  // ── Expenses ─────────────────────────────────────────────────────────────────
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>(DEFAULT_EXPENSES);

  // ── Budget split ─────────────────────────────────────────────────────────────
  const [needsPct, setNeedsPct] = useState(50);
  const [savingsPct, setSavingsPct] = useState(20);
  const wantsPct = Math.max(0, 100 - needsPct - savingsPct);

  // ── Goal ─────────────────────────────────────────────────────────────────────
  const [selectedGoalPreset, setSelectedGoalPreset] = useState<number | "custom" | null>(null);
  const [customGoal, setCustomGoal] = useState({ title: "", targetAmount: "", deadline: "", monthlyContribution: "" });

  // ── Navigation ───────────────────────────────────────────────────────────────
  const goTo = useCallback((target: number) => {
    setDirection(target > step ? 1 : -1);
    setStep(target);
  }, [step]);

  const next = () => goTo(step + 1);
  const back = () => goTo(step - 1);
  const skipToEnd = () => goTo(7);

  // ── Income helpers ────────────────────────────────────────────────────────────
  const addIncome = () => {
    if (!activeCategory || !activeAmount || isNaN(parseFloat(activeAmount))) return;
    setIncomeEntries(prev => [...prev, { id: crypto.randomUUID(), category: activeCategory, amount: activeAmount }]);
    setActiveAmount("");
    setActiveCategory(null);
  };

  const removeIncome = (id: string) => setIncomeEntries(prev => prev.filter(e => e.id !== id));

  // ── Expense helpers ────────────────────────────────────────────────────────────
  const toggleExpense = (idx: number, enabled: boolean) => {
    setExpenseItems(prev => prev.map((e, i) => i === idx ? { ...e, enabled } : e));
  };
  const setExpenseAmount = (idx: number, amount: string) => {
    setExpenseItems(prev => prev.map((e, i) => i === idx ? { ...e, amount } : e));
  };

  // ── Budget split helpers ──────────────────────────────────────────────────────
  const handleNeedsChange = ([v]: number[]) => {
    setNeedsPct(v);
    if (v + savingsPct > 100) setSavingsPct(100 - v);
  };
  const handleSavingsChange = ([v]: number[]) => {
    setSavingsPct(v);
    if (needsPct + v > 100) setNeedsPct(100 - v);
  };

  // ── Completion ────────────────────────────────────────────────────────────────
  const handleComplete = async () => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    // Add income transactions
    incomeEntries.forEach(e => {
      const amt = parseFloat(e.amount);
      if (amt > 0) addTransaction({ type: "income", amount: amt, category: e.category, date: today, note: "Added during setup" });
    });

    // Add expense transactions
    expenseItems.filter(e => e.enabled).forEach(e => {
      const amt = parseFloat(e.amount);
      if (amt > 0) addTransaction({ type: "expense", amount: amt, category: e.category, date: today, note: "Added during setup" });
    });

    // Set budget split
    setBudgetSplit([needsPct, wantsPct, savingsPct]);

    // Add goal
    const goalPreset = typeof selectedGoalPreset === "number" ? PRESET_GOALS[selectedGoalPreset] : null;
    const goalData = selectedGoalPreset === "custom" ? customGoal : goalPreset;
    if (goalData && goalData.title && parseFloat(goalData.targetAmount) > 0 && goalData.deadline) {
      addGoal({
        title: goalData.title,
        targetAmount: parseFloat(goalData.targetAmount),
        currentAmount: 0,
        deadline: goalData.deadline,
        monthlyContribution: parseFloat(goalData.monthlyContribution || "0"),
        contributions: [],
      });
    }

    // Persist to Supabase
    if (user?.email) await completeOnboarding(user.email);
    setHasOnboarded(true);
  };

  const handleSkip = async () => {
    if (user?.email) await completeOnboarding(user.email);
    setHasOnboarded(true);
  };

  // ── Step content ─────────────────────────────────────────────────────────────
  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  };

  const stepContent: Record<number, React.ReactNode> = {
    // ── Step 0: Welcome ────────────────────────────────────────────────────────
    0: (
      <div className="p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome to FinTrack</h2>
          <p className="text-muted-foreground mt-1.5">Your AI-powered personal finance companion</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-left">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/50 border border-border/50">
              <f.icon className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="text-xs text-muted-foreground leading-snug">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white" onClick={next}>
            Get started <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleSkip}>
            Skip for now
          </Button>
        </div>
      </div>
    ),

    // ── Step 1: Income ─────────────────────────────────────────────────────────
    1: (
      <div className="p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold">What's your income?</h3>
          <p className="text-sm text-muted-foreground">Add your regular income sources</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {INCOME_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                activeCategory === cat
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : "bg-background border-border hover:border-emerald-400 hover:text-emerald-600"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        {activeCategory && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                className="pl-6"
                placeholder={`Monthly ${activeCategory.toLowerCase()} amount`}
                type="number"
                min="0"
                value={activeAmount}
                onChange={e => setActiveAmount(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addIncome()}
                autoFocus
              />
            </div>
            <Button onClick={addIncome} className="bg-emerald-500 hover:bg-emerald-600 text-white shrink-0">
              <Plus className="w-4 h-4" />
            </Button>
          </motion.div>
        )}
        {incomeEntries.length > 0 && (
          <div className="space-y-2">
            {incomeEntries.map(e => (
              <div key={e.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium">{e.category}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-emerald-600 font-semibold">${parseFloat(e.amount).toLocaleString()}</span>
                  <button onClick={() => removeIncome(e.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <div className="flex justify-between px-3 pt-1 text-sm font-semibold">
              <span>Total</span>
              <span className="text-emerald-600">
                ${incomeEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0).toLocaleString()}
              </span>
            </div>
          </div>
        )}
        {incomeEntries.length === 0 && !activeCategory && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Tap a category above to add your first income source
          </p>
        )}
      </div>
    ),

    // ── Step 2: Expenses ───────────────────────────────────────────────────────
    2: (
      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Your monthly expenses</h3>
          <p className="text-sm text-muted-foreground">Check everything that applies and enter the amount</p>
        </div>
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {expenseItems.map((item, idx) => (
            <div key={item.category} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${item.enabled ? "bg-muted/50 border-emerald-200 dark:border-emerald-800" : "border-transparent hover:bg-muted/30"}`}>
              <Checkbox
                checked={item.enabled}
                onCheckedChange={(v) => toggleExpense(idx, v === true)}
                className="shrink-0"
              />
              <span className="text-sm flex-1 min-w-0 truncate">{item.label}</span>
              {item.enabled && (
                <div className="relative w-28 shrink-0">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                  <Input
                    className="pl-5 h-8 text-sm"
                    placeholder="0"
                    type="number"
                    min="0"
                    value={item.amount}
                    onChange={e => setExpenseAmount(idx, e.target.value)}
                    autoFocus={item.enabled && item.amount === ""}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ),

    // ── Step 3: Budget Split ───────────────────────────────────────────────────
    3: (
      <div className="p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold">Budget split</h3>
          <p className="text-sm text-muted-foreground">How do you want to allocate your income?</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-emerald-400 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
          onClick={() => { setNeedsPct(50); setSavingsPct(20); }}
        >
          <Check className="w-3.5 h-3.5 mr-1.5" /> Use 50/30/20 rule
        </Button>

        <div className="h-4 flex rounded-full overflow-hidden">
          <div style={{ width: `${needsPct}%`, background: "#ef4444" }} className="transition-all" />
          <div style={{ width: `${wantsPct}%`, background: "#f59e0b" }} className="transition-all" />
          <div style={{ width: `${savingsPct}%`, background: "#10b981" }} className="transition-all" />
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Needs <span className="text-muted-foreground">(rent, utilities, food)</span></Label>
              <span className="font-semibold text-red-500">{needsPct}%</span>
            </div>
            <Slider value={[needsPct]} onValueChange={handleNeedsChange} min={0} max={80} step={1} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Savings <span className="text-muted-foreground">(goals, investments)</span></Label>
              <span className="font-semibold text-emerald-600">{savingsPct}%</span>
            </div>
            <Slider value={[savingsPct]} onValueChange={handleSavingsChange} min={0} max={60} step={1} />
          </div>
          <div className="flex justify-between text-sm">
            <Label className="text-muted-foreground">Wants <span className="text-xs">(auto-calculated)</span></Label>
            <span className="font-semibold text-amber-500">{wantsPct}%</span>
          </div>
        </div>
      </div>
    ),

    // ── Step 4: First Goal ─────────────────────────────────────────────────────
    4: (
      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Set your first goal</h3>
          <p className="text-sm text-muted-foreground">Something to save towards — you can add more later</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_GOALS.map((g, i) => (
            <button
              key={g.title}
              onClick={() => setSelectedGoalPreset(selectedGoalPreset === i ? null : i)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors ${
                selectedGoalPreset === i
                  ? "bg-emerald-50 border-emerald-400 dark:bg-emerald-950 dark:border-emerald-600"
                  : "border-border hover:border-emerald-300 bg-muted/30"
              }`}
            >
              <span className="text-xl">{g.icon}</span>
              <span className="text-xs font-semibold leading-tight">{g.title}</span>
              <span className="text-xs text-muted-foreground">${parseInt(g.targetAmount).toLocaleString()}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setSelectedGoalPreset(selectedGoalPreset === "custom" ? null : "custom")}
          className={`w-full flex items-center gap-2 p-3 rounded-xl border text-left text-sm transition-colors ${
            selectedGoalPreset === "custom"
              ? "bg-emerald-50 border-emerald-400 dark:bg-emerald-950 dark:border-emerald-600"
              : "border-dashed border-border hover:border-emerald-300"
          }`}
        >
          <Plus className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Custom goal</span>
        </button>
        {selectedGoalPreset === "custom" && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2.5 p-3 rounded-xl bg-muted/50">
            <Input placeholder="Goal name (e.g. House down payment)" value={customGoal.title} onChange={e => setCustomGoal(p => ({ ...p, title: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input className="pl-6" placeholder="Target amount" type="number" value={customGoal.targetAmount} onChange={e => setCustomGoal(p => ({ ...p, targetAmount: e.target.value }))} />
              </div>
              <Input type="date" placeholder="Deadline" value={customGoal.deadline} onChange={e => setCustomGoal(p => ({ ...p, deadline: e.target.value }))} />
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input className="pl-6" placeholder="Monthly contribution (optional)" type="number" value={customGoal.monthlyContribution} onChange={e => setCustomGoal(p => ({ ...p, monthlyContribution: e.target.value }))} />
            </div>
          </motion.div>
        )}
        <button onClick={() => setSelectedGoalPreset(null)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Skip this step
        </button>
      </div>
    ),

    // ── Step 5: AI Chat Tour ───────────────────────────────────────────────────
    5: (
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Your AI finance assistant</h3>
            <p className="text-sm text-muted-foreground">Ask anything about your money in plain English</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          The AI has full context of your transactions and goals. Here's what you can do:
        </p>
        <div className="grid grid-cols-1 gap-2">
          {CHAT_PROMPTS.map(p => (
            <div key={p.label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-muted/50 border border-border/60 cursor-default">
              <div className="w-5 h-5 rounded-md bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                {p.icon}
              </div>
              <span className="text-sm text-muted-foreground">"{p.label}"</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          You'll find the AI chat in the <strong>Scenario Lab</strong> from the sidebar.
        </p>
      </div>
    ),

    // ── Step 6: Telegram Bot ───────────────────────────────────────────────────
    6: (
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Log expenses via Telegram</h3>
            <p className="text-sm text-muted-foreground">Your finances, in your pocket</p>
          </div>
        </div>
        <div className="space-y-2.5">
          {[
            { icon: MessageCircle, title: "Chat to log", desc: 'Say "spent $12 on coffee" and it\'s added instantly' },
            { icon: Receipt, title: "Scan receipts", desc: "Send a photo of a bill — the bot reads and logs it" },
            { icon: BarChart3, title: "Check in anywhere", desc: "Ask for your current balance or spending summary" },
            { icon: Target, title: "Manage goals", desc: "Create, update, and track savings goals from Telegram" },
          ].map(item => (
            <div key={item.title} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
              <item.icon className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 p-3 text-sm text-sky-700 dark:text-sky-300">
          To link your Telegram account, go to <strong>Settings → Telegram</strong> after setup and scan the QR code.
        </div>
      </div>
    ),

    // ── Step 7: All Set ────────────────────────────────────────────────────────
    7: (
      <div className="p-8 text-center space-y-6 relative">
        <Confetti />
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          className="flex justify-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
        </motion.div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">You're all set!</h2>
          <p className="text-muted-foreground mt-1">FinTrack is ready to help you take control of your finances.</p>
        </div>
        <div className="rounded-xl bg-muted/50 border border-border/60 p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary</p>
          {incomeEntries.length > 0 && (
            <div className="flex justify-between text-sm">
              <span>Income sources added</span>
              <span className="font-semibold text-emerald-600">{incomeEntries.length}</span>
            </div>
          )}
          {expenseItems.filter(e => e.enabled && parseFloat(e.amount) > 0).length > 0 && (
            <div className="flex justify-between text-sm">
              <span>Expense categories</span>
              <span className="font-semibold text-red-500">{expenseItems.filter(e => e.enabled && parseFloat(e.amount) > 0).length}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span>Budget split</span>
            <span className="font-semibold">{needsPct}/{wantsPct}/{savingsPct}</span>
          </div>
          {selectedGoalPreset !== null && (
            <div className="flex justify-between text-sm">
              <span>Goal created</span>
              <span className="font-semibold text-indigo-600">
                {selectedGoalPreset === "custom" ? customGoal.title || "Custom" : PRESET_GOALS[selectedGoalPreset].title}
              </span>
            </div>
          )}
        </div>
        <Button
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white h-11"
          onClick={handleComplete}
        >
          Start using FinTrack <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    ),
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-lg p-0 gap-0 overflow-hidden [&>button]:hidden"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        {/* Header */}
        {step > 0 && step < 7 && (
          <div className="px-6 pt-5 pb-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">
                Step {step} of 6
              </span>
              <button
                onClick={skipToEnd}
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              >
                Skip setup →
              </button>
            </div>
            <Progress value={(step / 6) * 100} className="h-1.5" />
          </div>
        )}

        {/* Step content */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeInOut" }}
          >
            {stepContent[step]}
          </motion.div>
        </AnimatePresence>

        {/* Footer nav (steps 1–6) */}
        {step > 0 && step < 7 && (
          <div className="flex items-center justify-between px-6 pb-5 pt-0">
            <Button variant="ghost" size="sm" onClick={back} className="gap-1 text-muted-foreground">
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            <Button
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1"
              onClick={step === 6 ? () => goTo(7) : next}
            >
              {step === 6 ? "Finish" : "Next"} <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
