import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FlaskConical,
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Paperclip,
  FileText,
  X,
  Download,
  Sheet,
} from "lucide-react";
import { useFinanceStore, type Budget } from "@/store/financeStore";
import { useChatStore } from "@/store/chatStore";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { buildFinancialContext, buildSystemPrompt } from "@/lib/aiContextBuilder";
import { chatWithGemini, getAiProvider } from "@/lib/aiChatClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CursorTooltip } from "@/components/CursorTooltip";
import { generateFinancePDF } from "@/lib/pdfGenerator";
import {
  loadKnowledgeBase,
  saveKnowledgeBase,
  createEmptyKnowledgeBase,
  deriveSpendingPersonality,
  mergeKnowledgeBaseUpdate,
  type UserKnowledgeBase,
} from "@/lib/userKnowledgeBase";
import {
  fetchChatSessions,
  createChatSession,
  fetchSessionMessages,
  saveMessage,
  deleteChatSession,
  renameChatSession,
  type StoredChatSession,
} from "@/lib/chatSync";
import { saveBudget, deleteBudgetRow } from "@/lib/supabaseSync";
import { getCurrentMonthKey } from "@/lib/utils";

const SESSION_STORAGE_KEY = "fintrack_active_chat_session_id";

function extractCsvFromMessage(content: string): string | null {
  const match = content.match(/```csv\r?\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

function downloadCsv(csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fintrack-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: string;
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

function timeOfDayPhrase(): "Good morning" | "Good afternoon" | "Good evening" {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 18) return "Good afternoon";
  return "Good evening";
}

const THINKING_PHRASES = [
  "Crunching your numbers…",
  "Analysing your spending patterns…",
  "Checking your goals…",
  "Running the math…",
  "Looking at your budget…",
  "Calculating the best path…",
  "Fetching insights…",
  "Putting the pieces together…",
  "Almost there…",
  "Reviewing your financial data…",
];

function ThinkingMessage() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * THINKING_PHRASES.length));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const cycle = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % THINKING_PHRASES.length);
        setVisible(true);
      }, 300);
    }, 2200);
    return () => clearInterval(cycle);
  }, []);

  return (
    <span
      style={{ transition: "opacity 0.3s", opacity: visible ? 1 : 0 }}
    >
      {THINKING_PHRASES[index]}
    </span>
  );
}



function buildGreeting(displayName?: string | null): string {
  const phrase = timeOfDayPhrase();
  const name = displayName?.trim().split(/\s+/)[0];
  const hi = name ? `${phrase}, ${name}!` : `${phrase}!`;
  return (
    `${hi} 👋 Welcome to FinTrack AI.\n\n` +
    `I’m your personal finance assistant. Here’s what I can do for you:\n` +
    `• 📊 Break down your spending patterns & monthly budget\n` +
    `• 🎯 Track how close you are to hitting your savings goals\n` +
    `• ✨ Make the most of your finances — model trips, investments, and goal changes before you commit\n` +
    `• 💡 Suggest smarter ways to reach your targets faster\n\n` +
    `What would you like to explore today?`
  );
}

function greetingMessage(displayName?: string | null): ChatMessage {
  return { id: `greet-${Date.now()}`, role: "assistant", content: buildGreeting(displayName) };
}

/** Extract every complete, balanced JSON object from a string. */
const KNOWN_ACTION_KEYS = new Set(['goals', 'transactions', 'budgets', 'action', 'kb_update']);

function extractAllJsonObjects(text: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "{") {
      let depth = 0;
      let end = i;
      for (let j = i; j < text.length; j++) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") {
          depth--;
          if (depth === 0) { end = j; break; }
        }
      }
      try {
        const obj = JSON.parse(text.slice(i, end + 1)) as Record<string, unknown>;
        // Only keep objects that contain recognized action keys (ignore JSON in AI prose)
        if (Object.keys(obj).some(k => KNOWN_ACTION_KEYS.has(k))) {
          results.push(obj);
        }
      } catch { /* skip malformed */ }
      i = end + 1;
    } else {
      i++;
    }
  }
  return results;
}

// Merge action objects: concat arrays instead of overwriting (prevents later {} wiping earlier arrays)
function mergeActionObjects(objects: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const obj of objects) {
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v) && Array.isArray(merged[k])) {
        (merged[k] as unknown[]).push(...v);
      } else if (!(k in merged)) {
        merged[k] = v;
      }
      // Scalars: first writer wins; arrays: concat
    }
  }
  return merged;
}

function stripJsonBlocks(text: string): string {
  return text
    .replace(/\{[\s\S]*?"kb_update"[\s\S]*?\}(?:\s*\})?/g, "")
    .replace(/\{[\s\S]*\}/g, "")
    .replace(/```json[\s\S]*```/g, "")
    .replace(/(?:here is the json|the following json|i've added the goal|json block)[^.!?:\n]*[:\n\s]*/gi, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export default function ScenarioLab() {
  const { transactions, goals, savingsBalance, viewMode, splitwiseBalances, budgets: storeBudgets, setBudgets, addGoalContribution, setSavingsBalance, deleteBudget } = useFinanceStore();
  const { user, isLoading: authLoading } = useAuth();

  const [sessions, setSessions] = useState<StoredChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [knowledgeBase, setKnowledgeBase] = useState<UserKnowledgeBase | null>(null);

  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const supabaseConfigured = isSupabaseConfigured();

  const context = buildFinancialContext();
  const systemPromptOverride = buildSystemPrompt(context, knowledgeBase);

  const startNewSession = useCallback(
    async (userName?: string | null): Promise<string> => {
      const greeting = greetingMessage(userName);
      if (supabaseConfigured && user?.email) {
        const id = await createChatSession(user.email, "New Chat");
        if (id) {
          await saveMessage(id, user.email, "assistant", greeting.content);
          const newSession: StoredChatSession = { id, name: "New Chat", createdAt: new Date().toISOString() };
          setSessions((prev) => [newSession, ...prev]);
          setActiveSessionId(id);
          setMessages([greeting]);
          sessionStorage.setItem(SESSION_STORAGE_KEY, id);
          return id;
        }
      }
      // Fallback for no Supabase or session creation failure
      const fallbackId = `local-${Date.now()}`;
      const newSession: StoredChatSession = { id: fallbackId, name: "New Chat", createdAt: new Date().toISOString() };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(fallbackId);
      setMessages([greeting]);
      sessionStorage.setItem(SESSION_STORAGE_KEY, fallbackId);
      return fallbackId;
    },
    [supabaseConfigured, user?.email]
  );

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    const init = async () => {
      let stored: StoredChatSession[] = [];
      if (supabaseConfigured && user?.email) {
        stored = await fetchChatSessions(user.email);
        if (!cancelled) setSessions(stored);
      } else {
        setSessions([]);
      }

      if (cancelled) return;

      // Resume from sessionStorage if available in our list
      const savedId = sessionStorage.getItem(SESSION_STORAGE_KEY);
      let resumeSession = stored.find((s) => s.id === savedId);

      // If no session found in sessionStorage but we have historical ones, pick the latest one
      if (!resumeSession && stored.length > 0) {
        resumeSession = stored[0];
      }

      if (resumeSession) {
        setActiveSessionId(resumeSession.id);
        sessionStorage.setItem(SESSION_STORAGE_KEY, resumeSession.id);
        if (supabaseConfigured) {
          setLoadingMessages(true);
          const msgs = await fetchSessionMessages(resumeSession.id);
          if (!cancelled) {
            setLoadingMessages(false);
            setMessages(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })));
          }
        } else {
          // Local fallback (no Supabase): at least show greeting if we were in a session
          setMessages([greetingMessage(user?.name)]);
        }
      } else {
        // No session to resume and no previous sessions, start a fresh one
        await startNewSession(user?.name);
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [user?.email, authLoading]);


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  // Consume pendingPrompt from chatStore (set by budget alert "Fix it" button)
  useEffect(() => {
    const { pendingPrompt, setPendingPrompt } = useChatStore.getState();
    if (pendingPrompt) {
      setInput(pendingPrompt);
      setPendingPrompt(null);
    }
  }, []);

  // Load (or bootstrap) knowledge base when user is known
  useEffect(() => {
    if (!user?.email || !supabaseConfigured) return;
    let cancelled = false;
    (async () => {
      let kb = await loadKnowledgeBase(user.email);
      if (!kb) {
        // First time: auto-derive personality from existing transactions then save
        const { transactions } = useFinanceStore.getState();
        kb = createEmptyKnowledgeBase();
        kb.spendingPersonality = deriveSpendingPersonality(transactions);
        await saveKnowledgeBase(user.email, kb);
      }
      if (!cancelled) setKnowledgeBase(kb);
    })();
    return () => { cancelled = true; };
  }, [user?.email, supabaseConfigured]);

  const switchSession = async (sessionId: string) => {
    if (sessionId === activeSessionId) return;
    setActiveSessionId(sessionId);
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    setError(null);
    if (supabaseConfigured) {
      setLoadingMessages(true);
      const msgs = await fetchSessionMessages(sessionId);
      setLoadingMessages(false);
      setMessages(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })));
    } else {
      // Local fallback
      setMessages([greetingMessage(user?.name)]);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await deleteChatSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) await startNewSession(user?.name);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || !activeSessionId) return;
    setError(null);
    const userMessage: ChatMessage = { 
      id: crypto.randomUUID(), 
      role: "user", 
      content: attachment ? `${trimmed} (Attached: ${attachment.name})` : trimmed 
    };
    const priorMessages = messages;
    const historyForModel = priorMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    const currentAttachment = attachment;
    setAttachment(null);
    setIsLoading(true);

    if (supabaseConfigured && user?.email) {
      await saveMessage(activeSessionId, user.email, "user", userMessage.content);
    }
    const isFirstUserMessage = priorMessages.filter((m) => m.role === "user").length === 0;
    if (isFirstUserMessage) {
      const sessionName = trimmed.length > 40 ? trimmed.slice(0, 40) + "…" : trimmed;
      setSessions((prev) => prev.map((s) => (s.id === activeSessionId ? { ...s, name: sessionName } : s)));
      if (supabaseConfigured) void renameChatSession(activeSessionId, sessionName);
    }
    try {
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
      if (!geminiKey) {
        setError("Set VITE_GEMINI_API_KEY in your .env file to enable FinTrack AI.");
        setIsLoading(false);
        return;
      }
      const historyText = priorMessages.length === 0
        ? "No prior conversation."
        : priorMessages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
      
      const content = await chatWithGemini({ 
        snapshot: context, 
        historyText, 
        latestUserQuestion: trimmed, 
        apiKey: geminiKey,
        attachment: currentAttachment || undefined,
        systemPromptOverride
      });

      let addedGoals = 0;
      let updatedGoals = 0;
      let deletedGoals = 0;
      let addedTx = 0;
      let deletedTx = 0;
      let addedBudgets = 0;
      let deletedBudgets = 0;
      try {
        // Extract every balanced JSON object from the AI response.
        // Before this fix, a greedy regex merged all blocks into one invalid string,
        // causing JSON.parse to throw whenever kb_update was also emitted.
        const allObjects = extractAllJsonObjects(content);

        // Merge all non-kb_update objects — arrays are concatenated, not overwritten
        const parsed: Record<string, unknown> = mergeActionObjects(
          allObjects.filter((o) => !o.kb_update)
        );

        // kb_update is handled separately below
        const kbUpdateObj = allObjects.find((o) => o.kb_update);

          // Handle Goals
          if (parsed && Array.isArray(parsed.goals)) {
            for (const g of parsed.goals) {
              if (typeof g.title !== "string") continue;

              const existingGoal = goals.find((eg) => eg.title.toLowerCase() === g.title.toLowerCase());

              if (existingGoal) {
                // Only update fields the AI explicitly provided — never reset existing values to 0
                const updates: Partial<typeof existingGoal> = {};
                if (g.monthlyContribution !== undefined) updates.monthlyContribution = Number(g.monthlyContribution) || 0;
                if (g.targetAmount !== undefined) {
                  let recalculatedTarget = 0;
                  const expenseSectionRegex = new RegExp(
                    `(?:${g.title}|trip|goal)[^\\n]*:?((?:\\n\\* [^\\n]+\\$[0-9,.]+)+)`,
                    "i"
                  );
                  const match = content.match(expenseSectionRegex);
                  if (match?.[1]) {
                    const amounts = Array.from(match[1].matchAll(/\$([0-9,.]+)/g)).map(
                      (m) => Number(m[1].replace(/,/g, ""))
                    );
                    if (amounts.length > 0) recalculatedTarget = amounts.reduce((a, b) => a + b, 0);
                  }
                  updates.targetAmount = recalculatedTarget > 0 ? recalculatedTarget : Number(g.targetAmount) || 0;
                }
                if (g.currentAmount !== undefined) updates.currentAmount = Number(g.currentAmount) || 0;
                if (typeof g.deadline === "string" && g.deadline) updates.deadline = g.deadline;
                useFinanceStore.getState().updateGoal(existingGoal.id, updates);
                updatedGoals++;
              } else {
                useFinanceStore.getState().addGoal({
                  title: g.title,
                  targetAmount: Number(g.targetAmount) || 0,
                  currentAmount: Number(g.currentAmount) || 0,
                  deadline: typeof g.deadline === "string" ? g.deadline : "",
                  monthlyContribution: Number(g.monthlyContribution) || 0,
                  type: g.type || 'savings',
                  isShared: false,
                  members: [],
                });
                addedGoals++;
              }
            }
          }

          // Handle Transactions
          if (parsed && Array.isArray(parsed.transactions)) {
            parsed.transactions.forEach((tx: any) => {
              if (tx.action === "add" && tx.amount && tx.type && tx.category) {
                useFinanceStore.getState().addTransaction({
                  type: tx.type,
                  amount: Number(tx.amount),
                  category: tx.category,
                  date: typeof tx.date === "string" ? tx.date : new Date().toISOString().split("T")[0],
                  note: tx.note || "Added via FinTrack AI",
                });
                addedTx++;
              } else if (tx.action === "delete" && tx.id) {
                useFinanceStore.getState().deleteTransaction(String(tx.id));
                deletedTx++;
              }
            });
          }

          // Handle Custom Actions (Cut Plan & Shared Goals)
          if (parsed && parsed.action === "updateGoalContribution" && parsed.newMonthlyAmount) {
            // Match by title if provided (AI doesn't know real UUIDs), fall back to goalId
            const matchedGoal = parsed.goalTitle
              ? goals.find((g) => g.title.toLowerCase() === String(parsed.goalTitle).toLowerCase())
              : goals.find((g) => g.id === parsed.goalId);
            if (matchedGoal) {
              useFinanceStore.getState().updateGoal(matchedGoal.id, {
                monthlyContribution: Number(parsed.newMonthlyAmount)
              });
              updatedGoals++;
            }
          }

          if (parsed && parsed.action === "createGoal" && parsed.goal) {
            const g = parsed.goal;
            useFinanceStore.getState().addGoal({
              title: g.title,
              targetAmount: Number(g.targetAmount) || 0,
              currentAmount: Number(g.currentAmount) || 0,
              deadline: g.deadline || "",
              monthlyContribution: Number(g.monthlyContribution) || 0,
              type: g.type || 'savings',
              isShared: !!g.isShared,
              members: g.members || []
            });
            addedGoals++;
          }

          // Delete a goal by title (safe top-level action — avoids accidental fires from goals array)
          if (parsed && parsed.action === "deleteGoal" && typeof parsed.goalTitle === "string") {
            const toDelete = goals.find((g) => g.title.toLowerCase() === parsed.goalTitle!.toString().toLowerCase());
            if (toDelete) {
              await useFinanceStore.getState().deleteGoal(toDelete.id);
              deletedGoals++;
            }
          }

          // Log goal contribution (user puts money into a goal)
          if (parsed && parsed.action === "logGoalContribution" && parsed.goalTitle && parsed.amount) {
            const today = new Date().toISOString().split("T")[0];
            const matchedGoal = goals.find((g) => g.title.toLowerCase() === String(parsed.goalTitle).toLowerCase());
            if (matchedGoal) {
              addGoalContribution(
                matchedGoal.id,
                Number(parsed.amount),
                typeof parsed.date === "string" && parsed.date ? parsed.date : today
              );
              updatedGoals++;
            }
          }

          // Update savings balance
          if (parsed && parsed.action === "updateSavingsBalance" && parsed.amount !== undefined) {
            setSavingsBalance(Number(parsed.amount));
            updatedGoals++; // counted as a data update
          }

          // Handle Budgets
          if (parsed && Array.isArray(parsed.budgets) && parsed.budgets.length > 0) {
            // Handle budget deletions first
            const budgetsToDelete = parsed.budgets.filter((b: any) => b.action === "delete" && typeof b.category === "string");
            for (const bd of budgetsToDelete) {
              const existing = storeBudgets.find((b) => b.category === bd.category);
              if (existing) {
                deleteBudget(existing.id);
                if (user?.email && isSupabaseConfigured()) {
                  await deleteBudgetRow(existing.id);
                }
                deletedBudgets++;
              }
            }

            const incomingMonth = getCurrentMonthKey();
            const incoming: Budget[] = parsed.budgets
              .filter((b: any) => b.action !== "delete" && typeof b.category === "string")
              .map((b: any) => ({
                id: crypto.randomUUID(),
                category: b.category as Budget["category"],
                month: incomingMonth,
                type: (b.type === "percentage" ? "percentage" : "fixed") as Budget["type"],
                percentage: b.type === "percentage" ? (Number(b.percentage) || 0) : undefined,
                fixedAmount: b.type !== "percentage" ? (Number(b.fixedAmount) || 0) : undefined,
                rolloverBalance: 0,
                alertThreshold: Number(b.alertThreshold) || 80,
              }));

            // Merge with existing budgets — AI budgets for current month override by category
            const otherMonths = storeBudgets.filter(b => b.month !== incomingMonth);
            const currentMonthExisting = storeBudgets.filter(b => b.month === incomingMonth);
            const byCategory = new Map(currentMonthExisting.map(b => [b.category, b]));
            for (const nb of incoming) byCategory.set(nb.category, nb);
            const merged = [...otherMonths, ...Array.from(byCategory.values())];
            setBudgets(merged);

            // Persist to Supabase if configured
            if (user?.email && isSupabaseConfigured()) {
              for (const b of incoming) {
                await saveBudget(user.email, b);
              }
            }
            addedBudgets = incoming.length;
          }

          // Handle Knowledge Base updates
          if (kbUpdateObj && user?.email) {
            const existingKb = knowledgeBase || createEmptyKnowledgeBase();
            const updatedKb = mergeKnowledgeBaseUpdate(existingKb, kbUpdateObj.kb_update as Record<string, unknown>);
            setKnowledgeBase(updatedKb);
            if (supabaseConfigured) {
              saveKnowledgeBase(user.email, updatedKb);
            }
          }
      } catch (err) {
        console.warn("FinTrack: parsing data from AI block failed", err);
      }
      const displayContent = stripJsonBlocks(content);
      const totalChanges = addedGoals + updatedGoals + deletedGoals + addedTx + deletedTx + addedBudgets + deletedBudgets;
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: totalChanges > 0
          ? displayContent + `\n\n✅ Automatically updated your data (${totalChanges} change${totalChanges > 1 ? "s" : ""}).`
          : displayContent,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      if (supabaseConfigured && user?.email) {
        await saveMessage(activeSessionId, user.email, "assistant", assistantMessage.content);
      }
    } catch (e) {
      console.error("FinTrack: AI chat failed", e);
      setError(
        e instanceof Error ? e.message : "Something went wrong while talking to the AI. Please try again in a moment."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); void handleSend(); };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  };

  const exampleQuestions = [
    "Can I plan travel to Australia that will cost me $1000?",
    "If I invest some money in the stock market, how would that affect my monthly target?",
    "If I put $2000 instead of $3000 in my goal contribution, how would that affect my goals?",
  ];

  if (!authLoading && !user) {
    return (
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
        <motion.div variants={item}>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground flex items-center gap-2">
            <FlaskConical className="h-8 w-8 text-primary" />Scenario Lab
          </h1>
        </motion.div>
        <motion.div variants={item} className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <LogIn className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-display font-semibold text-foreground">Sign in to use FinTrack AI</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Your chat history is private and tied to your account. Sign in to start chatting with FinTrack AI.
          </p>
        </motion.div>
      </motion.div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result as string;
      setAttachment({ name: file.name, type: file.type, data });
    };
    if (file.type.startsWith("text/")) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={item}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground flex items-center gap-2">
              <FlaskConical className="h-8 w-8 text-primary" />Scenario Lab
            </h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-xl">
              Chat with FinTrack AI about your plans, upload reports (PDF/Image), or generate financial summaries.
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={item}
        className="flex gap-0 rounded-2xl border border-border overflow-hidden bg-card"
        style={{ height: "min(76vh, 700px)", minHeight: 460 }}
      >
        {/* Left sidebar */}
        <div
          className={`flex flex-col border-r border-border bg-muted/40 transition-all duration-200 shrink-0 ${
            sidebarOpen ? "w-[220px] sm:w-[250px]" : "w-0 overflow-hidden"
          }`}
        >
          <div className="p-3 border-b border-border">
            <Button
              variant="default"
              size="sm"
              className="w-full gap-2 rounded-xl text-xs h-9"
              onClick={() => startNewSession(user?.name)}
            >
              <Plus className="h-3.5 w-3.5" />New Chat
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
            {sessions.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-4 px-2">
                No chats yet. Start a new one above.
              </p>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => switchSession(s.id)}
                className={`group flex items-center justify-between gap-1 rounded-lg px-3 py-2 cursor-pointer transition-colors text-xs ${
                  s.id === activeSessionId
                    ? "bg-primary/10 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="h-3 w-3 shrink-0" />
                  <span className="truncate">{s.name}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDeleteSession(e, s.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-destructive"
                  aria-label="Delete chat"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar toggle */}
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="shrink-0 flex items-center justify-center w-5 border-r border-border bg-muted/20 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>

        {/* Chat pane */}
        <div className="flex-1 min-w-0 flex flex-col p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="font-display font-semibold text-foreground text-sm">
                {sessions.find((s) => s.id === activeSessionId)?.name ?? "New Chat"}
              </span>
            </div>
            {supabaseConfigured && (
              <span className="text-[11px] text-muted-foreground border border-border rounded-full px-2 py-0.5">
                History synced
              </span>
            )}
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" /> Try:
            </span>
            {exampleQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setInput(q)}
                className="rounded-full border border-border px-2 py-0.5 hover:bg-muted transition text-[11px]"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border/60 bg-background/40">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <div className="flex min-h-full flex-col justify-end gap-3 px-2 py-3 sm:px-3">
                {loadingMessages && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!loadingMessages && messages.length === 0 && !isLoading && (
                  <p className="text-center text-xs text-muted-foreground px-3 py-8 max-w-md mx-auto leading-relaxed">
                    Ask a question like "Can I plan travel to Australia that will cost me $1000?" and I'll break down
                    how it fits into your current spending, savings, and goals.
                  </p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={`flex w-full ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`group relative max-w-[min(100%,38rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md whitespace-pre-wrap"
                          : "bg-muted text-foreground border border-border/50 rounded-bl-md"
                      }`}
                    >
                      {m.role === "user" ? (
                        m.content
                      ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-2">
                                <table className="w-full border-collapse text-xs">{children}</table>
                              </div>
                            ),
                            thead: ({ children }) => <thead className="bg-border/30">{children}</thead>,
                            th: ({ children }) => (
                              <th className="border border-border px-2 py-1 text-left font-semibold">{children}</th>
                            ),
                            td: ({ children }) => (
                              <td className="border border-border px-2 py-1">{children}</td>
                            ),
                            code: ({ className, children }) => {
                              const isBlock = className !== undefined || String(children).includes('\n');
                              return isBlock ? (
                                <pre className="bg-background/60 border border-border rounded-lg px-3 py-2 my-2 overflow-x-auto text-xs font-mono whitespace-pre">
                                  <code>{children}</code>
                                </pre>
                              ) : (
                                <code className="bg-background/60 px-1 rounded text-xs font-mono">{children}</code>
                              );
                            },
                            p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-4 mb-1 space-y-0.5">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-4 mb-1 space-y-0.5">{children}</ol>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-sm font-semibold mt-1 mb-0.5">{children}</h3>,
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      )}
                      {m.role === "assistant" && m.content.length > 50 && (
                        <div className="absolute -right-10 top-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => generateFinancePDF("Scenario Lab Report", m.content)}
                            className="p-1.5 rounded-lg bg-card border border-border hover:text-primary shadow-sm"
                            title="Download as PDF"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          {extractCsvFromMessage(m.content) && (
                            <button
                              type="button"
                              onClick={() => {
                                const csv = extractCsvFromMessage(m.content);
                                if (csv) downloadCsv(csv);
                              }}
                              className="p-1.5 rounded-lg bg-card border border-border hover:text-emerald-500 shadow-sm"
                              title="Export to Excel / CSV"
                            >
                              <Sheet className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex w-full justify-start">
                    <div className="rounded-2xl rounded-bl-md border border-border/50 bg-muted px-4 py-3 text-sm text-muted-foreground flex items-center gap-2 min-w-[180px]">
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      <ThinkingMessage />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
              </div>
            </div>
          </div>

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

          <form onSubmit={handleSubmit} className="mt-3 pt-3 border-t border-border">
            <div className="space-y-2">
              {attachment && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg w-fit border border-primary/20 animate-in fade-in slide-in-from-bottom-2">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[11px] font-medium text-primary truncate max-w-[150px]">
                    {attachment.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="hover:text-destructive p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="flex w-full min-w-0 items-stretch rounded-2xl border border-border bg-background overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".txt,.pdf,.png,.jpg,.jpeg"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 rounded-none border-r border-border h-auto min-h-[56px] px-3.5 hover:bg-muted"
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || (!input.trim() && !attachment)}
                  className="gap-2 shrink-0 rounded-none border-r border-border h-auto min-h-[56px] px-4 self-stretch"
                >
                  <Send className="h-4 w-4" />
                  Ask
                </Button>
                <CursorTooltip asChild content="Press Enter to send, Shift+Enter for a new line.">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder='e.g. "If I put $2000 instead of $3000 into my goals each month, what changes?"'
                    className="min-w-0 flex-1 w-full rounded-none border-0 shadow-none resize-y min-h-[56px] py-3 text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                    rows={2}
                  />
                </CursorTooltip>
              </div>
              <span className="text-[11px] text-muted-foreground leading-snug block">
                Uses a compact snapshot of your dashboard data per request. 
                Powered by Google Gemini 1.5 Flash.
              </span>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}
