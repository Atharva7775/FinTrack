-- Run this in the Supabase SQL Editor to add the new columns
ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS is_splitwise BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS splitwise_id BIGINT,
  ADD COLUMN IF NOT EXISTS original_currency TEXT,
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS usd_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS is_pending BOOLEAN DEFAULT FALSE;
