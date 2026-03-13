# FinTrack

Personal finance tracker: income & expenses, savings goals, and insights.

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
| `npm run test` | Run tests |

---

## Saving your data (database)

By default, FinTrack keeps everything in memory: transactions, goals, contributions, and settings are lost when you refresh or close the tab. To **save and persist** all of that, you can connect the app to a **Supabase** (PostgreSQL) project.

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New project**, pick an organization, name the project (e.g. `fintrack`), set a database password, and create the project.
3. In the project dashboard, open **Settings → API**. Copy:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **anon public** key (under "Project API keys").

### 2. Create the database tables

1. In Supabase, open **SQL Editor**.
2. Copy the contents of **`supabase/schema.sql`** from this repo and paste into the editor.
3. Run the script. It creates: `transactions`, `goals`, `goal_contributions`, and `app_settings`.

### 3. Configure the app

1. In the project root, copy the example env file and edit it:
   ```bash
   cp .env.example .env
   ```
2. In `.env`, set:
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
3. Restart the dev server (`npm run dev`). The app will load existing data from Supabase on startup and **save changes automatically** (debounced) when you add or edit transactions, goals, contributions, or the savings balance.

If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set, the app still runs using in-memory storage only.

### Maintaining the database

- **Backups:** In Supabase, use **Settings → Database → Backups** (or your plan’s backup policy). You can also use **SQL Editor** to export data (e.g. `SELECT * FROM transactions`) or use `pg_dump` if you have direct DB access.
- **Migrations:** If you change the schema later, add a new SQL file under `supabase/` (e.g. `supabase/migrations/002_add_column.sql`) and run it in the SQL Editor or via the Supabase CLI.
- **Auth (optional):** The schema does not require auth. When you add Supabase Auth, you can enable Row Level Security (RLS) and add policies so each user only sees their own rows (e.g. by `user_id` on each table).

---

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
