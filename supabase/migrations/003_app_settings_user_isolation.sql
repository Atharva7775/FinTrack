-- Migration 003: Add user_email isolation to app_settings
-- Previously app_settings used email-prefixed keys (e.g. "user@x.com:savings_balance")
-- for per-user isolation. This migration adds a proper user_email column,
-- migrates existing data, and changes the primary key to (key, user_email)
-- so different users can share the same key name without collision.

-- Step 1: Add user_email column (existing rows default to empty string)
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS user_email text NOT NULL DEFAULT '';

-- Step 2: Populate user_email from the email prefix in existing keys
--         e.g. "atharva@gmail.com:savings_balance" -> user_email = "atharva@gmail.com"
--         Only rows whose key contains both '@' and ':' (i.e. email-prefixed) are updated.
UPDATE public.app_settings
SET user_email = split_part(key, ':', 1)
WHERE key LIKE '%@%:%';

-- Step 3: Drop the old single-column primary key BEFORE simplifying key values
--         (needed because simplifying keys creates duplicates across users)
ALTER TABLE public.app_settings DROP CONSTRAINT app_settings_pkey;

-- Step 4: Simplify key values — remove the email prefix
--         e.g. "atharva@gmail.com:savings_balance" -> "savings_balance"
UPDATE public.app_settings
SET key = split_part(key, ':', 2)
WHERE key LIKE '%@%:%';

-- Step 5: Add composite primary key (key, user_email)
--         This allows different users to have rows with the same key name.
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key, user_email);

-- Step 6: Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_user_email ON public.app_settings(user_email);
