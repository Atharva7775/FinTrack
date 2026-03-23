import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Edit2, Download, Mail } from "lucide-react";
import { useFinanceStore, type Transaction, type Category, incomeCategories, expenseCategories, type TransactionType } from "@/store/financeStore";
import { CursorTooltip } from "@/components/CursorTooltip";
import { useAuth } from "@/hooks/useAuth";
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
  const { transactions: allTx, addTransaction, deleteTransaction, updateTransaction, viewMode } = useFinanceStore();
  const transactions = useMemo(
    () => allTx.filter((t) => (viewMode === "splitwise" ? t.isSplitwise : !t.isSplitwise)),
    [allTx, viewMode]
  );
  const { user, signIn } = useAuth();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | TransactionType>("all");

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    type: "expense" as TransactionType,
    amount: "",
    category: "" as Category | "",
    date: today,
    note: "",
  });

  // ── Month keys ─────────────────────────────────────────────────────────────
  const transactionDates = useMemo(() => transactions.map((t) => t.date), [transactions]);
  const availableMonths = useMemo(() => getAvailableMonthKeys(transactionDates), [transactionDates]);

  const currentMonthKey = getCurrentMonthKey();
  const defaultMonth =
    availableMonths.includes(currentMonthKey)
      ? currentMonthKey
      : availableMonths[availableMonths.length - 1] ?? currentMonthKey;

  // Single selected month drives BOTH the visible list AND the statement export
  const [selectedMonthKey, setSelectedMonthKey] = useState(defaultMonth);

  // ── Filtered list (fix: month + type both applied) ──────────────────────────
  const filtered = useMemo(() => {
    let result = transactions.filter((t) => t.date.startsWith(selectedMonthKey));
    if (filter !== "all") result = result.filter((t) => t.type === filter);
    return [...result].sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, selectedMonthKey, filter]);

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

  // ── Build CSV content ───────────────────────────────────────────────────────
  const buildCsvContent = () => {
    const monthLabel = getMonthLabel(selectedMonthKey);
    const monthTransactions = transactions.filter((t) => t.date.startsWith(selectedMonthKey));
    const totalIncome = monthTransactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const totalExpenses = monthTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const netSavings = totalIncome - totalExpenses;

    const header = ["Date", "Type", "Category", "Amount", "Note"];
    const rows = monthTransactions.map((t) => [t.date, t.type, t.category, t.amount.toFixed(2), t.note]);

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
    rows.forEach((row) => lines.push(row.map(escape).join(",")));
    lines.push("");
    lines.push(`"Total Income",,,${escape(totalIncome.toFixed(2))}`);
    lines.push(`"Total Expenses",,,${escape(totalExpenses.toFixed(2))}`);
    lines.push(`"Net Savings",,,${escape(netSavings.toFixed(2))}`);

    return { csvContent: lines.join("\n"), monthLabel, totalIncome, totalExpenses, netSavings };
  };

  // ── Download CSV ───────────────────────────────────────────────────────────
  const handleDownloadStatement = () => {
    const { csvContent } = buildCsvContent();
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const [year, month] = selectedMonthKey.split("-");
    link.href = url;
    link.download = `fintrack-statement-${year}-${month}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ── Email Statement via mailto ─────────────────────────────────────────────
  const handleEmailStatement = () => {
    if (!user) {
      signIn();
      return;
    }
    const { monthLabel, totalIncome, totalExpenses, netSavings, csvContent } = buildCsvContent();

    const subject = encodeURIComponent(`FinTrack Statement – ${monthLabel}`);
    const body = encodeURIComponent(
      `Hi ${user.name.split(" ")[0]},\n\n` +
      `Here is your FinTrack financial statement for ${monthLabel}.\n\n` +
      `📈 Total Income:   $${totalIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}\n` +
      `📉 Total Expenses: $${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2 })}\n` +
      `💰 Net Savings:    $${netSavings.toLocaleString("en-US", { minimumFractionDigits: 2 })}\n\n` +
      `─────────────────────────────────────\n` +
      `Full transaction list:\n\n` +
      csvContent +
      `\n\n— FinTrack AI`
    );

    window.open(`mailto:${user.email}?subject=${subject}&body=${body}`, "_self");
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} · {getMonthLabel(selectedMonthKey)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Month picker — now drives both the list AND the export */}
          <CursorTooltip content="Select a month to view and export transactions for that month.">
            <Select value={selectedMonthKey} onValueChange={(v) => setSelectedMonthKey(v)}>
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

          {/* Download CSV */}
          <CursorTooltip content="Download the statement for the selected month as a CSV file.">
            <Button variant="outline" onClick={handleDownloadStatement} className="gap-2">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          </CursorTooltip>

          {/* Email Statement */}
          <CursorTooltip content={user ? `Email the ${getMonthLabel(selectedMonthKey)} statement to ${user.email}.` : "Sign in with Google to email statements."}>
            <Button variant="outline" onClick={handleEmailStatement} className="gap-2">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">{user ? "Email" : "Sign in to email"}</span>
            </Button>
          </CursorTooltip>

          {/* Type filter */}
          <CursorTooltip content="Filter the list to show all transactions, only income, or only expenses.">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="income">{viewMode === "splitwise" ? "You are Owed" : "Income"}</SelectItem>
                <SelectItem value="expense">{viewMode === "splitwise" ? "You Owe" : "Expense"}</SelectItem>
              </SelectContent>
            </Select>
          </CursorTooltip>

          {/* Add transaction */}
          {viewMode !== "splitwise" && (
            <CursorTooltip content="Open the form to add a new income or expense transaction.">
              <Button onClick={() => handleOpen()} className="gap-2">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </CursorTooltip>
          )}
        </div>
      </div>

      {/* Transaction list */}
      <div className="space-y-2">
        <AnimatePresence>
          {filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card rounded-xl p-8 text-center text-muted-foreground text-sm"
            >
              No transactions found for {getMonthLabel(selectedMonthKey)}
              {filter !== "all" ? ` (filtered to ${filter})` : ""}.
            </motion.div>
          ) : (
            filtered.map((tx) => (
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
                    {tx.type === "income" ? "+" : "−"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate flex items-center gap-2">
                      {tx.category}
                      {tx.isSplitwise && (
                        <span className="text-[10px] font-bold bg-[#1cc29f]/20 text-[#1cc29f] px-1.5 py-0.5 rounded uppercase tracking-wide">
                          Splitwise
                        </span>
                      )}
                      {tx.isPending && (
                        <span className="text-[10px] font-bold bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          Pending
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{tx.note} · {tx.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex flex-col items-end">
                    <span className={`font-display font-semibold ${tx.type === "income" ? "text-income" : "text-expense"}`}>
                      {tx.type === "income" ? "+" : "−"}
                      {tx.originalCurrency && tx.originalCurrency !== "USD" 
                        ? `${tx.originalCurrency} ${tx.originalAmount?.toLocaleString()}`
                        : `$${tx.amount.toLocaleString()}`
                      }
                    </span>
                    {tx.originalCurrency && tx.originalCurrency !== "USD" && (
                      <span className="text-[10px] text-muted-foreground">≈ ${tx.usdAmount?.toLocaleString()} USD</span>
                    )}
                  </div>
                  
                  {!tx.isSplitwise && (
                    <>
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
                    </>
                  )}
                  {tx.isSplitwise && (
                    <CursorTooltip content="Managed by Splitwise. Edit or delete in the Splitwise app.">
                      <div className="w-[68px]" /> {/* Spacer to align with manual transactions */}
                    </CursorTooltip>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Add / Edit modal */}
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
