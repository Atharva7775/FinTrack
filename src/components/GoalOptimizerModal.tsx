import { useMemo } from "react";
import { useFinanceStore, expenseCategories, type Category } from "@/store/financeStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getCurrentMonthKey } from "@/lib/utils";

interface GoalOptimizerModalProps {
  goalId: string;
  onClose: () => void;
}

/** Months between now and deadline (at least 1) */
function monthsUntil(deadline: string): number {
  const now = new Date();
  const end = new Date(deadline);
  const m = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return Math.max(1, m);
}

export function GoalOptimizerModal({ goalId, onClose }: GoalOptimizerModalProps) {
  const { goals, transactions } = useFinanceStore();
  const goal = goals.find((g) => g.id === goalId);
  const currentMonth = getCurrentMonthKey();

  const result = useMemo(() => {
    if (!goal) return null;
    const monthsLeft = monthsUntil(goal.deadline);
    const remaining = goal.targetAmount - goal.currentAmount;
    const requiredMonthly = remaining / monthsLeft;
    const gap = requiredMonthly - goal.monthlyContribution;

    // Last 3 months expense by category (average monthly)
    const monthKeys: string[] = [];
    const [y, m] = currentMonth.split("-").map(Number);
    for (let i = 0; i < 3; i++) {
      const d = new Date(y, m - 1 - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const byCategory: Record<string, number> = {};
    expenseCategories.forEach((c) => (byCategory[c] = 0));
    let totalExpense = 0;
    transactions
      .filter((t) => t.type === "expense" && monthKeys.some((k) => t.date.startsWith(k)))
      .forEach((t) => {
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
        totalExpense += t.amount;
      });
    const avgByCategory = Object.entries(byCategory).map(([cat, sum]) => ({
      category: cat as Category,
      avg: sum / 3,
    })).filter((x) => x.avg > 0).sort((a, b) => b.avg - a.avg);

    // Recommend reductions to close gap (from highest spending categories)
    const recommendations: { category: string; currentAvg: number; reduceBy: number }[] = [];
    let gapRemaining = gap;
    for (const { category, avg } of avgByCategory) {
      if (gapRemaining <= 0) break;
      const reduceBy = Math.min(avg, gapRemaining);
      if (reduceBy > 0) {
        recommendations.push({ category, currentAvg: avg, reduceBy });
        gapRemaining -= reduceBy;
      }
    }

    const totalRecommendedCut = recommendations.reduce((s, r) => s + r.reduceBy, 0);
    const newMonthlySavings = goal.monthlyContribution + totalRecommendedCut;
    const newMonthsToGoal = newMonthlySavings > 0 ? Math.ceil(remaining / newMonthlySavings) : monthsLeft;
    const monthsSaved = Math.max(0, monthsLeft - newMonthsToGoal);

    return {
      goal,
      monthsLeft,
      remaining,
      requiredMonthly,
      gap,
      currentMonthlyContribution: goal.monthlyContribution,
      recommendations,
      totalRecommendedCut,
      newMonthlySavings,
      newMonthsToGoal,
      monthsSaved,
      onTrack: gap <= 0,
    };
  }, [goalId, goal, transactions, currentMonth]);

  if (!goal || !result) return null;

  const {
    monthsLeft,
    remaining,
    requiredMonthly,
    gap,
    currentMonthlyContribution,
    recommendations,
    totalRecommendedCut,
    newMonthsToGoal,
    monthsSaved,
    onTrack,
  } = result;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Optimize: {goal.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2 text-sm">
          <div className="rounded-xl bg-muted/50 p-4 space-y-2">
            <p className="font-medium text-foreground">Target & timeline</p>
            <p className="text-muted-foreground">
              You need <span className="font-semibold text-foreground">${remaining.toLocaleString()}</span> in{" "}
              <span className="font-semibold text-foreground">{monthsLeft} months</span>.
            </p>
            <p className="text-muted-foreground">
              <span className="font-semibold text-foreground">Required monthly savings:</span> ${requiredMonthly.toFixed(0)}/mo
            </p>
            <p className="text-muted-foreground">
              Your planned contribution: <span className="font-semibold text-foreground">${currentMonthlyContribution.toLocaleString()}/mo</span>
            </p>
            {onTrack ? (
              <p className="text-primary font-medium">
                You're on track. At this rate you'll reach the goal in {monthsLeft} months.
              </p>
            ) : (
              <p className="text-destructive font-medium">
                Gap: <span className="font-semibold">${gap.toFixed(0)}/mo</span> — increase savings or push the deadline.
              </p>
            )}
          </div>

          {!onTrack && recommendations.length > 0 && (
            <>
              <div className="rounded-xl border border-border p-4 space-y-2">
                <p className="font-medium text-foreground">Recommended spending reductions (to close the gap)</p>
                <p className="text-muted-foreground text-xs">Based on your last 3 months of expenses. Reduce these categories to save an extra ${totalRecommendedCut.toFixed(0)}/mo.</p>
                <ul className="space-y-1.5">
                  {recommendations.map((r) => (
                    <li key={r.category} className="flex justify-between">
                      <span className="text-muted-foreground">{r.category}</span>
                      <span className="font-medium text-foreground">−${r.reduceBy.toFixed(0)}/mo</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-primary/10 p-4 space-y-1">
                <p className="font-medium text-foreground">If you make these changes</p>
                <p className="text-muted-foreground">
                  New monthly savings: <span className="font-semibold text-foreground">${newMonthlySavings.toFixed(0)}/mo</span>
                </p>
                <p className="text-muted-foreground">
                  Revised completion: <span className="font-semibold text-foreground">{newMonthsToGoal} months</span>
                </p>
                <p className="text-primary font-medium">
                  You'd reach your goal <span className="font-bold">{monthsSaved} months</span> sooner.
                </p>
              </div>
            </>
          )}

          {!onTrack && recommendations.length === 0 && gap > 0 && (
            <p className="text-muted-foreground">
              We don't have enough expense history to suggest category cuts. Add more transactions or consider increasing income / pushing the deadline.
            </p>
          )}
        </div>
        <Button onClick={onClose} className="w-full">Done</Button>
      </DialogContent>
    </Dialog>
  );
}
