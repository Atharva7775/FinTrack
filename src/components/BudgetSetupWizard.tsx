import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useFinanceStore, expenseCategories, type Budget, type Category } from "@/store/financeStore";
import { saveBudget } from "@/lib/supabaseSync";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Check, ChevronRight, Sparkles, SlidersIcon, Pencil, Info } from "lucide-react";

interface WizardBudget {
  category: Category;
  type: "percentage" | "fixed";
  percentage?: number;
  fixedAmount?: number;
  alertThreshold: number;
}

// ─── Preset templates ────────────────────────────────────────────────────────
const TEMPLATES: { name: string; description: string; allocations: Partial<Record<Category, number>> }[] = [
  {
    name: "Balanced",
    description: "Moderate savings with room for fun",
    allocations: {
      Rent: 25, Food: 10, Travel: 8, Entertainment: 5,
      Shopping: 8, Subscriptions: 4, Healthcare: 4, Utilities: 5,
      Education: 2, Other: 5,
    },
  },
  {
    name: "Aggressive Saver",
    description: "Maximize savings, minimize extras",
    allocations: {
      Rent: 28, Food: 12, Travel: 8, Entertainment: 3,
      Shopping: 4, Subscriptions: 2, Healthcare: 4, Utilities: 6,
      Education: 3, Other: 3,
    },
  },
  {
    name: "Flexible",
    description: "More spending freedom, lighter constraints",
    allocations: {
      Rent: 22, Food: 10, Travel: 7, Entertainment: 8,
      Shopping: 12, Subscriptions: 5, Healthcare: 4, Utilities: 5,
      Education: 2, Other: 5,
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function templateToBudgets(allocations: Partial<Record<Category, number>>): WizardBudget[] {
  return expenseCategories
    .filter((cat) => cat !== "Savings" && (allocations[cat] ?? 0) > 0)
    .map((cat) => ({
      category: cat,
      type: "percentage" as const,
      percentage: allocations[cat],
      alertThreshold: 80,
    }));
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
}

export function BudgetSetupWizard({ open, onClose }: Props) {
  const { user } = useAuth();
  const { setBudgets, transactions, goals } = useFinanceStore();
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [budgets, setBudgetsLocal] = useState<WizardBudget[]>([]);
  const [saving, setSaving] = useState(false);
  const [customIncomeStr, setCustomIncomeStr] = useState("");

  // Detect monthly income from the most recent month with income transactions
  const detectedIncome = useMemo(() => {
    const incomeTx = transactions.filter(t => t.type === 'income');
    if (incomeTx.length === 0) return 0;
    const months = Array.from(new Set(incomeTx.map(t => t.date.slice(0, 7)))).sort().reverse();
    const latest = months[0];
    return incomeTx
      .filter(t => t.date.startsWith(latest))
      .reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
  }, [transactions]);

  // Savings goals reduce available income ("pay yourself first")
  const totalGoalSavings = goals.reduce((s, g) => s + g.monthlyContribution, 0);
  const effectiveIncome = Math.max(detectedIncome - totalGoalSavings, 0);

  // Use custom override if provided, otherwise fall back to income after goal deductions
  const monthlyIncome = customIncomeStr !== "" ? (parseFloat(customIncomeStr) || 0) : effectiveIncome;

  // Step 0: Choose approach (template vs manual)
  // Step 1: Pick / review template (or skip for manual)
  // Step 2: Fine-tune per-category
  // Step 3: Confirm & save

  function pickTemplate(idx: number) {
    setSelectedTemplate(idx);
    setBudgetsLocal(templateToBudgets(TEMPLATES[idx].allocations));
  }

  function startManual() {
    setSelectedTemplate(null);
    setBudgetsLocal(
      expenseCategories
        .filter((c) => c !== "Savings")
        .map((cat) => ({ category: cat, type: "percentage" as const, percentage: 0, alertThreshold: 80 }))
    );
  }

  function updateBudget(idx: number, changes: Partial<WizardBudget>) {
    setBudgetsLocal((prev) => prev.map((b, i) => (i === idx ? { ...b, ...changes } : b)));
  }

  async function handleSave() {
    if (!user?.email) return;
    setSaving(true);
    try {
      const userEmail = user.email;
      const saved: Budget[] = [];
      for (const wb of budgets) {
        if ((wb.type === "percentage" && (wb.percentage ?? 0) === 0) ||
            (wb.type === "fixed" && (wb.fixedAmount ?? 0) === 0)) continue;
        const draft: Budget = {
          id: crypto.randomUUID(),
          category: wb.category,
          type: wb.type,
          percentage: wb.percentage,
          fixedAmount: wb.fixedAmount,
          rolloverBalance: 0,
          alertThreshold: wb.alertThreshold,
        };
        const result = await saveBudget(userEmail, draft);
        saved.push(result ?? draft);
      }
      setBudgets(saved);
      toast.success(`Saved ${saved.length} budget${saved.length !== 1 ? "s" : ""}!`);
      onClose();
    } catch {
      toast.error("Failed to save budgets. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const activeBudgets = budgets.filter(
    (b) =>
      (b.type === "percentage" && (b.percentage ?? 0) > 0) ||
      (b.type === "fixed" && (b.fixedAmount ?? 0) > 0)
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="text-2xl">🐷</span>
            {step === 0 && "Set Up Your Monthly Budgets"}
            {step === 1 && "Choose a Template"}
            {step === 2 && "Fine-tune Budgets"}
            {step === 3 && "Confirm & Save"}
          </DialogTitle>
          <DialogDescription>
            {step === 0 && "FinTrack will alert you when you approach your spending limits."}
            {step === 1 && "Select a preset that matches your lifestyle, then customize."}
            {step === 2 && "Adjust each category limit. You can use % of income or a fixed amount."}
            {step === 3 && `${activeBudgets.length} budget${activeBudgets.length !== 1 ? "s" : ""} ready to save.`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 0: approach picker ── */}
        {step === 0 && (
          <div className="grid gap-3 mt-4">
            <button
              className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 text-left transition-colors"
              onClick={() => { pickTemplate(0); setStep(1); }}
            >
              <Sparkles className="h-6 w-6 text-primary shrink-0" />
              <div>
                <div className="font-semibold">Start from a template</div>
                <div className="text-sm text-muted-foreground">Pick a preset and customize from there</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
            </button>
            <button
              className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 text-left transition-colors"
              onClick={() => { startManual(); setStep(2); }}
            >
              <Pencil className="h-6 w-6 text-primary shrink-0" />
              <div>
                <div className="font-semibold">Set manually</div>
                <div className="text-sm text-muted-foreground">Enter limits for each category yourself</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
            </button>
          </div>
        )}

        {/* ── Step 1: template picker ── */}
        {step === 1 && (
          <div className="grid gap-3 mt-4">
            {TEMPLATES.map((t, i) => (
              <button
                key={t.name}
                onClick={() => { pickTemplate(i); }}
                className={`flex items-start gap-4 p-4 rounded-xl border text-left transition-colors ${
                  selectedTemplate === i
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50 hover:bg-primary/5"
                }`}
              >
                <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedTemplate === i ? "border-primary" : "border-muted-foreground"}`}>
                  {selectedTemplate === i && <Check className="h-3 w-3 text-primary" />}
                </div>
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-sm text-muted-foreground">{t.description}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(t.allocations).map(([cat, pct]) => (
                      <Badge key={cat} variant="secondary" className="text-xs">{cat} {pct}%</Badge>
                    ))}
                  </div>
                </div>
              </button>
            ))}
            <div className="flex justify-between mt-2">
              <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={() => setStep(2)} disabled={selectedTemplate === null}>
                Customize <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: fine-tune per-category ── */}
        {step === 2 && (
          <div className="mt-4 space-y-3">
            {/* Income context banner */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                {detectedIncome > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">Detected income:</span> ${detectedIncome.toLocaleString()}/mo
                    </p>
                    {totalGoalSavings > 0 && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-amber-600">Goal contributions:</span> −${totalGoalSavings.toLocaleString()}/mo
                        {" "}({goals.filter(g => g.monthlyContribution > 0).map(g => g.title).join(", ")})
                      </p>
                    )}
                    <p className="text-sm text-foreground">
                      <span className="font-semibold text-green-600">Available for budgets:</span> ${(customIncomeStr !== "" ? (parseFloat(customIncomeStr) || 0) : effectiveIncome).toLocaleString()}/mo
                    </p>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-foreground">No income found in your transactions.</p>
                )}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Override available income:</Label>
                  <Input
                    type="number"
                    placeholder={effectiveIncome > 0 ? String(effectiveIncome) : "e.g. 4000"}
                    value={customIncomeStr}
                    onChange={e => setCustomIncomeStr(e.target.value)}
                    className="h-7 w-28 text-sm"
                  />
                  {customIncomeStr !== "" && (
                    <button className="text-xs text-muted-foreground underline" onClick={() => setCustomIncomeStr("")}>reset</button>
                  )}
                </div>
              </div>
            </div>

            {budgets.map((b, idx) => {
              const dollarPreview = b.type === "percentage" && monthlyIncome > 0
                ? `≈ $${Math.round(((b.percentage ?? 0) / 100) * monthlyIncome).toLocaleString()}/mo`
                : null;
              return (
              <div key={b.category} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className="w-28 text-sm font-medium shrink-0">{b.category}</div>
                <div className="flex items-center gap-1">
                  <button
                    className={`px-2 py-0.5 text-xs rounded ${b.type === "percentage" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    onClick={() => updateBudget(idx, { type: "percentage" })}
                  >%</button>
                  <button
                    className={`px-2 py-0.5 text-xs rounded ${b.type === "fixed" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    onClick={() => updateBudget(idx, { type: "fixed" })}
                  >$</button>
                </div>
                <Input
                  type="number"
                  min={0}
                  className="w-20 h-8 text-sm"
                  value={b.type === "percentage" ? (b.percentage ?? 0) : (b.fixedAmount ?? 0)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updateBudget(idx, b.type === "percentage" ? { percentage: v } : { fixedAmount: v });
                  }}
                />
                <span className="text-xs text-muted-foreground shrink-0">
                  {b.type === "percentage" ? "% of income" : "per month"}
                </span>
                {dollarPreview && (
                  <span className="text-xs font-medium text-primary shrink-0">{dollarPreview}</span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Alert at</Label>
                  <Input
                    type="number"
                    min={50}
                    max={99}
                    className="w-14 h-8 text-sm"
                    value={b.alertThreshold}
                    onChange={(e) => updateBudget(idx, { alertThreshold: Number(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              );
            })}
            <div className="flex justify-between mt-4">
              <Button variant="ghost" onClick={() => setStep(selectedTemplate !== null ? 1 : 0)}>Back</Button>
              <Button onClick={() => setStep(3)}>
                Review <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: confirm ── */}
        {step === 3 && (
          <div className="mt-4 space-y-3">
            {monthlyIncome > 0 && (
              <p className="text-xs text-muted-foreground px-1">
                Based on <span className="font-semibold text-foreground">${monthlyIncome.toLocaleString()}/mo</span> available
                {customIncomeStr !== "" ? " (custom override)" : totalGoalSavings > 0 ? ` (income after $${totalGoalSavings.toLocaleString()} goal savings)` : " (from your transactions)"}.
              </p>
            )}
            {activeBudgets.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No budgets set. Go back and enter at least one limit.</p>
            ) : (
              activeBudgets.map((b) => {
                const dollarAmount = b.type === "percentage" && monthlyIncome > 0
                  ? Math.round(((b.percentage ?? 0) / 100) * monthlyIncome)
                  : null;
                return (
                  <div key={b.category} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <span className="font-medium">{b.category}</span>
                    <span className="text-sm text-muted-foreground">
                      {b.type === "percentage"
                        ? <>{b.percentage}% of income{dollarAmount !== null ? <span className="text-primary font-medium ml-1">≈ ${dollarAmount.toLocaleString()}</span> : null}</>
                        : `$${b.fixedAmount?.toLocaleString()} / month`}
                    </span>
                    <Badge variant="secondary">alert @ {b.alertThreshold}%</Badge>
                  </div>
                );
              })
            )}
            <div className="flex justify-between mt-4">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={handleSave} disabled={saving || activeBudgets.length === 0}>
                {saving ? "Saving…" : `Save ${activeBudgets.length} Budget${activeBudgets.length !== 1 ? "s" : ""}`}
                <Check className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
