import { useState } from "react";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, Link2, RefreshCw, Key, ExternalLink } from "lucide-react";
import { CursorTooltip } from "@/components/CursorTooltip";
import { useFinanceStore } from "@/store/financeStore";
import { SEED_TRANSACTIONS } from "@/lib/seedData";
import { fetchSplitwiseUser, fetchAllSplitwiseExpenses, fetchSplitwiseBalances } from "@/lib/splitwise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function SettingsPage() {
  const { 
    splitwiseKey, 
    setSplitwiseKey, 
    splitwiseLastSync, 
    setSplitwiseLastSync,
    transactions,
    addTransaction,
    deleteTransaction,
    viewMode,
    setViewMode,
    setSplitwiseBalances
  } = useFinanceStore();

  const [inputKey, setInputKey] = useState(splitwiseKey || "");
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSaveKey = () => {
    setSplitwiseKey(inputKey.trim() || null);
    toast.success("Splitwise API key saved");
  };

  const handleSync = async () => {
    if (!splitwiseKey) {
      toast.error("Please save your API key first");
      return;
    }
    
    setIsSyncing(true);
    try {
      // 1. Fetch user to get current user ID
      const user = await fetchSplitwiseUser(splitwiseKey);
      
      // 2. Fetch all expenses
      const newTransactions = await fetchAllSplitwiseExpenses(splitwiseKey, user.id);
      
      // 3. Clear existing Splitwise transactions from store to prevent duplicates
      const existingSwTx = transactions.filter(t => t.isSplitwise);
      existingSwTx.forEach(t => deleteTransaction(t.id));
      
      // 4. Add fresh transactions
      newTransactions.forEach(t => addTransaction(t));
      
      // 5. Fetch and store current top-level balances
      const balances = await fetchSplitwiseBalances(splitwiseKey);
      setSplitwiseBalances(balances);

      setSplitwiseLastSync(new Date().toISOString());
      toast.success(`Synced ${newTransactions.length} transactions from Splitwise`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to sync with Splitwise");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestoreDemoData = () => {
    SEED_TRANSACTIONS.forEach(t => {
      // Avoid exact duplicates if they hit it multiple times
      if (!transactions.some(existing => existing.id === t.id)) {
        addTransaction(t);
      }
    });
    toast.success("Demo transactions restored");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl">
      <CursorTooltip content="Manage app settings and integrations like Splitwise.">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your account and integrations</p>
        </div>
      </CursorTooltip>

      <div className="space-y-8">
        {/* Splitwise Integration section */}
        <section className="glass-card rounded-2xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border/50 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#cc29f]/10 flex items-center justify-center">
                <Link2 className="h-5 w-5 text-[#1cc29f]" />
              </div>
              <div>
                <h2 className="font-display font-semibold text-lg">Splitwise Integration</h2>
                <p className="text-sm text-muted-foreground">Automatically import your shared expenses and balances.</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="space-y-3">
              <Label htmlFor="sw-key" className="hidden">Splitwise Personal API Key</Label>
              <div className="flex items-start gap-4">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="sw-key"
                    type="password"
                    placeholder="Enter your Personal API Key"
                    className="pl-9 font-mono"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                  />
                  <a 
                    href="https://secure.splitwise.com/apps" 
                    target="_blank" 
                    rel="noreferrer"
                    className="absolute right-3 top-3 text-[10px] uppercase font-bold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                  >
                    Get Key <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <Button onClick={handleSaveKey} variant={inputKey === splitwiseKey ? "secondary" : "default"}>
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Your key is stored locally in your browser and synced securely to your personal Supabase datastore if connected.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-border/50">
              <div>
                <p className="font-medium text-sm text-foreground">Sync Data</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last synced: {splitwiseLastSync ? new Date(splitwiseLastSync).toLocaleString() : "Never"}
                </p>
              </div>
              <Button 
                onClick={handleSync} 
                disabled={!splitwiseKey || isSyncing}
                variant="outline"
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Now"}
              </Button>
            </div>

            <div className="p-4 rounded-xl bg-muted/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-border/50">
              <div>
                <p className="font-medium text-sm text-foreground">View Splitwise Dashboard</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Toggle the entire application to show only Splitwise data across all pages.
                </p>
              </div>
              <Switch 
                checked={viewMode === "splitwise"} 
                onCheckedChange={(checked) => setViewMode(checked ? "splitwise" : "personal")}
              />
            </div>
          </div>
        </section>

        {/* Restore Demo Data section */}
        <section className="glass-card rounded-2xl border border-border overflow-hidden">
          <div className="p-6">
            <h2 className="font-display font-semibold text-lg">Restore Demo Data</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              If your list is empty, you can restore the initial demo transactions (January and February 2026). 
            </p>
            <Button onClick={handleRestoreDemoData} variant="outline">
              Restore Demo Transactions
            </Button>
          </div>
        </section>

        {/* Placeholder for future settings */}
        <section className="glass-card rounded-2xl p-8 flex flex-col items-center justify-center min-h-[200px] border border-border">
          <div className="p-4 rounded-2xl bg-muted mb-4">
            <SettingsIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold text-foreground text-lg mb-2">More coming soon</h3>
          <p className="text-muted-foreground text-sm text-center max-w-md">
            Notification preferences, themes, and data export will be available in future updates.
          </p>
        </section>

      </div>
    </motion.div>
  );
}
