import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useFinanceStore, selectExpenseAutopsy, CategoryType } from "@/store/financeStore";
import { getCurrentMonthKey, getMonthLabel } from "@/lib/utils";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function ExpenseAutopsy() {
  const { transactions, userCategoryType, setCategoryType } = useFinanceStore();
  // --- Month Selector State ---
  // Get all unique months from transactions (YYYY-MM)
  const allMonths = useMemo(() => {
    const months = new Set<string>();
    transactions.forEach((t) => months.add(t.date.slice(0, 7)));
    return Array.from(months).sort().reverse(); // newest first
  }, [transactions]);
  const [selectedMonth, setSelectedMonth] = useState(() => allMonths[0] || getCurrentMonthKey());

  // Sync selectedMonth when available months change (e.g. after DB load)
  useEffect(() => {
    if (allMonths.length > 0 && !allMonths.includes(selectedMonth)) {
      setSelectedMonth(allMonths[0]);
    }
  }, [allMonths]);

  const autopsy = useMemo(
    () => selectExpenseAutopsy(transactions, selectedMonth),
    [transactions, selectedMonth]
  );

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8 pb-12">
      {/* Month Selector UI */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground tracking-tight">Expense Autopsy</h1>
          <p className="text-muted-foreground">Detailed breakdown of {getMonthLabel(selectedMonth)} spending: Essential vs. Optional.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="month-select-autopsy" className="text-sm text-muted-foreground">Month:</label>
          <select
            id="month-select-autopsy"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background"
          >
            {allMonths.map((m) => (
              <option key={m} value={m}>
                {new Date(m + "-01").toLocaleString('default', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Categories Grid */}
      <motion.div variants={item} className="space-y-4">
        <h3 className="text-xl font-display font-bold text-foreground">Full Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {autopsy.categories.map(cat => {
            // Use user override if present
            const userType = userCategoryType[cat.category] || cat.type;
            return (
              <div key={cat.category} className={`p-5 rounded-2xl glass-card transition-all duration-300 hover:shadow-lg border ${userType === 'essential' ? 'border-primary/20' : 'border-border'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${userType === 'essential' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {userType}
                  </span>
                  <select
                    value={userType}
                    onChange={e => setCategoryType(cat.category, e.target.value as CategoryType)}
                    className="ml-2 border rounded px-1 py-0.5 text-xs bg-background"
                  >
                    <option value="essential">essential</option>
                    <option value="optional">optional</option>
                  </select>
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
                    className={`h-full ${userType === 'essential' ? 'bg-primary' : 'bg-savings'}`}
                    style={{ width: `${Math.min(100, (cat.amount / autopsy.totalExpenses) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
