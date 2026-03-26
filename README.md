# FinTrack

A personal finance tracker with income & expense management, savings goals, AI-powered insights, and a Scenario Lab for asking "what-if" financial questions.

---

## Features

| Page | Description |
|------|-------------|
| **Dashboard** | Monthly overview — income, expenses, net savings, savings rate, and charts (bar, pie, line). Navigate month-by-month through your transaction history. |
| **Transactions** | Add, edit, and delete income/expense entries across 15 categories (Salary, Rent, Food, Travel, etc.). |
| **Goals** | Create savings goals with a target amount, deadline, and monthly contribution. Log contributions, track progress, and use the **Goal Optimizer** to get spending-cut recommendations. |
| **Insights** | Rule-based spending alerts, month-over-month expense trend, safe-to-spend calculator, recommended 50/30/20 budget split, and top spending categories chart. |
| **Scenario Lab** | AI chat — default **Ollama** (local Llama-class model) or optional **Gemini**; answers use your transactions, goals, and insights-style snapshot. Chat history is persisted to Supabase when configured. |
| **Settings** | Placeholder for upcoming auth, notifications, and data export. |

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
| `npm run server` | Start the local LLM proxy (Ollama) on port 3001 — use with Scenario Lab |

---

## Environment variables

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Optional | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Optional | Your Supabase anon/public API key |
| `VITE_AI_PROVIDER` | Optional | `ollama` (default) or `gemini` — which backend Scenario Lab uses |
| `VITE_GEMINI_API_KEY` | Optional | Required only if `VITE_AI_PROVIDER=gemini` |
| `VITE_CHAT_API_URL` | Optional | Production: full base URL for the chat API; leave unset in dev (Vite proxies to `npm run server`) |
| `VITE_OLLAMA_MODEL` | Optional | Model name sent to Ollama (default `llama3.2` on the server) |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Web OAuth client ID for Google Sign-In; add **both** `http://localhost:8080` and `http://127.0.0.1:8080` as authorised JavaScript origins if needed |

If none of the variables are set, FinTrack runs entirely in-memory (data is lost on refresh).

---

## Saving your data (Supabase)

By default, FinTrack keeps everything in memory — transactions, goals, contributions, and settings are lost when you refresh or close the tab. To **persist** all data, connect the app to a **Supabase** (PostgreSQL) project.

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New project**, pick an organization, name it (e.g. `fintrack`), set a database password, and create the project.
3. In the project dashboard, open **Settings → API**. Copy:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **anon public** key (under "Project API keys").

### 2. Create the database tables

1. In Supabase, open **SQL Editor**.
2. Copy the contents of **`supabase/schema.sql`** from this repo and paste into the editor.
3. Run the script. It creates the following tables:

| Table | Purpose |
|-------|---------|
| `transactions` | Every income/expense entry |
| `goals` | Savings targets with deadline and monthly contribution |
| `goal_contributions` | Individual contribution events per goal |
| `app_settings` | Key-value store (e.g. savings balance) |
| `ai_chat_messages` | Scenario Lab chat history |

### 3. Configure the app

1. In `.env`, set:
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
2. Restart the dev server (`npm run dev`). The app loads existing data from Supabase on startup and **auto-saves changes** (debounced at 1.5 s) whenever you add, edit, or delete transactions, goals, or the savings balance.

If the env vars are not set, the app still runs using in-memory storage only.

### Maintaining the database

- **Backups:** In Supabase, use **Settings → Database → Backups** (or your plan's backup policy). You can also export data via SQL Editor (e.g. `SELECT * FROM transactions`) or use `pg_dump` if you have direct DB access.
- **Migrations:** If you change the schema later, add a new SQL file under `supabase/` (e.g. `supabase/migrations/002_add_column.sql`) and run it in the SQL Editor or via the Supabase CLI.
- **Auth (optional):** The schema does not require auth. When you add Supabase Auth, enable Row Level Security (RLS) and add policies so each user only sees their own rows (e.g. by `user_id` on each table).

---

## Scenario Lab (AI chat)

Scenario Lab sends a structured snapshot of your finances (aligned with Dashboard / Transactions / Insights / Goals) to an AI.

### Default: Ollama (local, open-source models)

1. Install [Ollama](https://ollama.com) and pull a model, e.g. `ollama pull llama3.2`.
2. In one terminal: `npm run server` (starts the small proxy on port **3001**).
3. In another: `npm run dev`. Open `http://localhost:8080` (use the same host you add in Google OAuth if you use Sign-In).

The Vite dev server proxies `/api/llm` to the chat server, which calls Ollama at `http://127.0.0.1:11434`.

If Vite logs **`ECONNREFUSED 127.0.0.1:3001`**, the chat proxy is not running — start it with **`npm run server`** in another terminal (keep `npm run dev` running).

Environment (optional): set `OLLAMA_MODEL`, `OLLAMA_BASE_URL`, or `OLLAMA_NUM_PREDICT` (cap on reply length — lower is faster on CPU) when running `npm run server` (see [`.env.example`](.env.example)). For quicker replies on a laptop CPU, try **`ollama pull llama3.2:1b`** and set `OLLAMA_MODEL=llama3.2:1b`.

### Alternative: Google Gemini

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. In `.env`:
   ```env
   VITE_AI_PROVIDER=gemini
   VITE_GEMINI_API_KEY=your-gemini-api-key
   ```
3. Restart the dev server.

**Example questions:**

- *"Can I plan travel to Australia that will cost me $1,000?"*
- *"If I invest some money in the stock market, how would that affect my monthly target?"*
- *"If I put $2,000 instead of $3,000 into my goal contributions, how would that change things?"*

The AI receives your actual transactions, goals, and savings balance as context and answers in structured steps. Chat history is persisted to the `ai_chat_messages` table in Supabase (when configured).

---

## Project structure

```
src/
├── components/
│   ├── AppLayout.tsx          # Sidebar navigation and page shell
│   ├── AnimatedCounter.tsx    # Animated number display
│   ├── CursorTooltip.tsx      # Hover tooltip provider
│   ├── GoalOptimizerModal.tsx # Spending-cut recommendations modal
│   ├── NavLink.tsx            # Sidebar nav item
│   ├── SupabaseSync.tsx       # Loads & auto-saves data to/from Supabase
│   └── ui/                   # shadcn/ui primitives
├── hooks/
│   ├── use-mobile.tsx
│   └── use-toast.ts
├── lib/
│   ├── supabase.ts            # Supabase client
│   ├── supabaseSync.ts        # Fetch/persist helpers
│   └── utils.ts              # Date helpers, class utilities
├── pages/
│   ├── Dashboard.tsx          # Monthly overview & charts
│   ├── Transactions.tsx       # Transaction list & form
│   ├── Goals.tsx              # Goals list, contributions, optimizer
│   ├── Insights.tsx           # Spending analysis & budget suggestions
│   ├── ScenarioLab.tsx        # Gemini AI chat
│   ├── Settings.tsx           # Placeholder (coming soon)
│   └── NotFound.tsx
├── store/
│   └── financeStore.ts        # Zustand global state (transactions, goals, savings)
├── App.tsx
└── main.tsx
supabase/
└── schema.sql                 # All table definitions
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
| Database | [Supabase](https://supabase.com/) (PostgreSQL) — optional |
| AI | [Google Gemini 1.5 Flash](https://aistudio.google.com/) — optional |
| Forms | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| Testing | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) |

---

## How can I edit this code?

**Use your preferred IDE**

Clone this repo and push changes. The only requirement is having Node.js & npm installed — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm install

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the **Edit** button (pencil icon) at the top right of the file view.
- Make your changes and commit.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click the **Code** button (green button) near the top right.
- Select the **Codespaces** tab.
- Click **New codespace** to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.


Bank Account Integration (Automatic Transactions)

FinTrack supports secure bank account integration to automatically import financial activity, eliminating the need for manual transaction entry.

Once a user connects their bank account:

Transactions are automatically captured in near real-time

Income and expenses are auto-categorized

The Dashboard and Insights update instantly

Users no longer need to manually log entries in the Transactions page

Duplicate detection and reconciliation keep the ledger clean

This allows FinTrack to function as a live financial monitoring system rather than a manual expense tracker.

Typical integrations may use financial data aggregation providers such as Plaid or Yodlee to securely retrieve transaction data from banks.

Scenario Lab (AI Financial Co-Worker)

The Scenario Lab is the central AI workspace of FinTrack.

All AI capabilities are handled inside Scenario Lab — the application does not include separate AI tabs or assistants elsewhere.

The AI co-worker is powered by models such as Claude and can interact directly with the user’s financial data.

Users can ask the AI to:

Analyze spending behavior

Recommend budget adjustments

Modify Goals

Update or correct Transactions

Plan savings strategies

Answer financial questions using the user’s real financial context

Example prompts:

“Create a plan to save $8,000 in the next 10 months.”

“Reduce my dining expenses and update my monthly targets.”

“Increase my emergency fund goal to $5,000.”

“Analyze my spending and suggest ways to save $300 per month.”

The AI has contextual awareness of:

transactions

goals

savings balance

spending patterns

This enables it to provide personalized financial recommendations and perform structured updates within the system.

Decision Simulation Engine

FinTrack includes a financial decision simulation engine inside the Scenario Lab that allows users to explore “what-if” financial scenarios before making real decisions.

Users can simulate scenarios such as:

increasing rent or housing costs

planning travel or large purchases

adjusting monthly savings contributions

modifying financial goals

changing spending habits

Example scenarios:

“If my rent increases by $400 next year, how will it affect my savings?”

“What happens if I invest $300 every month for the next 12 months?”

“If I cut dining expenses by 20%, how fast can I reach my travel goal?”

The simulation engine analyzes the user’s financial data and provides:

projected savings outcomes

goal completion timelines

monthly cash-flow changes

recommendations to stay financially stable

This transforms FinTrack from a passive tracking tool into a financial decision support system.

AI Architecture Principle

All intelligent capabilities in FinTrack are centralized inside the Scenario Lab.

The rest of the application focuses on:

financial data capture

financial visualization

goal tracking

financial insights

The Scenario Lab is the only AI interaction layer, ensuring that all advanced financial reasoning, simulations, and automated adjustments are performed in a single, unified workspace.