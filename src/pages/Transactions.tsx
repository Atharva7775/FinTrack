import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { useFinanceStore, type Transaction, type Category, incomeCategories, expenseCategories, type TransactionType } from "@/store/financeStore";
import { CursorTooltip } from "@/components/CursorTooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAvailableMonthKeys, getCurrentMonthKey, getMonthLabel } from "@/lib/utils";

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function Transactions() {
  const { transactions, addTransaction, deleteTransaction, updateTransaction } = useFinanceStore();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | TransactionType>("all");
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ type: "expense" as TransactionType, amount: "", category: "" as Category | "", date: today, note: "" });

  const transactionDates = useMemo(() => transactions.map((t) => t.date), [transactions]);
  const availableMonths = useMemo(
    () => getAvailableMonthKeys(transactionDates),
    [transactionDates],
  );
  const currentMonthKey = getCurrentMonthKey();
  const defaultStatementMonth =
    availableMonths.includes(currentMonthKey) ? currentMonthKey : availableMonths[availableMonths.length - 1] ?? currentMonthKey;
  const [statementMonthKey, setStatementMonthKey] = useState(defaultStatementMonth);

  const filtered = filter === "all" ? transactions : transactions.filter((t) => t.type === filter);
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

  const categories = form.type === "income" ? incomeCategories : expenseCategories;

  const resetForm = () => setForm({ type: "expense", amount: "", category: "", date: today, note: "" });

  const handleOpen = (tx?: Transaction) => {
    if (tx) {
      setEditId(tx.id);
      setForm({ type: tx.type, amount: String(tx.amount), category: tx.category, date: tx.date, note: tx.note });
    } else {
      setEditId(null);
      resetForm();
    }
    setOpen(true);
  };

  const handleSubmit = () => {
    const amount = parseFloat(form.amount);
    if (!amount || !form.category || !form.date) return;
    if (editId) {
      updateTransaction(editId, { type: form.type, amount, category: form.category as Category, date: form.date, note: form.note });
    } else {
      addTransaction({ type: form.type, amount, category: form.category as Category, date: form.date, note: form.note });
    }
    setOpen(false);
    resetForm();
    setEditId(null);
  };

  const handleDownloadStatement = () => {
    const monthKey = statementMonthKey;
    const monthLabel = getMonthLabel(monthKey);
    const monthTransactions = transactions.filter((t) => t.date.startsWith(monthKey));

    const totalIncome = monthTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = monthTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    const netSavings = totalIncome - totalExpenses;

    const header = ["Date", "Type", "Category", "Amount", "Note"];
    const rows = monthTransactions.map((t) => [
      t.date,
      t.type,
      t.category,
      t.amount.toFixed(2),
      t.note,
    ]);

    const escape = (value: string | number) => {
      const str = String(value ?? "");
      const needsQuotes = /[",\n]/.test(str);
      const cleaned = str.replace(/"/g, '""');
      return needsQuotes ? `"${cleaned}"` : cleaned;
    };

    const lines: string[] = [];
    lines.push(`"FinTrack Monthly Statement",${escape(monthLabel)}`);
    lines.push("");
    lines.push(header.map(escape).join(","));
    rows.forEach((row) => {
      lines.push(row.map(escape).join(","));
    });
    lines.push("");
    lines.push(`"Total Income",,,${escape(totalIncome.toFixed(2))}`);
    lines.push(`"Total Expenses",,,${escape(totalExpenses.toFixed(2))}`);
    lines.push(`"Net Savings",,,${escape(netSavings.toFixed(2))}`);

    const csvContent = lines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const [year, month] = monthKey.split("-");
    link.href = url;
    link.download = `fintrack-statement-${year}-${month}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">{transactions.length} total transactions</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <CursorTooltip content="Choose which month you want to export as a statement.">
            <Select value={statementMonthKey} onValueChange={(v) => setStatementMonthKey(v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((key) => (
                  <SelectItem key={key} value={key}>
                    {getMonthLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CursorTooltip>
          <CursorTooltip content="Generate and download a CSV statement for the selected month.">
            <Button variant="outline" onClick={handleDownloadStatement}>
              Download statement
            </Button>
          </CursorTooltip>
          <CursorTooltip content="Filter the list to show all transactions, only income, or only expenses.">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </CursorTooltip>
          <CursorTooltip content="Open the form to add a new income or expense transaction.">
            <Button onClick={() => handleOpen()} className="gap-2">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </CursorTooltip>
        </div>
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {sorted.map((tx) => (
            <motion.div
              key={tx.id}
              variants={item}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, x: -20 }}
              layout
              className="glass-card rounded-xl p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                  tx.type === "income" ? "bg-income-muted text-income" : "bg-expense-muted text-expense"
                }`}>
                  {tx.type === "income" ? "+" : "-"}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{tx.category}</p>
                  <p className="text-xs text-muted-foreground truncate">{tx.note} · {tx.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`font-display font-semibold ${tx.type === "income" ? "text-income" : "text-expense"}`}>
                  {tx.type === "income" ? "+" : "-"}${tx.amount.toLocaleString()}
                </span>
                <CursorTooltip content="Edit this transaction (amount, category, date, or note).">
                  <button onClick={() => handleOpen(tx)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <Edit2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </CursorTooltip>
                <CursorTooltip content="Delete this transaction permanently.">
                  <button onClick={() => deleteTransaction(tx.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </button>
                </CursorTooltip>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{editId ? "Edit" : "Add"} Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <CursorTooltip content="Choose whether this entry is money received (income) or money spent (expense).">
              <div className="flex gap-2">
                {(["income", "expense"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, type: t, category: "" })}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                      form.type === t
                        ? t === "income" ? "bg-income text-income-foreground" : "bg-expense text-expense-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {t === "income" ? "Income" : "Expense"}
                  </button>
                ))}
              </div>
            </CursorTooltip>
            <CursorTooltip content="Enter the transaction amount in dollars (e.g. 150.00).">
              <div>
                <Label>Amount</Label>
                <Input type="number" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </CursorTooltip>
            <CursorTooltip content="Select the category that best matches this transaction (e.g. Salary, Rent, Food).">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CursorTooltip>
            <CursorTooltip content="The date when this income or expense occurred.">
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </CursorTooltip>
            <CursorTooltip content="Optional short description or memo for this transaction (e.g. 'Groceries at Whole Foods').">
              <div>
                <Label>Note</Label>
                <Input placeholder="Optional note..." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </CursorTooltip>
            <CursorTooltip content={editId ? "Save your edits to this transaction." : "Add this transaction to your list."}>
              <Button onClick={handleSubmit} className="w-full">{editId ? "Save Changes" : "Add Transaction"}</Button>
            </CursorTooltip>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
