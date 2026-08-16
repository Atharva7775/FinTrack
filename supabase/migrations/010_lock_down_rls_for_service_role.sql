-- Migration 010: Lock down RLS now that the server is the trusted write path
--
-- Until now, every table had a permissive "USING (true) WITH CHECK (true)"
-- policy for the anon role — meaning anyone holding the public anon key
-- (which ships in every browser bundle by design) could read AND write any
-- row for any user, regardless of the app's own user_email filtering.
--
-- The FinTrack Express server (server/routes/*.ts) now requires a verified
-- Google ID token on every request and connects to Supabase with the
-- service_role key, which bypasses RLS entirely. The Telegram bot's Edge
-- Function (supabase/functions/bot-webhook) already used service_role too.
-- Neither is affected by anything below.
--
-- The one carve-out: `transactions` keeps a read-only anon SELECT policy,
-- because the web app's live Realtime subscription (useRealtimeSync.ts)
-- connects with the anon key and Supabase Realtime enforces RLS SELECT
-- policies on that connection. Every other table gets zero anon policies —
-- RLS enabled with no matching policy means anon can do nothing at all.

-- ─── transactions: anon may SELECT only (for Realtime) ────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_transactions" ON public.transactions;
DROP POLICY IF EXISTS "transactions_anon_select" ON public.transactions;
CREATE POLICY "transactions_anon_select" ON public.transactions
  FOR SELECT TO anon
  USING (true);

-- ─── goals, budgets, app_settings: known permissive policies, dropped ─────────
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_goals" ON public.goals;

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_access" ON public.budgets;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_app_settings" ON public.app_settings;

-- ─── everything else: enable RLS, then drop whatever anon policies exist ──────
-- Policy names for these weren't confirmed ahead of time, so this drops all
-- of them programmatically rather than guessing exact names.
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_month_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE tablename IN (
      'goal_contributions',
      'budget_month_snapshots',
      'user_onboarding',
      'ai_chat_sessions',
      'ai_chat_messages'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- ─── verify ─────────────────────────────────────────────────────────────────
-- After running this, the only row this should return is transactions/SELECT/anon:
--   select tablename, policyname, roles, cmd from pg_policies
--   where tablename in ('transactions','goals','goal_contributions','budgets',
--     'budget_month_snapshots','app_settings','user_onboarding',
--     'ai_chat_sessions','ai_chat_messages');
