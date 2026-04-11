-- Migration 004: Telegram Bot Support
-- Adds source column to transactions, channel to ai_chat_messages,
-- enables Realtime, and sets up indexes for Telegram linking.

-- Step 1: Add source column to transactions (identifies bot-added vs manual)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Step 2: Add channel column to ai_chat_messages (web vs telegram)
ALTER TABLE public.ai_chat_messages
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'web';

-- Step 3: Add user_email to ai_chat_messages (needed for Realtime filter)
ALTER TABLE public.ai_chat_messages
  ADD COLUMN IF NOT EXISTS user_email text;

-- Step 4: Index for fast Telegram ID → user_email lookups in app_settings
CREATE INDEX IF NOT EXISTS idx_app_settings_telegram
  ON public.app_settings (key)
  WHERE key LIKE 'telegram_user_%';

-- Step 5: Index for fast source filter on transactions (Realtime queries)
CREATE INDEX IF NOT EXISTS idx_transactions_source
  ON public.transactions (source, user_email);

-- Step 6: Enable Realtime on the tables the web app will subscribe to
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.goals;
