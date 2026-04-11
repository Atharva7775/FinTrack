import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, Link2, RefreshCw, Key, ExternalLink, Brain, Trash2, RotateCcw, ChevronDown, ChevronUp, MessageCircle, CheckCircle2, Unlink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { CursorTooltip } from "@/components/CursorTooltip";
import { useFinanceStore } from "@/store/financeStore";
import { SEED_TRANSACTIONS } from "@/lib/seedData";
import { fetchSplitwiseUser, fetchAllSplitwiseExpenses, fetchSplitwiseBalances } from "@/lib/splitwise";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase";
import {
  loadKnowledgeBase,
  saveKnowledgeBase,
  createEmptyKnowledgeBase,
  deriveSpendingPersonality,
  type UserKnowledgeBase,
  type KBNote,
} from "@/lib/userKnowledgeBase";

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

  const { user } = useAuth();
  const supabaseConfigured = isSupabaseConfigured();

  const [inputKey, setInputKey] = useState(splitwiseKey || "");
  const [isSyncing, setIsSyncing] = useState(false);

  // ─── Telegram state ────────────────────────────────────────────────────────
  const [telegramStatus, setTelegramStatus] = useState<'idle' | 'pending' | 'linked'>('idle');
  const [telegramToken, setTelegramToken] = useState<string | null>(null);
  const telegramPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "FinTrack_AI_Bot";

  // Check on mount if this user already has a Telegram link
  useEffect(() => {
    if (!user?.email || !supabaseConfigured) return;
    const supabase = getSupabase();
    if (!supabase) return;
    supabase
      .from("app_settings")
      .select("key")
      .like("key", "telegram_user_%")
      .eq("user_email", user.email)
      .limit(1)
      .then(({ data }) => {
        if ((data ?? []).length > 0) setTelegramStatus("linked");
      });
  }, [user?.email, supabaseConfigured]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (telegramPollRef.current) clearInterval(telegramPollRef.current);
    };
  }, []);

  const handleGenerateTelegramLink = async () => {
    if (!user?.email) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const token = crypto.randomUUID();
    const key = `pending_telegram_link_${token}`;
    await supabase.from("app_settings").upsert(
      { key, user_email: user.email, value: user.email, updated_at: new Date().toISOString() },
      { onConflict: "key,user_email" }
    );
    setTelegramToken(token);
    setTelegramStatus("pending");

    // Clear any previous poll
    if (telegramPollRef.current) clearInterval(telegramPollRef.current);

    // Poll every 2.5 seconds — if the pending key disappears, bot consumed it = linked
    telegramPollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key")
        .eq("key", key)
        .eq("user_email", user.email)
        .maybeSingle();

      if (!data) {
        clearInterval(telegramPollRef.current!);
        telegramPollRef.current = null;
        setTelegramStatus("linked");
        setTelegramToken(null);
        toast.success("Telegram linked successfully! 🎉");
      }
    }, 2500);
  };

  const handleUnlinkTelegram = async () => {
    if (!user?.email) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = await supabase
      .from("app_settings")
      .select("key")
      .like("key", "telegram_user_%")
      .eq("user_email", user.email);
    for (const row of data ?? []) {
      await supabase.from("app_settings").delete().eq("key", row.key).eq("user_email", user.email);
    }
    if (telegramPollRef.current) { clearInterval(telegramPollRef.current); telegramPollRef.current = null; }
    setTelegramStatus("idle");
    setTelegramToken(null);
    toast.success("Telegram unlinked");
  };

  // ─── AI Memory state ───────────────────────────────────────────────────────
  const [kb, setKb] = useState<UserKnowledgeBase | null>(null);
  const [kbLoading, setKbLoading] = useState(false);
  const [showAdvice, setShowAdvice] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!user?.email || !supabaseConfigured) return;
    setKbLoading(true);
    loadKnowledgeBase(user.email).then(loaded => {
      setKb(loaded || createEmptyKnowledgeBase());
      setKbLoading(false);
    });
  }, [user?.email, supabaseConfigured]);

  const handleDeleteNote = async (idx: number) => {
    if (!kb || !user?.email) return;
    const updated = { ...kb, aiNotes: kb.aiNotes.filter((_, i) => i !== idx), lastUpdated: new Date().toISOString() };
    setKb(updated);
    await saveKnowledgeBase(user.email, updated);
    toast.success("Note removed from AI memory");
  };

  const handleClearMemory = async () => {
    if (!user?.email) return;
    const { transactions: txs } = useFinanceStore.getState();
    const fresh = createEmptyKnowledgeBase();
    fresh.spendingPersonality = deriveSpendingPersonality(txs);
    await saveKnowledgeBase(user.email, fresh);
    setKb(fresh);
    setConfirmClear(false);
    toast.success("AI memory cleared");
  };

  const handleRederivePersonality = async () => {
    if (!kb || !user?.email) return;
    const { transactions: txs } = useFinanceStore.getState();
    const updated = { ...kb, spendingPersonality: deriveSpendingPersonality(txs), lastUpdated: new Date().toISOString() };
    setKb(updated);
    await saveKnowledgeBase(user.email, updated);
    toast.success("Spending personality re-derived from your transaction history");
  };

  const statusColor = (status: string) => {
    if (status === 'created')   return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20';
    if (status === 'dismissed') return 'bg-muted text-muted-foreground border-border';
    return 'bg-amber-500/15 text-amber-600 border-amber-500/20';
  };

  const noteColor = (cat: KBNote['category']) => {
    if (cat === 'fact')       return 'bg-blue-500/10 text-blue-600';
    if (cat === 'preference') return 'bg-purple-500/10 text-purple-600';
    if (cat === 'concern')    return 'bg-red-500/10 text-red-600';
    return 'bg-emerald-500/10 text-emerald-600';
  };

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

        {/* Telegram Integration section */}
        <section className="glass-card rounded-2xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border/50 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-sky-500" />
              </div>
              <div>
                <h2 className="font-display font-semibold text-lg">Telegram Bot</h2>
                <p className="text-sm text-muted-foreground">
                  Chat with FinTrack AI on Telegram — add transactions, check goals, and get advice.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {!supabaseConfigured && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Connect Supabase to enable Telegram integration.
              </p>
            )}

            {supabaseConfigured && telegramStatus === "linked" && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="font-medium text-sm text-foreground">Telegram Connected</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Your Telegram account is linked. Message{" "}
                      <a
                        href={`https://t.me/${BOT_USERNAME}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-500 hover:underline font-medium"
                      >
                        @{BOT_USERNAME}
                      </a>{" "}
                      to chat.
                    </p>
                  </div>
                </div>
                <Button onClick={handleUnlinkTelegram} variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive shrink-0">
                  <Unlink className="h-3.5 w-3.5" />
                  Unlink
                </Button>
              </div>
            )}

            {supabaseConfigured && telegramStatus === "idle" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Scan the QR code with Telegram to link your account. The bot will have access to
                  the same AI and financial context as the web app.
                </p>
                <Button onClick={handleGenerateTelegramLink} className="gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Generate Link QR Code
                </Button>
              </div>
            )}

            {supabaseConfigured && telegramStatus === "pending" && telegramToken && (
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="p-3 bg-white rounded-xl border border-border shrink-0">
                  <QRCodeSVG
                    value={`https://t.me/${BOT_USERNAME}?start=${telegramToken}`}
                    size={160}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div className="space-y-3">
                  <p className="font-medium text-sm text-foreground">Scan with Telegram to link your account</p>
                  <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                    <li>Open Telegram on your phone</li>
                    <li>Tap the QR scanner (⋮ → Scan QR)</li>
                    <li>Point your camera at the code</li>
                    <li>The bot will confirm and link automatically</li>
                  </ol>
                  <p className="text-xs text-muted-foreground">
                    Or open directly:{" "}
                    <a
                      href={`https://t.me/${BOT_USERNAME}?start=${telegramToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-500 hover:underline"
                    >
                      t.me/{BOT_USERNAME}
                    </a>
                  </p>
                  <div className="flex items-center gap-2 text-xs text-amber-600">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Waiting for scan… (expires in 10 min)
                  </div>
                  <Button
                    onClick={() => { setTelegramStatus("idle"); setTelegramToken(null); if (telegramPollRef.current) { clearInterval(telegramPollRef.current); telegramPollRef.current = null; } }}
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* AI Memory section */}
        <section className="glass-card rounded-2xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border/50 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-lg">AI Memory</h2>
                  <p className="text-sm text-muted-foreground">What FinTrack AI knows about you — learned from your conversations.</p>
                </div>
              </div>
              {supabaseConfigured && kb && (
                <div className="flex items-center gap-2">
                  <Button onClick={handleRederivePersonality} variant="outline" size="sm" className="gap-2">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Re-derive
                  </Button>
                  {!confirmClear ? (
                    <Button onClick={() => setConfirmClear(true)} variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Are you sure?</span>
                      <Button onClick={handleClearMemory} variant="destructive" size="sm">Yes, clear</Button>
                      <Button onClick={() => setConfirmClear(false)} variant="outline" size="sm">Cancel</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {!supabaseConfigured && (
              <p className="text-sm text-muted-foreground text-center py-4">Connect Supabase to enable AI Memory persistence.</p>
            )}
            {supabaseConfigured && kbLoading && (
              <p className="text-sm text-muted-foreground text-center py-4">Loading AI memory…</p>
            )}
            {supabaseConfigured && !kbLoading && kb && (
              <>
                {/* Personal Facts */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">Personal Facts</h3>
                  {Object.keys(kb.personalFacts).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nothing learned yet. Tell the AI about yourself — your city, age, employment, risk tolerance.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(kb.personalFacts).map(([key, val]) => (
                        <span key={key} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border text-xs">
                          <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                          <span className="font-medium">{String(val)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Spending Personality */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">Spending Personality</h3>
                  <div className="space-y-3">
                    {kb.spendingPersonality.labels.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {kb.spendingPersonality.labels.map(label => (
                          <span key={label} className="px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-medium">{label}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No personality labels derived yet.</p>
                    )}
                    {kb.spendingPersonality.averageMonthlyExpenses > 0 && (
                      <div className="grid grid-cols-3 gap-3 mt-2">
                        <div className="p-3 rounded-xl bg-muted/50 text-center">
                          <p className="text-xs text-muted-foreground">Avg Income</p>
                          <p className="text-sm font-semibold">${kb.spendingPersonality.averageMonthlyIncome.toLocaleString()}/mo</p>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/50 text-center">
                          <p className="text-xs text-muted-foreground">Avg Expenses</p>
                          <p className="text-sm font-semibold">${kb.spendingPersonality.averageMonthlyExpenses.toLocaleString()}/mo</p>
                        </div>
                        <div className="p-3 rounded-xl bg-muted/50 text-center">
                          <p className="text-xs text-muted-foreground">Savings Pattern</p>
                          <p className="text-sm font-semibold capitalize">{kb.spendingPersonality.savingsConsistency}</p>
                        </div>
                      </div>
                    )}
                    {kb.spendingPersonality.topCategories.length > 0 && (
                      <p className="text-xs text-muted-foreground">Top categories: {kb.spendingPersonality.topCategories.join(', ')}</p>
                    )}
                  </div>
                </div>

                {/* Preferences */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">AI Preferences</h3>
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full bg-muted border border-border text-xs">
                      Response style: <span className="font-medium capitalize">{kb.preferences.responseStyle}</span>
                    </span>
                    <span className="px-3 py-1 rounded-full bg-muted border border-border text-xs">
                      Focus area: <span className="font-medium capitalize">{kb.preferences.focusArea}</span>
                    </span>
                  </div>
                </div>

                {/* Stated Goals */}
                {kb.statedGoals.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">Goals Mentioned in Chat</h3>
                    <div className="space-y-2">
                      {kb.statedGoals.map((g, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
                          <span className="text-sm">{g.description}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor(g.status)}`}>
                            {g.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Notes */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">AI Notes <span className="text-xs font-normal text-muted-foreground">({kb.aiNotes.length}/20)</span></h3>
                  {kb.aiNotes.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No notes yet. The AI records insights as you chat.</p>
                  ) : (
                    <div className="space-y-2">
                      {[...kb.aiNotes].reverse().map((n, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border/50 group">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 mt-0.5 ${noteColor(n.category)}`}>
                            {n.category}
                          </span>
                          <span className="text-sm flex-1">{n.note}</span>
                          <button
                            onClick={() => handleDeleteNote(kb.aiNotes.length - 1 - i)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:text-destructive shrink-0"
                            title="Delete note"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Advice History */}
                {kb.adviceHistory.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowAdvice(v => !v)}
                      className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2"
                    >
                      Advice History <span className="text-xs font-normal text-muted-foreground">({kb.adviceHistory.length})</span>
                      {showAdvice ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {showAdvice && (
                      <div className="space-y-2">
                        {[...kb.adviceHistory].reverse().map((a, i) => (
                          <div key={i} className="p-3 rounded-xl bg-muted/40 border border-border/50">
                            <p className="text-xs text-muted-foreground mb-1">{new Date(a.date).toLocaleDateString()}</p>
                            <p className="text-sm">{a.advice}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Last updated: {kb.lastUpdated ? new Date(kb.lastUpdated).toLocaleString() : 'never'}
                </p>
              </>
            )}
          </div>
        </section>

        {/* More coming soon placeholder */}
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
