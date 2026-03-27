-- Migration 002: User-email data isolation
-- Each row in transactions, goals, and ai_chat_messages is scoped to a user_email.
-- New table ai_chat_sessions groups chat messages into named sessions per user.

-- 1. Add user_email to transactions (existing rows get empty string, not visible to any user)
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS user_email text NOT NULL DEFAULT '';

-- 2. Add user_email to goals
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS user_email text NOT NULL DEFAULT '';

-- 3. Add user_email + session_id to ai_chat_messages
ALTER TABLE public.ai_chat_messages
  ADD COLUMN IF NOT EXISTS user_email text NOT NULL DEFAULT '';

ALTER TABLE public.ai_chat_messages
  ADD COLUMN IF NOT EXISTS session_id uuid;

-- 4. Create ai_chat_sessions table
CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_email text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT 'New Chat',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_chat_sessions_pkey PRIMARY KEY (id)
);

-- 5. Foreign key from ai_chat_messages.session_id -> ai_chat_sessions.id
--    CASCADE delete so removing a session removes its messages.
ALTER TABLE public.ai_chat_messages
  ADD CONSTRAINT ai_chat_messages_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE;

-- 6. Indexes for fast per-user queries
CREATE INDEX IF NOT EXISTS idx_transactions_user_email    ON public.transactions(user_email);
CREATE INDEX IF NOT EXISTS idx_goals_user_email           ON public.goals(user_email);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id  ON public.ai_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_email  ON public.ai_chat_sessions(user_email);
