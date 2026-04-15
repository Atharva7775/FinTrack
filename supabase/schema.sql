-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ai_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text])),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_email text NOT NULL DEFAULT ''::text,
  session_id uuid,
  channel text NOT NULL DEFAULT 'web'::text,
  CONSTRAINT ai_chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT ai_chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.ai_chat_sessions(id)
);
CREATE TABLE public.ai_chat_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_email text NOT NULL DEFAULT ''::text,
  name text NOT NULL DEFAULT 'New Chat'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_chat_sessions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.app_settings (
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  user_email text NOT NULL DEFAULT ''::text,
  CONSTRAINT app_settings_pkey PRIMARY KEY (key, user_email)
);
CREATE TABLE public.budget_month_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  category text NOT NULL,
  month text NOT NULL,
  limit_amount numeric NOT NULL,
  spent numeric NOT NULL,
  rollover_to_next numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT budget_month_snapshots_pkey PRIMARY KEY (id)
);
CREATE TABLE public.budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  category text NOT NULL,
  type text NOT NULL DEFAULT 'percentage'::text,
  percentage numeric,
  fixed_amount numeric,
  rollover_balance numeric NOT NULL DEFAULT 0,
  alert_threshold integer NOT NULL DEFAULT 80,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  month text NOT NULL DEFAULT ''::text,
  CONSTRAINT budgets_pkey PRIMARY KEY (id)
);
CREATE TABLE public.goal_contributions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  goal_id text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT goal_contributions_pkey PRIMARY KEY (id),
  CONSTRAINT goal_contributions_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id)
);
CREATE TABLE public.goals (
  id text NOT NULL,
  title text NOT NULL,
  target_amount numeric NOT NULL CHECK (target_amount > 0::numeric),
  current_amount numeric NOT NULL DEFAULT 0 CHECK (current_amount >= 0::numeric),
  deadline date NOT NULL,
  monthly_contribution numeric NOT NULL DEFAULT 0 CHECK (monthly_contribution >= 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_email text NOT NULL DEFAULT ''::text,
  CONSTRAINT goals_pkey PRIMARY KEY (id)
);
CREATE TABLE public.transactions (
  id text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['income'::text, 'expense'::text])),
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  category text NOT NULL,
  date date NOT NULL,
  note text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_splitwise boolean DEFAULT false,
  splitwise_id bigint,
  original_currency text,
  original_amount numeric,
  usd_amount numeric,
  is_pending boolean DEFAULT false,
  user_email text NOT NULL DEFAULT ''::text,
  source text NOT NULL DEFAULT 'manual'::text,
  CONSTRAINT transactions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_onboarding (
  user_email text NOT NULL,
  has_onboarded boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  CONSTRAINT user_onboarding_pkey PRIMARY KEY (user_email)
);