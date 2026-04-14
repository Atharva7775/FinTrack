-- Migration 003: Per-month budgets
-- Each budget row is now scoped to a specific calendar month (YYYY-MM).
-- This allows users to set up different budgets per month and view history.

-- 1. Add month column (default to empty string for existing rows)
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS month text NOT NULL DEFAULT '';

-- 2. Backfill existing rows to the current month so they remain visible
UPDATE public.budgets
  SET month = TO_CHAR(NOW(), 'YYYY-MM')
  WHERE month = '';

-- 3. Drop the old unique constraint on (user_email, category) if it exists
--    (Supabase may name it differently; adjust if needed)
ALTER TABLE public.budgets
  DROP CONSTRAINT IF EXISTS budgets_user_email_category_key;

-- 4. Create new unique constraint on (user_email, category, month)
CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_email_category_month_key
  ON public.budgets(user_email, category, month);

-- 5. Index for fast per-user-per-month queries
CREATE INDEX IF NOT EXISTS idx_budgets_user_month
  ON public.budgets(user_email, month);
