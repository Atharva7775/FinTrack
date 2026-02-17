import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Edit2, X } from "lucide-react";
import { useFinanceStore, type Transaction, type Category, incomeCategories, expenseCategories, type TransactionType } from "@/store/financeStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function Transactions() {
  const { transactions, addTransaction, deleteTransaction, updateTransaction } = useFinanceStore();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | TransactionType>("all");
  const [form, setForm] = useState({ type: "expense" as TransactionType, amount: "", category: "" as Category | "", date: "2026-02-17", note: "" });

  const filtered = filter === "all" ? transactions : transactions.filter((t) => t.type === filter);
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

  const categories = form.type === "income" ? incomeCategories : expenseCategories;

  const resetForm = () => setForm({ type: "expense", amount: "", category: "", date: "2026-02-17", note: "" });

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">{transactions.length} total transactions</p>
        </div>
        <div className="flex gap-2">
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
          <Button onClick={() => handleOpen()} className="gap-2">
            <Plus className="h-4 w-4" /> Add
          </Button>
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
                <button onClick={() => handleOpen(tx)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <Edit2 className="h-4 w-4 text-muted-foreground" />
                </button>
                <button onClick={() => deleteTransaction(tx.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </button>
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
            <div>
              <Label>Amount</Label>
              <Input type="number" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>Note</Label>
              <Input placeholder="Optional note..." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <Button onClick={handleSubmit} className="w-full">{editId ? "Save Changes" : "Add Transaction"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
