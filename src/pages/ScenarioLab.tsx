import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
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
} from "lucide-react";
import { useFinanceStore } from "@/store/financeStore";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { buildFinancialSnapshotForAI } from "@/lib/financialSnapshotForAI";
import { chatWithGemini, chatWithOllama, getAiProvider } from "@/lib/aiChatClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CursorTooltip } from "@/components/CursorTooltip";
import {
  fetchChatSessions,
  createChatSession,
  fetchSessionMessages,
  saveMessage,
  deleteChatSession,
  renameChatSession,
  type StoredChatSession,
} from "@/lib/chatSync";

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
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
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

function stripJsonBlocks(text: string): string {
  return text.replace(/\{[\s\S]*\}/g, "").replace(/\n{2,}/g, "\n").trim();
}

export default function ScenarioLab() {
  const { transactions, goals, savingsBalance, viewMode, splitwiseBalances } = useFinanceStore();
  const { user, isLoading: authLoading } = useAuth();

  const [sessions, setSessions] = useState<StoredChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const supabaseConfigured = isSupabaseConfigured();

  const snapshot = buildFinancialSnapshotForAI({ transactions, goals, savingsBalance, viewMode, splitwiseBalances });

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

      // sessionStorage persists across refreshes but is cleared when the tab/browser is closed.
      // Use it to resume the last active session on refresh instead of always starting a new one.
      const savedId = sessionStorage.getItem(SESSION_STORAGE_KEY);
      const resumeSession = stored.find((s) => s.id === savedId);

      if (resumeSession) {
        setActiveSessionId(resumeSession.id);
        if (supabaseConfigured) {
          setLoadingMessages(true);
          const msgs = await fetchSessionMessages(resumeSession.id);
          if (!cancelled) {
            setLoadingMessages(false);
            setMessages(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })));
          }
        }
      } else {
        await startNewSession(user?.name);
      }
    };
    void init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, authLoading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

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
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const priorMessages = messages;
    const historyForModel = priorMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
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
      const provider = getAiProvider();
      let content: string;
      if (provider === "gemini") {
        const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
        if (!geminiKey) {
          setError("Set VITE_GEMINI_API_KEY in your .env file, or use VITE_AI_PROVIDER=ollama.");
          setIsLoading(false);
          return;
        }
        const historyText = priorMessages.length === 0
          ? "No prior conversation."
          : priorMessages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
        content = await chatWithGemini({ snapshot, historyText, latestUserQuestion: trimmed, apiKey: geminiKey });
      } else {
        content = await chatWithOllama({ snapshot, history: historyForModel, latestUserQuestion: trimmed });
      }
      let addedGoals = 0;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed && Array.isArray(parsed.goals)) {
            const currentGoalTitles = new Set(goals.map((g) => g.title));
            parsed.goals.forEach((g: unknown) => {
              const goal = g as Record<string, unknown>;
              if (typeof goal.title === "string" && !currentGoalTitles.has(goal.title)) {
                let recalculatedTarget = 0;
                const expenseSectionRegex = new RegExp(
                  `(?:${goal.title}|trip|goal)[^\n]*:?((?:\n\\* [^\n]+\\$[0-9,.]+)+)`,
                  "i"
                );
                const match = content.match(expenseSectionRegex);
                if (match?.[1]) {
                  const amounts = Array.from(match[1].matchAll(/\$([0-9,.]+)/g)).map(
                    (m) => Number((m as RegExpMatchArray)[1].replace(/,/g, ""))
                  );
                  if (amounts.length > 0) recalculatedTarget = amounts.reduce((a, b) => a + b, 0);
                }
                useFinanceStore.getState().addGoal({
                  title: goal.title,
                  targetAmount: recalculatedTarget > 0 ? recalculatedTarget : Number(goal.targetAmount) || 0,
                  currentAmount: Number(goal.currentAmount) || 0,
                  deadline: typeof goal.deadline === "string" ? goal.deadline : "",
                  monthlyContribution: Number(goal.monthlyContribution) || 0,
                });
                addedGoals++;
              }
            });
          }
        }
      } catch { /* ignore JSON parse errors */ }
      const displayContent = stripJsonBlocks(content);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: addedGoals > 0
          ? displayContent + `\n\n✅ ${addedGoals} new goal${addedGoals > 1 ? "s" : ""} added to your Goals!`
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

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={item}>
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="h-8 w-8 text-primary" />Scenario Lab
        </h1>
        <p className="text-muted-foreground text-sm mt-1 max-w-xl">
          Chat with FinTrack AI about your plans. Ask how trips, investments, or changing goal contributions will impact
          your monthly budget and long-term goals.
        </p>
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
                      className={`max-w-[min(100%,32rem)] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground border border-border/50 rounded-bl-md"
                      }`}
                    >
                      {m.content}
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
              <div className="flex w-full min-w-0 items-stretch rounded-2xl border border-border bg-background overflow-hidden">
                <Button
                  type="submit"
                  disabled={isLoading || !input.trim()}
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
                Uses a compact snapshot of your dashboard data per request. Local Ollama can be slow on CPU — try a
                smaller model (<code className="text-[10px]">ollama pull llama3.2:1b</code>) or{" "}
                <code className="text-[10px]">VITE_AI_PROVIDER=gemini</code>.
              </span>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}
