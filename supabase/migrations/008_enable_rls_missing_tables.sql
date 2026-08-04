-- Migration 008: Enable RLS on tables missing row-level security
-- Fixes security lint errors for user_onboarding, budgets, and budget_month_snapshots.
-- Safe to run multiple times (idempotent).

-- ─── user_onboarding ─────────────────────────────────────────────────────────

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_user_isolation" ON public.user_onboarding;
CREATE POLICY "onboarding_user_isolation" ON public.user_onboarding
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email')
  WITH CHECK (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- ─── budgets ─────────────────────────────────────────────────────────────────

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_user_isolation" ON public.budgets;
CREATE POLICY "budget_user_isolation" ON public.budgets
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email')
  WITH CHECK (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- ─── budget_month_snapshots ───────────────────────────────────────────────────

ALTER TABLE public.budget_month_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snapshot_user_isolation" ON public.budget_month_snapshots;
CREATE POLICY "snapshot_user_isolation" ON public.budget_month_snapshots
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email')
  WITH CHECK (user_email = current_setting('request.jwt.claims', true)::json->>'email');
