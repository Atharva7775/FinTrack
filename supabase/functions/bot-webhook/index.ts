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

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramMessage {
  message_id: number;
  from: { id: number; first_name: string; username?: string };
  chat: { id: number };
  text?: string;
  photo?: TelegramPhotoSize[];   // array ordered smallest → largest
  caption?: string;              // optional caption sent with photo
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

// ─── Local date helpers (system timezone, not UTC) ────────────────────────────
function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localMonth(d = new Date()): string {
  return localDate(d).slice(0, 7);
}

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

// ─── Photo download: Telegram file_id → base64 ───────────────────────────────

async function downloadTelegramPhoto(fileId: string): Promise<{ base64: string; mimeType: string } | null> {
  // Step 1: resolve file_path
  const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  if (!fileRes.ok) return null;
  const fileJson = await fileRes.json();
  const filePath: string = fileJson?.result?.file_path;
  if (!filePath) return null;

  // Step 2: download the raw bytes
  const imgRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`);
  if (!imgRes.ok) return null;
  const arrayBuffer = await imgRes.arrayBuffer();

  // Step 3: base64 encode
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  const ext = filePath.split(".").pop()?.toLowerCase();
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";
  return { base64, mimeType };
}

// ─── Gemini Vision: receipt/bill OCR → transactions ──────────────────────────

async function processReceiptImage(
  imageBase64: string,
  mimeType: string,
  caption: string,
  snapshot: Awaited<ReturnType<typeof buildFinancialSnapshot>>
): Promise<string> {
  const today = localDate();

  const ocrPrompt = `You are FinTrack AI analyzing a receipt or bill image.
Today's date: ${today}

TASK: Extract all purchased items/charges from this receipt image and create transactions for them.

CATEGORIES (use ONLY these, map items to the closest one):
- Food          → restaurants, groceries, cafes, delivery, snacks, drinks
- Travel        → hotels, accommodation, flights, transport, Uber, fuel
- Entertainment → movies, games, events, concerts, clubs, leisure activities
- Shopping      → clothes, electronics, non-food retail, Amazon orders
- Utilities     → electricity, water, internet, phone bills
- Healthcare    → pharmacy, doctors, medical supplies
- Subscriptions → streaming, software, memberships
- Rent          → rent payments, lease
- Education     → courses, books, tuition
- Savings       → savings deposits
- Other         → anything else

RULES:
- Group similar small items into one transaction if they are clearly the same category (e.g., all food items on a restaurant bill → one Food transaction for the subtotal).
- Keep distinct categories SEPARATE (e.g., a hotel bill with room + minibar + spa → Travel for room, Food for minibar, Entertainment for spa).
- Use the total amount per category (before tip, unless tip is specified).
- Use today's date (${today}) unless the receipt shows a different date — if so, use that date.
- If there is a grand total and you can't distinguish items, create ONE transaction for the full amount in the most fitting category.
- The user's caption (if any): "${caption}"

OUTPUT FORMAT — respond with:
1. A SHORT human-readable summary of what you found (1-3 lines).
2. Then one JSON action block per transaction at the very END, each on its own line:
{"action":"add_transaction","transaction":{"type":"expense","amount":25.50,"category":"Food","date":"${today}","note":"receipt item description"}}

If you cannot read the image or it is not a receipt/bill, reply: "I couldn't read this as a receipt. Please send a clearer photo of the bill."`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: ocrPrompt },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("Gemini Vision error:", err);
    throw new Error(`Gemini Vision API failed: ${response.status}`);
  }

  const json = await response.json();
  const parts: string[] = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "") ?? [];
  return parts.join("").trim() || "I couldn't analyse this image. Please try again.";
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
  const currentMonth = allMonths[0] ?? localMonth();

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
    return `  [${g.id}] "${g.title}" — $${g.currentAmount}/$${g.targetAmount} (${pct}%), needs $${g.monthlyContribution}/mo, deadline ${g.deadline}`;
  });

  // Multi-month spending trend (last 3 months with transaction data)
  const trendMonths = allMonths.slice(0, 3).reverse(); // oldest → newest
  const monthlyTrend = trendMonths.map((m) => {
    const mIncome = transactions
      .filter((t) => t.type === "income" && t.date.startsWith(m))
      .reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
    const mExpenses = transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(m))
      .reduce((s, t) => s + (t.usdAmount ?? t.amount), 0);
    return { month: m, income: mIncome, expenses: mExpenses, net: mIncome - mExpenses };
  });

  // Recent transactions formatted for the prompt (with IDs for update/delete)
  const recentTxLines = transactions.slice(0, 20).map((t) => {
    const amt = (t.usdAmount ?? t.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = t.type === "income" ? "+" : "-";
    return `  [${t.id}] ${t.date}  ${t.type.padEnd(7)}  ${sign}$${amt.padStart(9)}  ${t.category.padEnd(16)} "${t.note}"`;
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
    monthlyTrend,
    recentTxLines,
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
  const today = localDate(); // system local timezone, not UTC
  const d1 = new Date(); d1.setDate(d1.getDate() - 1);
  const d2 = new Date(); d2.setDate(d2.getDate() - 2);
  const d7 = new Date(); d7.setDate(d7.getDate() - 7);
  const yesterday = localDate(d1);
  const twoDaysAgo = localDate(d2);
  const lastWeek = localDate(d7);

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
Yesterday: ${yesterday}

TELEGRAM RESPONSE RULES:
- For simple queries (add transaction, check balance, goal status) — keep replies SHORT (2-4 sentences).
- For financial guidance, analysis, or "how am I doing" questions — give a FULL breakdown with bullet points. Do NOT cut short.
- No Markdown tables or ASCII charts (Telegram doesn't render them). Use bullet lists (•) instead.
- Always use the user's actual numbers from the FINANCIAL SNAPSHOT below — never guess or estimate.
- NEVER introduce yourself, add disclaimers, or say things like "Just a quick note" or "I'm FinTrack AI". Get straight to the point.
- NEVER add legal/financial disclaimers. You are a personal finance tool, not a regulated advisor.

─── DATE RESOLUTION (CRITICAL) ───────────────────────────────────────────────
Today is ${today}. Always resolve relative dates to exact YYYY-MM-DD:
• "yesterday"          → ${yesterday}
• "2 days ago"         → ${twoDaysAgo}
• "last week"          → around ${lastWeek}
• "this month"         → ${snapshot.currentMonth}
When writing action JSON, ALWAYS use the computed YYYY-MM-DD — never write "${today}" for past events.
──────────────────────────────────────────────────────────────────────────────

─── ADDING TRANSACTIONS ───────────────────────────────────────────────────────
When user logs a transaction, extract: type (income/expense), amount, category, date (resolve it!), note.
Valid categories: Salary, Freelance, Investments, Other Income, Rent, Food, Travel, Subscriptions, Shopping, Utilities, Healthcare, Entertainment, Education, Savings, Other.
Output a silent JSON block at the very end of your reply:
{"action":"add_transaction","transaction":{"type":"expense","amount":45,"category":"Food","date":"YYYY-MM-DD","note":"lunch"}}
Replace YYYY-MM-DD with the actual resolved date. Confirm in one conversational line what you added.
──────────────────────────────────────────────────────────────────────────────

─── MODIFYING PAST TRANSACTIONS ──────────────────────────────────────────────
To edit/correct a past transaction, look it up in RECENT TRANSACTIONS below (find by date, amount, note).
Copy the exact ID from the [ID] prefix and output at the very end:
{"action":"update_transaction","id":"<exact-id>","changes":{"amount":50,"category":"Food","date":"YYYY-MM-DD","note":"corrected note"}}
Only include fields that actually need changing. You can change amount, category, date, and note.
──────────────────────────────────────────────────────────────────────────────

─── DELETING TRANSACTIONS ────────────────────────────────────────────────────
If the user asks to delete/remove a transaction, find its ID from RECENT TRANSACTIONS and output:
{"action":"delete_transaction","id":"<exact-id>"}
Confirm with the user what you deleted in one line.
──────────────────────────────────────────────────────────────────────────────

─── CREATING GOALS ───────────────────────────────────────────────────────────
When the user wants to save for something, collect: title, target amount, deadline, monthly contribution.
Output at the very end:
{"action":"create_goal","goal":{"title":"Vacation","targetAmount":2000,"deadline":"YYYY-MM-DD","monthlyContribution":200}}
──────────────────────────────────────────────────────────────────────────────

─── MODIFYING GOALS ──────────────────────────────────────────────────────────
To edit an existing goal, find its ID from ACTIVE GOALS below (the [ID] prefix).
Output at the very end:
{"action":"update_goal","id":"<exact-id>","changes":{"targetAmount":2000,"deadline":"YYYY-MM-DD","monthlyContribution":200,"title":"New Name"}}
Only include fields that actually need changing. You can change title, targetAmount, currentAmount, deadline, monthlyContribution.
──────────────────────────────────────────────────────────────────────────────

─── DELETING GOALS ───────────────────────────────────────────────────────────
To delete a goal entirely, find its ID from ACTIVE GOALS and output:
{"action":"delete_goal","id":"<exact-id>"}
Confirm with the user what you deleted in one line.
──────────────────────────────────────────────────────────────────────────────

${kbLines.length > 0 ? `─── USER CONTEXT ───\n${kbLines.join("\n")}\n───────────────────\n` : ""}
─── FINANCIAL SNAPSHOT (${snapshot.currentMonth}) ───────────────────────────────────────
Today:              ${today}
Monthly income:     $${snapshot.income.toLocaleString()}
Total expenses:     $${snapshot.totalExpenses.toLocaleString()}
Net savings:        $${snapshot.netSavings.toLocaleString()}
Savings rate:       ${snapshot.savingsRate}%
Savings balance:    $${snapshot.savingsBalance.toLocaleString()}

SPENDING BY CATEGORY (this month):
${snapshot.categories.join("\n") || "  No expenses yet."}

MONTH-OVER-MONTH TREND:
${snapshot.monthlyTrend.map((m) => `  ${m.month}:  income $${m.income.toLocaleString()}  |  expenses $${m.expenses.toLocaleString()}  |  net $${m.net.toLocaleString()}`).join("\n") || "  Insufficient history."}

ACTIVE GOALS:
${snapshot.goalLines.join("\n") || "  None yet."}

RECENT TRANSACTIONS (last 20 — IDs required for edits/deletes):
${snapshot.recentTxLines.join("\n") || "  No transactions yet."}
────────────────────────────────────────────────────────────────────────────`;
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
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
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

// Extract ALL action blocks (for multi-transaction receipts)
function extractAllJsonActions(text: string): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  const regex = /\{[\s\S]*?"action"\s*:/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const startIdx = match.index;
      let depth = 0;
      let endIdx = startIdx;
      for (let i = startIdx; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") {
          depth--;
          if (depth === 0) { endIdx = i; break; }
        }
      }
      const parsed = JSON.parse(text.slice(startIdx, endIdx + 1));
      results.push(parsed);
      regex.lastIndex = endIdx + 1; // advance past this block
    } catch {
      // skip malformed block
    }
  }
  return results;
}

// Strip ALL action blocks from reply text
function stripAllActionBlocks(text: string): string {
  return text.replace(/\{[\s\S]*?"action"\s*:[\s\S]*?\}/g, "").trim();
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

  if (action.action === "update_transaction") {
    const id = String(action.id);
    const changes = action.changes as Record<string, unknown>;
    const updatePayload: Record<string, unknown> = {};
    if (changes.amount !== undefined) updatePayload.amount = Number(changes.amount);
    if (changes.category !== undefined) updatePayload.category = String(changes.category);
    if (changes.date !== undefined) updatePayload.date = String(changes.date);
    if (changes.note !== undefined) updatePayload.note = String(changes.note);

    const { error } = await supabase
      .from("transactions")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_email", userEmail);

    if (error) {
      console.error("Failed to update transaction:", error);
      return null;
    }
    const fieldSummary = Object.entries(updatePayload).map(([k, v]) => `${k}=${v}`).join(", ");
    return `✏️ Updated transaction: ${fieldSummary}`;
  }

  if (action.action === "delete_transaction") {
    const id = String(action.id);
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id)
      .eq("user_email", userEmail);

    if (error) {
      console.error("Failed to delete transaction:", error);
      return null;
    }
    return `🗑️ Transaction deleted.`;
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

  if (action.action === "update_goal") {
    const id = String(action.id);
    const changes = action.changes as Record<string, unknown>;
    const updatePayload: Record<string, unknown> = {};
    if (changes.title !== undefined) updatePayload.title = String(changes.title);
    if (changes.targetAmount !== undefined) updatePayload.target_amount = Number(changes.targetAmount);
    if (changes.currentAmount !== undefined) updatePayload.current_amount = Number(changes.currentAmount);
    if (changes.deadline !== undefined) updatePayload.deadline = String(changes.deadline);
    if (changes.monthlyContribution !== undefined) updatePayload.monthly_contribution = Number(changes.monthlyContribution);
    const { error } = await supabase.from("goals").update(updatePayload).eq("id", id).eq("user_email", userEmail);
    if (error) {
      console.error("Failed to update goal:", error);
      return null;
    }
    const fieldSummary = Object.entries(updatePayload).map(([k, v]) => `${k}=${v}`).join(", ");
    return `✏️ Updated goal: ${fieldSummary}`;
  }

  if (action.action === "delete_goal") {
    const id = String(action.id);
    const { error } = await supabase.from("goals").delete().eq("id", id).eq("user_email", userEmail);
    if (error) {
      console.error("Failed to delete goal:", error);
      return null;
    }
    return `🗑️ Goal deleted.`;
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
  if (!message?.text && !message?.photo) return new Response("OK");

  const chatId = message.chat.id;
  const firstName = message.from.first_name;

  // ── Photo / receipt message ──────────────────────────────────────────────
  if (message.photo && message.photo.length > 0) {
    // Resolve user email first
    const userEmail = await getUserEmail(chatId);
    if (!userEmail) {
      await sendMessage({
        chat_id: chatId,
        text: "⚠️ Your Telegram isn't linked to a FinTrack account yet.\n\nOpen FinTrack → Settings → Telegram and scan the QR code.",
      });
      return new Response("OK");
    }

    await sendTyping(chatId);

    try {
      // Pick the highest-resolution photo (last in array)
      const bestPhoto = message.photo[message.photo.length - 1];
      const photoData = await downloadTelegramPhoto(bestPhoto.file_id);

      if (!photoData) {
        await sendMessage({ chat_id: chatId, text: "⚠️ Couldn't download the image. Please try again." });
        return new Response("OK");
      }

      const snapshot = await buildFinancialSnapshot(userEmail);
      const caption = message.caption ?? "";
      const rawReply = await processReceiptImage(photoData.base64, photoData.mimeType, caption, snapshot);

      // Execute ALL action blocks found in the reply
      const allActions = extractAllJsonActions(rawReply);
      const results: string[] = [];
      for (const action of allActions) {
        const result = await executeAction(action, userEmail);
        if (result) results.push(result);
      }

      const visibleReply = stripAllActionBlocks(rawReply);
      const finalReply = results.length > 0
        ? `${visibleReply}\n\n${results.join("\n")}`
        : visibleReply;

      const sessionId = await ensureSession(userEmail);
      await saveMessages(sessionId, userEmail, `[receipt image] ${caption}`, rawReply);

      await sendMessage({ chat_id: chatId, text: finalReply || "Done!" });
    } catch (err) {
      console.error("Receipt handler error:", err);
      await sendMessage({ chat_id: chatId, text: "⚠️ Something went wrong reading the receipt. Please try again." });
    }

    return new Response("OK");
  }

  // ── Text message ─────────────────────────────────────────────────────────
  const text = message.text!.trim();

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
