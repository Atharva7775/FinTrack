-- Migration 006: Budget System
-- Creates per-user budget rows and monthly performance snapshots

CREATE TABLE IF NOT EXISTS budgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email    TEXT NOT NULL,
  category      TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'percentage',  -- 'percentage' | 'fixed'
  percentage    NUMERIC,        -- % of monthly income (null if type=fixed)
  fixed_amount  NUMERIC,        -- fixed $ limit  (null if type=percentage)
  rollover_balance NUMERIC NOT NULL DEFAULT 0,  -- unused amount carried forward from prev month
  alert_threshold  INT NOT NULL DEFAULT 80,     -- % usage at which to fire warning toast
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_email, category)  -- one budget row per category per user
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_user_isolation" ON budgets
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email')
  WITH CHECK (user_email = current_setting('request.jwt.claims', true)::json->>'email');

-- Monthly archive: one row per user+category+month after month closes
CREATE TABLE IF NOT EXISTS budget_month_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   TEXT NOT NULL,
  category     TEXT NOT NULL,
  month        TEXT NOT NULL,  -- YYYY-MM
  limit_amount NUMERIC NOT NULL,
  spent        NUMERIC NOT NULL,
  rollover_to_next NUMERIC NOT NULL DEFAULT 0,  -- positive = carried forward, negative = 0
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_email, category, month)
);

ALTER TABLE budget_month_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshot_user_isolation" ON budget_month_snapshots
  USING (user_email = current_setting('request.jwt.claims', true)::json->>'email')
  WITH CHECK (user_email = current_setting('request.jwt.claims', true)::json->>'email');
