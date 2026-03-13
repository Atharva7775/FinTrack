import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FlaskConical, MessageSquare, Send, Loader2, History, Sparkles } from "lucide-react";
import { useFinanceStore, type Transaction, type Goal } from "@/store/financeStore";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
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

function buildFinancialContext(params: { transactions: Transaction[]; goals: Goal[]; savingsBalance: number }) {
  const { transactions, goals, savingsBalance } = params;
  const sortedTx = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const recentTransactions = sortedTx.slice(-200);

  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    savingsBalance,
    totalIncome,
    totalExpenses,
    netSavings: totalIncome - totalExpenses,
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      deadline: g.deadline,
      monthlyContribution: g.monthlyContribution,
    })),
    recentTransactions,
  };
}

export default function ScenarioLab() {
  const { transactions, goals, savingsBalance } = useFinanceStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const supabaseConfigured = isSupabaseConfigured();

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data, error: dbError } = await supabase
        .from("ai_chat_messages")
        .select("id, role, content, created_at")
        .order("created_at", { ascending: true })
        .limit(200);

      if (dbError || !data || cancelled) return;

      const history: ChatMessage[] = data.map((row: any) => ({
        id: row.id ?? crypto.randomUUID(),
        role: row.role === "assistant" ? "assistant" : "user",
        content: row.content,
        createdAt: row.created_at,
      }));

      setMessages(history);
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setError(null);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

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
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
      if (!geminiKey) {
        setError("Set VITE_GEMINI_API_KEY in your .env file to enable the AI assistant.");
        return;
      }

      const financialContext = buildFinancialContext({ transactions, goals, savingsBalance });

      const historyText =
        messages.length === 0
          ? "No prior conversation."
          : messages
              .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
              .join("\n\n");

      const prompt = [
        "You are FinTrack AI, a financial planning assistant inside a personal finance app.",
        "Use the provided JSON financial data (transactions, goals, savings balance, totals) to answer questions.",
        "Explain your reasoning in clear steps, reference specific numbers, and always focus on how a decision impacts the user's monthly budget and long-term goals.",
        "If the user asks about changing contributions, travel plans, or investing, quantify the impact on monthly cash flow and goal timelines.",
        "",
        `User's financial data (JSON): ${JSON.stringify(financialContext)}`,
        "",
        "Conversation so far:",
        historyText,
        "",
        `User: ${trimmed}`,
      ].join("\n");

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(
          geminiKey,
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.3,
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error("AI request failed");
      }

      const json = await response.json();
      const contentParts: string[] =
        json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "") ?? [];
      const content: string =
        contentParts.join("").trim() ||
        "I couldn't generate a detailed answer. Please try rephrasing your question.";

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
      setError("Something went wrong while talking to the AI. Please try again in a moment.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSend();
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
        className="glass-card rounded-2xl p-6 flex flex-col h-[calc(100vh-12rem)] max-h-[640px]"
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

        <div className="flex-1 overflow-y-auto pr-1">
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center px-4">
                Ask a question like “Can I plan travel to Australia that will cost me $1000?” and I’ll break down how it fits into your
                current spending, savings, and goals.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="flex">
                <div className="w-full">
                  <div
                    className={`inline-block rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground ml-auto"
                        : "bg-muted text-foreground mr-auto"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <form onSubmit={handleSubmit} className="mt-3 pt-3 border-t border-border">
          <div className="space-y-2">
            <div className="rounded-2xl border border-border bg-background flex items-end overflow-hidden">
              <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="gap-2 rounded-none border-r border-border h-[56px] px-4"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Ask
              </Button>
              <CursorTooltip content="Ask detailed questions about travel, investments, or changing your contributions.">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder='For example: "If I put $2000 instead of $3000 into my goals each month, what changes?"'
                  className="flex-1 border-0 rounded-none shadow-none resize-none text-sm focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[56px]"
                  rows={2}
                />
              </CursorTooltip>
            </div>
            <span className="text-[11px] text-muted-foreground">
              The assistant uses your actual transactions, goals, and savings to answer.
            </span>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
