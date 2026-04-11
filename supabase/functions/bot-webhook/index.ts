// FinTrack Telegram Bot — Supabase Edge Function
// Handles incoming Telegram webhook updates, queries user financial data,
// calls Gemini AI with the same system prompt as the web app, parses
// action blocks (add_transaction, create_goal), persists them to Supabase,
// saves the chat exchange to ai_chat_messages, and replies to the user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  from: { id: number; first_name: string; username?: string };
  chat: { id: number };
  text?: string;
  date: number;
}

interface TgSendPayload {
  chat_id: number;
  text: string;
  parse_mode?: string;
  reply_markup?: object;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// ─── Supabase client (service role — can bypass RLS) ─────────────────────────

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────

async function sendMessage(payload: TgSendPayload): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function sendTyping(chatId: number): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

// ─── User mapping: Telegram chat_id → user_email ─────────────────────────────

async function getUserEmail(telegramChatId: number): Promise<string | null> {
  const supabase = getServiceClient();
  const key = `telegram_user_${telegramChatId}`;
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (!data?.value) return null;
  return String(data.value);
}

// ─── Financial context builder (mirrors aiContextBuilder.ts logic) ────────────

async function buildFinancialSnapshot(userEmail: string) {
  const supabase = getServiceClient();

  const [txRes, goalsRes, contribRes, settingsRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, type, amount, category, date, note, usd_amount")
      .eq("user_email", userEmail)
      .order("date", { ascending: false }),
    supabase
      .from("goals")
      .select("id, title, target_amount, current_amount, deadline, monthly_contribution")
      .eq("user_email", userEmail),
    supabase
      .from("goal_contributions")
      .select("goal_id, amount, date"),
    supabase
      .from("app_settings")
      .select("key, value")
      .eq("user_email", userEmail)
      .eq("key", "savings_balance")
      .maybeSingle(),
  ]);

  const transactions: Array<{
    id: string; type: string; amount: number; category: string;
    date: string; note: string; usdAmount?: number;
  }> = (txRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    type: String(r.type),
    amount: Number(r.amount),
    category: String(r.category),
    date: String(r.date),
    note: String(r.note ?? ""),
    usdAmount: r.usd_amount != null ? Number(r.usd_amount) : undefined,
  }));

  const goals: Array<{
    id: string; title: string; targetAmount: number; currentAmount: number;
    deadline: string; monthlyContribution: number;
  }> = (goalsRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    title: String(r.title),
    targetAmount: Number(r.target_amount),
    currentAmount: Number(r.current_amount),
    deadline: String(r.deadline),
    monthlyContribution: Number(r.monthly_contribution),
  }));

  const savingsBalance = settingsRes.data?.value != null ? Number(settingsRes.data.value) : 0;

  // Determine current month from most recent transaction data
  const allMonths = Array.from(new Set(transactions.map((t) => t.date.slice(0, 7)))).sort().reverse();
  const currentMonth = allMonths[0] ?? new Date().toISOString().slice(0, 7);

  const income = transactions
    .filter((t) => t.type === "income" && t.date.startsWith(currentMonth))
    .reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);

  const expenses = transactions.filter((t) => t.type === "expense" && t.date.startsWith(currentMonth));
  const totalExpenses = expenses.reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);

  // Category breakdown
  const categoryMap: Record<string, number> = {};
  expenses.forEach((t) => {
    categoryMap[t.category] = (categoryMap[t.category] ?? 0) + (t.usdAmount ?? t.amount);
  });
  const categories = Object.entries(categoryMap)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, amt]) => `  ${cat.padEnd(16)} $${amt.toLocaleString()}`);

  const goalLines = goals.map((g) => {
    const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
    return `  "${g.title}" — $${g.currentAmount}/$${g.targetAmount} (${pct}%), needs $${g.monthlyContribution}/mo, deadline ${g.deadline}`;
  });

  return {
    currentMonth,
    income,
    totalExpenses,
    netSavings: income - totalExpenses,
    savingsRate: income > 0 ? Math.round(((income - totalExpenses) / income) * 100) : 0,
    savingsBalance,
    categories,
    goalLines,
    transactions,
    goals,
  };
}

// ─── AI Knowledge Base loader ─────────────────────────────────────────────────

async function loadKnowledgeBase(userEmail: string): Promise<Record<string, unknown>> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "ai_knowledge_base")
    .eq("user_email", userEmail)
    .maybeSingle();
  return (data?.value as Record<string, unknown>) ?? {};
}

// ─── Chat history (last N messages for context) ───────────────────────────────

async function loadRecentHistory(
  userEmail: string,
  limit = 10
): Promise<Array<{ role: string; content: string }>> {
  const supabase = getServiceClient();
  // Find an existing session for this user, or use the most recent
  const { data: sessions } = await supabase
    .from("ai_chat_sessions")
    .select("id")
    .eq("user_email", userEmail)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!sessions?.length) return [];
  const sessionId = sessions[0].id;

  const { data: messages } = await supabase
    .from("ai_chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (messages ?? []).reverse();
}

async function ensureSession(userEmail: string): Promise<string> {
  const supabase = getServiceClient();
  const { data: sessions } = await supabase
    .from("ai_chat_sessions")
    .select("id")
    .eq("user_email", userEmail)
    .order("created_at", { ascending: false })
    .limit(1);

  if (sessions?.length) return sessions[0].id;

  const { data: newSession } = await supabase
    .from("ai_chat_sessions")
    .insert({ user_email: userEmail, name: "Telegram Chat" })
    .select("id")
    .single();

  return newSession!.id;
}

async function saveMessages(
  sessionId: string,
  userEmail: string,
  userText: string,
  assistantText: string
): Promise<void> {
  const supabase = getServiceClient();
  await supabase.from("ai_chat_messages").insert([
    { session_id: sessionId, user_email: userEmail, role: "user", content: userText, channel: "telegram" },
    { session_id: sessionId, user_email: userEmail, role: "assistant", content: assistantText, channel: "telegram" },
  ]);
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildBotSystemPrompt(
  snapshot: Awaited<ReturnType<typeof buildFinancialSnapshot>>,
  kb: Record<string, unknown>
): string {
  const today = new Date().toISOString().slice(0, 10); // CRITICAL: always include today's date

  const kbLines: string[] = [];
  const pf = (kb.personalFacts as Record<string, unknown>) ?? {};
  if (Object.keys(pf).length > 0) {
    kbLines.push("User facts: " + Object.entries(pf).map(([k, v]) => `${k}=${v}`).join(", "));
  }
  const notes = (kb.aiNotes as Array<{ note: string; category: string }>) ?? [];
  if (notes.length > 0) {
    kbLines.push("AI notes: " + notes.slice(-3).map((n) => `[${n.category}] ${n.note}`).join("; "));
  }

  return `You are FinTrack AI — a personal finance assistant accessible via Telegram.
Today's date: ${today}

TELEGRAM RESPONSE RULES (mandatory):
- Keep replies SHORT and conversational — max 3-4 sentences or 5 bullet points.
- No Markdown tables, no ASCII charts, no CSV blocks (Telegram doesn't render them well).
- Use simple bullet lists (•) for multi-item answers.
- For complex analysis, give a 1-2 line summary and add: "Open FinTrack for the full breakdown."
- Always use the user's actual numbers — never guess.
- If asked to add a transaction, confirm what you added in one line.
- If asked about dates like "yesterday" or "last week", resolve them relative to today (${today}).
- NEVER introduce yourself, add disclaimers, or say things like "Just a quick note" or "I'm FinTrack AI" mid-conversation. Get straight to the point.
- NEVER add legal/financial disclaimers. You are a personal finance tool, not a regulated advisor.

ADDING TRANSACTIONS:
When the user asks to log/add a transaction, extract: type (income/expense), amount, category, date, note.
Valid categories: Salary, Freelance, Investments, Other Income, Rent, Food, Travel, Subscriptions, Shopping, Utilities, Healthcare, Entertainment, Education, Savings, Other.
After confirming with the user (or if they are explicit), output a silent JSON block at the very end:
{"action":"add_transaction","transaction":{"type":"expense","amount":50,"category":"Food","date":"${today}","note":"lunch"}}

CREATING GOALS:
When the user wants to save for something, ask the essential questions (target amount, deadline, monthly contribution), then output:
{"action":"create_goal","goal":{"title":"...","targetAmount":1000,"deadline":"YYYY-MM-DD","monthlyContribution":100}}

${kbLines.length > 0 ? `─── USER CONTEXT ───\n${kbLines.join("\n")}\n───────────────────\n` : ""}
─── FINANCIAL SNAPSHOT (${snapshot.currentMonth}) ───
Today's date:      ${today}
Monthly income:    $${snapshot.income.toLocaleString()}
Total expenses:    $${snapshot.totalExpenses.toLocaleString()}
Net savings:       $${snapshot.netSavings.toLocaleString()}
Savings rate:      ${snapshot.savingsRate}%
Savings balance:   $${snapshot.savingsBalance.toLocaleString()}

TOP CATEGORIES:
${snapshot.categories.slice(0, 6).join("\n")}

ACTIVE GOALS:
${snapshot.goalLines.join("\n") || "  None yet."}
────────────────────────────────────────────`;
}

// ─── Gemini call ──────────────────────────────────────────────────────────────

async function callGemini(systemPrompt: string, historyText: string, userMessage: string): Promise<string> {
  const fullPrompt = [
    systemPrompt,
    "",
    "Conversation history:",
    historyText,
    "",
    `User: ${userMessage}`,
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("Gemini error:", err);
    throw new Error(`Gemini API failed: ${response.status}`);
  }

  const json = await response.json();
  const parts: string[] = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "") ?? [];
  return parts.join("").trim() || "I couldn't generate a response. Please try again.";
}

// ─── Action block parser and executor ────────────────────────────────────────

function extractJsonAction(text: string): Record<string, unknown> | null {
  // Match a JSON object that has an "action" field, optionally after assistant prose
  const match = text.match(/\{[\s\S]*?"action"\s*:/);
  if (!match) return null;
  try {
    // Find the start of the JSON object
    const startIdx = text.indexOf(match[0]);
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    return JSON.parse(text.slice(startIdx, endIdx + 1));
  } catch {
    return null;
  }
}

// Strip the JSON action block from the reply before sending to user
function stripActionBlock(text: string): string {
  return text.replace(/\{[\s\S]*?"action"\s*:[\s\S]*?\}(\s*)$/m, "").trim();
}

async function executeAction(
  action: Record<string, unknown>,
  userEmail: string
): Promise<string | null> {
  const supabase = getServiceClient();

  if (action.action === "add_transaction") {
    const tx = action.transaction as Record<string, unknown>;
    const id = crypto.randomUUID();
    const { error } = await supabase.from("transactions").insert({
      id,
      user_email: userEmail,
      type: tx.type,
      amount: Number(tx.amount),
      category: tx.category,
      date: String(tx.date),
      note: String(tx.note ?? ""),
      source: "telegram_bot",
    });
    if (error) {
      console.error("Failed to insert transaction:", error);
      return null;
    }
    return `✅ Added: ${tx.type === "income" ? "+" : "-"}$${tx.amount} (${tx.category}) on ${tx.date}`;
  }

  if (action.action === "create_goal") {
    const goal = action.goal as Record<string, unknown>;
    const id = crypto.randomUUID();
    const { error } = await supabase.from("goals").insert({
      id,
      user_email: userEmail,
      title: goal.title,
      target_amount: Number(goal.targetAmount),
      current_amount: 0,
      deadline: String(goal.deadline),
      monthly_contribution: Number(goal.monthlyContribution ?? 0),
    });
    if (error) {
      console.error("Failed to insert goal:", error);
      return null;
    }
    return `🎯 Goal created: "${goal.title}" — $${goal.targetAmount} by ${goal.deadline}`;
  }

  return null;
}

// ─── /start command handler (QR code linking) ─────────────────────────────────

async function handleStartCommand(chatId: number, token: string, firstName: string): Promise<void> {
  if (!token) {
    await sendMessage({
      chat_id: chatId,
      text: `👋 Hi ${firstName}! I'm FinTrack AI.\n\nTo link your account, scan the QR code in FinTrack Settings → Telegram.`,
    });
    return;
  }

  const supabase = getServiceClient();
  const pendingKey = `pending_telegram_link_${token}`;
  const { data } = await supabase
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", pendingKey)
    .maybeSingle();

  if (!data) {
    await sendMessage({ chat_id: chatId, text: "❌ This link has expired or is invalid. Please generate a new QR code in FinTrack Settings." });
    return;
  }

  // Check 10-minute expiry
  const createdAt = new Date(data.updated_at as string).getTime();
  if (Date.now() - createdAt > 10 * 60 * 1000) {
    await supabase.from("app_settings").delete().eq("key", pendingKey);
    await sendMessage({ chat_id: chatId, text: "❌ This QR code has expired (10 min limit). Please generate a new one in FinTrack Settings." });
    return;
  }

  const userEmail = String(data.value);

  // Save permanent Telegram → email mapping
  await supabase.from("app_settings").upsert(
    { key: `telegram_user_${chatId}`, user_email: userEmail, value: userEmail, updated_at: new Date().toISOString() },
    { onConflict: "key,user_email" }
  );

  // Delete the pending token (single-use)
  await supabase.from("app_settings").delete().eq("key", pendingKey);

  await sendMessage({
    chat_id: chatId,
    text: `✅ FinTrack linked! Hi ${firstName}!\n\nYou can now:\n• Ask about your spending\n• Add transactions ("add $50 food lunch")\n• Check goal progress\n• Get financial advice\n\nTry: "How am I doing this month?"`,
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Verify Telegram webhook secret
  const secret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const message = update.message;
  if (!message?.text) return new Response("OK");

  const chatId = message.chat.id;
  const text = message.text.trim();
  const firstName = message.from.first_name;

  // Handle /start with optional token
  if (text.startsWith("/start")) {
    const token = text.slice(6).trim();
    await handleStartCommand(chatId, token, firstName);
    return new Response("OK");
  }

  // Resolve user email from Telegram ID
  const userEmail = await getUserEmail(chatId);
  if (!userEmail) {
    await sendMessage({
      chat_id: chatId,
      text: "⚠️ Your Telegram isn't linked to a FinTrack account yet.\n\nOpen FinTrack → Settings → Telegram and scan the QR code.",
    });
    return new Response("OK");
  }

  // Show typing indicator
  await sendTyping(chatId);

  try {
    // Build context in parallel
    const [snapshot, kb, history] = await Promise.all([
      buildFinancialSnapshot(userEmail),
      loadKnowledgeBase(userEmail),
      loadRecentHistory(userEmail, 8),
    ]);

    const systemPrompt = buildBotSystemPrompt(snapshot, kb);
    const historyText = history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");

    // Call Gemini
    const rawReply = await callGemini(systemPrompt, historyText, text);

    // Extract and execute any action block
    const action = extractJsonAction(rawReply);
    let replyText = stripActionBlock(rawReply);

    if (action) {
      const actionResult = await executeAction(action, userEmail);
      if (actionResult) {
        replyText = replyText ? `${replyText}\n\n${actionResult}` : actionResult;
      }
    }

    // Save both messages to chat history
    const sessionId = await ensureSession(userEmail);
    await saveMessages(sessionId, userEmail, text, rawReply);

    // Send reply to Telegram
    await sendMessage({
      chat_id: chatId,
      text: replyText || "Done!",
      reply_markup: {
        inline_keyboard: [[
          { text: "Open FinTrack →", url: "https://your-fintrack-app.vercel.app" },
        ]],
      },
    });
  } catch (err) {
    console.error("Bot handler error:", err);
    await sendMessage({
      chat_id: chatId,
      text: "⚠️ Something went wrong. Please try again in a moment.",
    });
  }

  return new Response("OK");
});
