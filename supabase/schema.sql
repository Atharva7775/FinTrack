-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ai_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text])),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_chat_messages_pkey PRIMARY KEY (id)
);
CREATE TABLE public.app_settings (
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_pkey PRIMARY KEY (key)
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
  CONSTRAINT goals_pkey PRIMARY KEY (id)
);
CREATE TABLE public.transactions (
  id text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['income'::text, 'expense'::text])),
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  category text NOT NULL,
  date date NOT NULL,
  note text NOT NULL DEFAULT ''::text,
  is_splitwise boolean DEFAULT FALSE,
  splitwise_id bigint,
  original_currency text,
  original_amount numeric,
  usd_amount numeric,
  is_pending boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id)
);