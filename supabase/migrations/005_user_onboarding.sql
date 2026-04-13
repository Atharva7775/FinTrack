-- Migration 005: User Onboarding State
-- Tracks whether each user has completed the first-time onboarding flow.
-- Existing users who already have transactions are handled in application logic.

CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_email text NOT NULL,
  has_onboarded boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  CONSTRAINT user_onboarding_pkey PRIMARY KEY (user_email)
);

-- Index for fast per-user lookup
CREATE INDEX IF NOT EXISTS idx_user_onboarding_email
  ON public.user_onboarding (user_email);
