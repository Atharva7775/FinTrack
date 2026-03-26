import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FlaskConical, MessageSquare, Send, Loader2, History, Sparkles } from "lucide-react";
import { useFinanceStore } from "@/store/financeStore";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { buildFinancialSnapshotForAI } from "@/lib/financialSnapshotForAI";
import { chatWithGemini, chatWithOllama, getAiProvider } from "@/lib/aiChatClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CursorTooltip } from "@/components/CursorTooltip";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: string;
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

const GREETING_DAY_KEY = "fintrack_scenario_lab_greeting_day";

function localCalendarDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeOfDayPhrase(): "Good morning" | "Good afternoon" | "Good evening" {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function buildDailyGreeting(displayName?: string | null): string {
  const phrase = timeOfDayPhrase();
  const name = displayName?.trim().split(/\s+/)[0];
  const hi = name ? `${phrase}, ${name}` : phrase;
  return (
    `${hi}! I'm FinTrack AI — here to help with spending, savings goals, and “what if” questions using your FinTrack data. ` +
    `What would you like to explore today?`
  );
}

export default function ScenarioLab() {
  const {
    transactions,
    goals,
    savingsBalance,
    viewMode,
    splitwiseBalances,
  } = useFinanceStore();
  const { user, isLoading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const supabaseConfigured = isSupabaseConfigured();

  const snapshot = buildFinancialSnapshotForAI({
    transactions,
    goals,
    savingsBalance,
    viewMode,
    splitwiseBalances,
  });

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    const todayKey = localCalendarDayKey();
    const shouldGreetToday = localStorage.getItem(GREETING_DAY_KEY) !== todayKey;

    const loadHistory = async () => {
      const supabase = getSupabase();
      let history: ChatMessage[] = [];

      if (supabase) {
        const { data, error: dbError } = await supabase
          .from("ai_chat_messages")
          .select("id, role, content, created_at")
          .order("created_at", { ascending: true })
          .limit(200);

        if (!dbError && data && !cancelled) {
          history = data.map((row: { id?: string; role: string; content: string; created_at?: string }) => ({
            id: row.id ?? crypto.randomUUID(),
            role: row.role === "assistant" ? "assistant" : "user",
            content: row.content,
            createdAt: row.created_at,
          }));
        }
      }

      if (cancelled) return;

      if (shouldGreetToday) {
        localStorage.setItem(GREETING_DAY_KEY, todayKey);
        const greet: ChatMessage = {
          id: `scenario-daily-greet-${todayKey}`,
          role: "assistant",
          content: buildDailyGreeting(user?.name),
        };
        setMessages([greet, ...history]);
      } else {
        setMessages(history);
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [authLoading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setError(null);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const priorMessages = messages;
    const historyForModel = priorMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const supabase = getSupabase();
    if (supabase) {
      await supabase.from("ai_chat_messages").insert({
        role: "user",
        content: userMessage.content,
      });
    }

    try {
      const provider = getAiProvider();
      let content: string;

      if (provider === "gemini") {
        const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
        if (!geminiKey) {
          setError("Set VITE_GEMINI_API_KEY in your .env file, or use VITE_AI_PROVIDER=ollama with Ollama running.");
          return;
        }
        const historyText =
          priorMessages.length === 0
            ? "No prior conversation."
            : priorMessages
                .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
                .join("\n\n");
        content = await chatWithGemini({
          snapshot,
          historyText,
          latestUserQuestion: trimmed,
          apiKey: geminiKey,
        });
      } else {
        content = await chatWithOllama({
          snapshot,
          history: historyForModel,
          latestUserQuestion: trimmed,
        });
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (supabase) {
        await supabase.from("ai_chat_messages").insert({
          role: "assistant",
          content: assistantMessage.content,
        });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSend();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const exampleQuestions = [
    "Can I plan travel to Australia that will cost me $1000?",
    "If I invest some money in the stock market, how would that affect my monthly target?",
    "If I put $2000 instead of $3000 in my goal contribution, how would that affect my goals?",
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}>
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="h-8 w-8 text-primary" />
          Scenario Lab
        </h1>
        <p className="text-muted-foreground text-sm mt-1 max-w-xl">
          Chat with FinTrack AI about your plans. Ask how trips, investments, or changing goal contributions will impact your monthly
          budget and long‑term goals.
        </p>
      </motion.div>

      <motion.div
        variants={item}
        className="glass-card rounded-2xl p-5 sm:p-6 flex flex-col h-[min(72vh,680px)] min-h-[420px]"
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="font-display font-semibold text-foreground text-sm sm:text-base">FinTrack AI chat</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={supabaseConfigured ? "secondary" : "outline"} className="flex items-center gap-1">
              <History className="h-3 w-3" />
              <span className="text-[11px]">
                {supabaseConfigured ? "History synced" : "History not synced"}
              </span>
            </Badge>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-primary" />
            Try asking:
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
              {messages.length === 0 && !isLoading && (
                <p className="text-center text-xs text-muted-foreground px-3 py-8 max-w-md mx-auto leading-relaxed">
                  Ask a question like “Can I plan travel to Australia that will cost me $1000?” and I’ll break down how it fits into your
                  current spending, savings, and goals.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex w-full ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
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
                  <div className="rounded-2xl rounded-bl-md border border-border/50 bg-muted px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    Thinking…
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
              <CursorTooltip
                asChild
                content="Press Enter to send, Shift+Enter for a new line."
              >
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder='For example: "If I put $2000 instead of $3000 into my goals each month, what changes?"'
                  className="min-w-0 flex-1 w-full rounded-none border-0 shadow-none resize-y min-h-[72px] py-3 text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                  rows={3}
                />
              </CursorTooltip>
            </div>
            <span className="text-[11px] text-muted-foreground leading-snug block">
              Uses a compact snapshot of your dashboard data per request. Local Ollama can be slow on CPU — try a smaller model (
              <code className="text-[10px]">ollama pull llama3.2:1b</code>) or <code className="text-[10px]">VITE_AI_PROVIDER=gemini</code>.
            </span>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
