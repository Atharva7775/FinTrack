# FinTrack

A personal finance tracker with income & expense management, savings goals, AI-powered insights, a Scenario Lab for "what-if" financial questions, and a **Telegram bot** that lets you log transactions, scan receipts, and get financial guidance on the go.

---

## Features

| Page / Feature | Description |
|----------------|-------------|
| **Dashboard** | Monthly overview — income, expenses, net savings, savings rate, and charts (bar, pie, line). Navigate month-by-month through your transaction history. |
| **Transactions** | Add, edit, and delete income/expense entries across 15 categories (Salary, Rent, Food, Travel, etc.). |
| **Goals** | Create savings goals with a target amount, deadline, and monthly contribution. Log contributions, track progress, and use the **Goal Optimizer** to get AI-powered spending-cut recommendations. |
| **Insights** | Detailed "Essential vs. Optional" expense autopsy. Highlights categories that grew >10% month-over-month. |
| **Scenario Lab** | AI Financial Co-Worker — powered by **Google Gemini 2.5 Flash**. Answers questions using your real transactions, goals, and financial context. Supports file/image/PDF attachments, receipt OCR, Google Search grounding, and persistent AI Memory. |
| **Settings** | Splitwise sync, seed data management, view mode toggle, **AI Memory** viewer, and **Telegram bot linking** (QR code). |
| **Telegram Bot** | Full-featured bot (`@Fintrack100_bot`) with OCR receipt scanning, transaction logging, past-transaction editing, goal tracking, financial guidance, and multi-month trend analysis. Runs 24/7 independently of the web app. |

---

## Run locally

**Requirements:** Node.js 18+ and npm.

```bash
# Install dependencies
npm install

# Start the dev server (with hot reload)
npm run dev
```

Then open **http://localhost:8080** in your browser.

**Other commands:**

| Command | Description |
|---------|-------------|
| `npm run build` | Production build (output in `dist/`) |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Optional | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Optional | Your Supabase anon/public API key |
| `VITE_GEMINI_API_KEY` | **Required** | API key for Google Gemini — [get one here](https://aistudio.google.com/app/apikey) |
| `VITE_GEMINI_MODEL` | Optional | Model name (default: `gemini-2.5-flash`) |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Web OAuth client ID for Google Sign-In |
| `VITE_TELEGRAM_BOT_USERNAME` | Optional | Telegram bot username for QR linking UI (e.g. `Fintrack100_bot`) |

If Supabase vars are not set, FinTrack runs entirely in-memory (data is lost on refresh).

---

## Saving your data (Supabase)

By default, FinTrack keeps everything in memory. To persist data, connect to a **Supabase** (PostgreSQL) project.

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**, name it (e.g. `fintrack`), set a database password, and create it.
3. Open **Settings → API** and copy the **Project URL** and **anon public** key.

### 2. Create the database tables

1. In Supabase, open **SQL Editor**.
2. Paste and run **`supabase/schema.sql`** from this repo.
3. Then run the migration files in order:

| Migration | Purpose |
|-----------|---------|
| `supabase/migrations/001_splitwise_fields.sql` | Adds Splitwise balance fields |
| `supabase/migrations/002_user_email_isolation.sql` | Adds `user_email` column to all tables for per-user isolation |
| `supabase/migrations/003_app_settings_user_isolation.sql` | Composite PK `(key, user_email)` on `app_settings` |
| `supabase/migrations/004_telegram_bot.sql` | Adds `source` to transactions, `channel`/`user_email` to chat messages, Realtime publications |

### 3. Configure the app

Add to `.env`:
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The app loads existing data from Supabase on startup and **auto-saves** changes (debounced at 1.5s).

---

## Scenario Lab (AI chat)

Scenario Lab sends a structured snapshot of your finances to **Google Gemini 2.5 Flash** on every message.

### Setup
1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Add to `.env`: `VITE_GEMINI_API_KEY=your-key`
3. Restart the dev server.

### AI Features

| Feature | Description |
|---------|-------------|
| **Financial Context** | AI sees your real transactions, goals, savings balance, and spending trends on every message. |
| **AI Memory (Knowledge Base)** | The AI passively learns about you across conversations — city, risk tolerance, goals, spending personality. Stored per-user in Supabase; manageable in Settings → AI Memory. |
| **Financial Operations Expert** | Built-in skill covering profit/loss analysis, tax planning (quarterly estimates, S-Corp thresholds), cash flow forecasting, and bookkeeping frameworks. |
| **Google Search Grounding** | Gemini automatically searches the web for live data (interest rates, tax rules, market info) when needed. |
| **Receipt & Document OCR** | Attach a photo of a bill, bank statement, or PDF — the AI reads it against your financial data. Click the 📎 paperclip button in the chat input. |
| **Action Blocks** | Ask the AI to create a goal, log a transaction, or update data — it emits structured JSON the app applies automatically. |
| **Decision Simulation** | Ask "what if" questions: rent increases, investment plans, goal changes — the AI projects outcomes using your real numbers. |

---

## Telegram Bot

FinTrack includes a **Telegram bot** (`@Fintrack100_bot`) powered by the same Gemini AI and Supabase database as the web app. It runs 24/7 as a Supabase Edge Function — independent of the web app.

### Linking your account

1. Open FinTrack → **Settings → Telegram**.
2. Click **Generate QR Code** and scan it with your phone camera or Telegram.
3. Tap the link that opens — this sends `/start <token>` to the bot and links your account.
4. Done. All transactions added via the bot appear instantly in the web app.

### Bot capabilities

| Capability | Example |
|-----------|---------|
| **Log a transaction** | "I spent $45 on lunch today" |
| **Log on a past date** | "Add $30 food yesterday" / "Coffee for $4.80 two days ago" |
| **Ask for financial guidance** | "How am I doing this month?" / "How can I cut my spending?" |
| **Edit a past transaction** | "Fix that $50 coffee entry — it was actually $4.80" |
| **Delete a transaction** | "Remove the duplicate rent entry" |
| **Check goals** | "How far am I from my travel goal?" |
| **Create a new goal** | "I want to save $2,000 for a laptop by December" |
| **Receipt OCR** | Send a photo of any receipt — the bot extracts line items, groups by category, and adds all transactions automatically |
| **Multi-month trends** | "Compare my spending over the last 3 months" |

### Receipt scanning (Telegram)

Send a photo of any bill or receipt — the bot:
1. Downloads the image from Telegram
2. Sends it to Gemini Vision for OCR
3. Groups items into categories: Food, Travel, Entertainment, Shopping, Utilities, Healthcare, Subscriptions, Rent, Education, Savings, Other
4. Adds each category as a separate transaction with the correct date (uses receipt date if printed, otherwise today)
5. Replies with a confirmation summary

You can optionally add a caption like "this is from last Tuesday" to provide extra context.

### Bot deployment (for self-hosting)

The bot runs as a Supabase Edge Function. To deploy your own:

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Login and link your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set TELEGRAM_BOT_TOKEN=your-bot-token
supabase secrets set TELEGRAM_WEBHOOK_SECRET=your-webhook-secret
supabase secrets set GEMINI_API_KEY=your-gemini-key
supabase secrets set GEMINI_MODEL=gemini-2.5-flash

# Deploy
supabase functions deploy bot-webhook --no-verify-jwt

# Register webhook with Telegram
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_PROJECT_REF.supabase.co/functions/v1/bot-webhook" \
  -d "secret_token=your-webhook-secret"
```

After any code changes, redeploy with `supabase functions deploy bot-webhook --no-verify-jwt`.

---

## Project structure

```
src/
├── components/
│   ├── AppLayout.tsx             # Sidebar navigation, page shell, Realtime sync hook
│   ├── AnimatedCounter.tsx       # Animated number display
│   ├── CursorTooltip.tsx         # Hover tooltip provider
│   ├── GoalOptimizerModal.tsx    # AI-powered spending-cut recommendations modal
│   ├── NavLink.tsx               # Sidebar nav item
│   └── SupabaseSync.tsx          # Loads & auto-saves data to/from Supabase
├── hooks/
│   ├── useAuth.tsx               # Google Sign-In auth hook
│   ├── useRealtimeSync.ts        # Supabase Realtime hook — syncs bot-inserted transactions live
│   ├── use-mobile.tsx
│   └── use-toast.ts
├── lib/
│   ├── supabase.ts               # Supabase client
│   ├── supabaseSync.ts           # Fetch/persist helpers
│   ├── aiChatClient.ts           # Gemini REST client (Vision + Google Search grounding)
│   ├── aiContextBuilder.ts       # Builds system prompt with KB + Financial Expert skill (local-timezone dates)
│   ├── aiSystemPrompt.ts         # Base prompt + KB_UPDATE format instructions
│   ├── userKnowledgeBase.ts      # AI Memory — types, derive, merge, load, save
│   ├── financialSnapshotForAI.ts # Serializes store state for AI context
│   ├── scenarioEngine.ts         # Scenario simulation helpers
│   ├── splitwise.ts              # Splitwise API integration
│   ├── pdfGenerator.ts           # PDF report export
│   └── utils.ts                  # Class utilities
├── pages/
│   ├── Dashboard.tsx             # Monthly overview & charts
│   ├── Transactions.tsx          # Transaction list & form
│   ├── Goals.tsx                 # Goals list, contributions, optimizer
│   ├── Insights.tsx              # Expense autopsy
│   ├── ScenarioLab.tsx           # Gemini AI chat — OCR attachments, action blocks, KB
│   ├── Settings.tsx              # Splitwise sync, seed data, AI Memory, Telegram QR linking
│   └── NotFound.tsx
└── store/
    ├── financeStore.ts           # Zustand global state (transactions, goals, savings)
    └── chatStore.ts              # Chat session state
supabase/
├── schema.sql                    # All table definitions
├── migrations/                   # Incremental schema changes (001–004)
└── functions/
    └── bot-webhook/
        └── index.ts              # Telegram bot Deno Edge Function
.agents/
└── skills/
    └── financial-operations-expert/
        └── SKILL.md              # Financial expert skill injected into AI system prompt
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | [React 18](https://react.dev/) + [Vite](https://vitejs.dev/) |
| Language | TypeScript |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| UI components | [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) |
| State management | [Zustand](https://zustand-demo.pmnd.rs/) |
| Charts | [Recharts](https://recharts.org/) |
| Animations | [Framer Motion](https://www.framer-motion.com/) |
| Database | [Supabase](https://supabase.com/) (PostgreSQL + Realtime) |
| Bot runtime | [Supabase Edge Functions](https://supabase.com/docs/guides/functions) (Deno) |
| AI model | [Google Gemini 2.5 Flash](https://aistudio.google.com/) (text + vision) |
| AI grounding | Google Search (live rates, tax rules, market data) |
| AI skills | Financial Operations Expert (profit/loss, tax planning, cash flow) |
| Bot platform | [Telegram Bot API](https://core.telegram.org/bots/api) |
| QR codes | [qrcode.react](https://github.com/zpao/qrcode.react) |
| Forms | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| Testing | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) |

---

## How can I edit this code?

Clone the repo and run locally:

```bash
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm install
npm run dev
```

You can also edit files directly on GitHub or use GitHub Codespaces.

