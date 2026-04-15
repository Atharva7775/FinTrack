-- Migration 007: Add month column to budgets table
-- This is safe to run multiple times (all statements are idempotent).
-- Run this in your Supabase SQL Editor if budgets disappear on refresh.

-- Step 1: Add the month column if it doesn't already exist
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS month text NOT NULL DEFAULT '';

-- Step 2: Backfill any existing rows that have an empty month
UPDATE public.budgets
  SET month = TO_CHAR(NOW(), 'YYYY-MM')
  WHERE month = '';

-- Step 3: Drop the old single-column unique constraint (one budget per user+category).
-- We find it by introspection so the name doesn't matter.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND rel.relname = 'budgets'
      AND con.contype = 'u'  -- unique constraint
      AND (
        -- target: constraints whose columns are exactly (user_email, category) or (category, user_email)
        (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM pg_attribute a
           JOIN unnest(con.conkey) k ON k = a.attnum
           WHERE a.attrelid = con.conrelid)
        = ARRAY['category', 'user_email']
      )
  LOOP
    EXECUTE format('ALTER TABLE public.budgets DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END;
$$;

-- Step 4: Drop the old unique index if it exists (handles both name variants)
DROP INDEX IF EXISTS public.budgets_user_email_category_key;
DROP INDEX IF EXISTS public.budgets_user_email_category_idx;

-- Step 5: Create the correct unique index: one budget per user+category+month
CREATE UNIQUE INDEX IF NOT EXISTS budgets_user_email_category_month_key
  ON public.budgets(user_email, category, month);

-- Step 6: Index for fast per-user per-month lookups
CREATE INDEX IF NOT EXISTS idx_budgets_user_month
  ON public.budgets(user_email, month);
