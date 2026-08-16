import { useEffect, useRef } from "react";
import { useFinanceStore } from "@/store/financeStore";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { fetchFromSupabase, persistToSupabase, fetchOnboardingStatus } from "@/lib/supabaseSync";
import { SEED_TRANSACTIONS } from "@/lib/seedData";
import type { HydratePayload } from "@/store/financeStore";

const PERSIST_DEBOUNCE_MS = 1500;
const LOCAL_FALLBACK_KEY_PREFIX = "fintrack_local_state_v1";

function localFallbackKey(userEmail: string) {
  return `${LOCAL_FALLBACK_KEY_PREFIX}:${userEmail.toLowerCase()}`;
}

function readLocalFallback(userEmail: string): HydratePayload | null {
  try {
    const raw = localStorage.getItem(localFallbackKey(userEmail));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HydratePayload>;
    if (!Array.isArray(parsed.transactions) || !Array.isArray(parsed.goals)) return null;
    return {
      transactions: parsed.transactions,
      goals: parsed.goals,
      savingsBalance: Number(parsed.savingsBalance ?? 0),
      budgetSplit: Array.isArray(parsed.budgetSplit) && parsed.budgetSplit.length === 3
        ? (parsed.budgetSplit as [number, number, number])
        : [50, 30, 20],
      budgets: Array.isArray(parsed.budgets) ? parsed.budgets : [],
    };
  } catch {
    return null;
  }
}

function writeLocalFallback(userEmail: string, payload: HydratePayload) {
  try {
    localStorage.setItem(localFallbackKey(userEmail), JSON.stringify(payload));
  } catch {
    // Ignore storage quota or serialization errors.
  }
}

/**
 * If Supabase is configured AND this sign-in has a verified Google ID token:
 * on mount (or when the logged-in user changes) loads that user's data from
 * the server into the store, then persists changes after a debounce.
 *
 * Manual/demo sign-ins have no verifiable token, so the server (which now
 * requires one for every write — see server/routes/*.ts) can't authenticate
 * them. They fall back to the same local-only path used when Supabase isn't
 * configured at all: data still persists, just to this device/browser only.
 *
 * Clears the store when no user is logged in so data never bleeds between accounts.
 */
export function SupabaseSync() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHydratedRef = useRef(false);
  const latestPayloadRef = useRef<HydratePayload | null>(null);
  const { user, idToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    // Wait until auth is resolved
    if (authLoading) return;

    // No user: clear the store so nothing appears on screen
    if (!user) {
      useFinanceStore.getState().clearStore();
      isHydratedRef.current = false;
      return;
    }

    // No server-verifiable identity (Supabase not configured, or a manual/demo
    // sign-in with no real Google token): load local fallback state (or seed
    // data) and persist locally only.
    if (!isSupabaseConfigured() || !idToken) {
      const userEmail = user.email;
      const local = readLocalFallback(userEmail);
      useFinanceStore.getState().hydrate(
        local ?? {
          transactions: SEED_TRANSACTIONS,
          goals: [],
          savingsBalance: 0,
          budgetSplit: [50, 30, 20],
          budgets: [],
        }
      );
      useFinanceStore.getState().setHasOnboarded(true);
      useFinanceStore.getState().setIsHydrated(true);
      isHydratedRef.current = true;

      const persistLocalNow = () => {
        const payload = latestPayloadRef.current;
        if (!payload) return;
        writeLocalFallback(userEmail, payload);
      };

      const unsub = useFinanceStore.subscribe((state) => {
        if (!isHydratedRef.current) return;
        latestPayloadRef.current = {
          transactions: state.transactions,
          goals: state.goals,
          savingsBalance: state.savingsBalance,
          budgetSplit: state.budgetSplit,
          budgets: state.budgets,
        };
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          persistLocalNow();
        }, PERSIST_DEBOUNCE_MS);
      });

      return () => {
        unsub();
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        persistLocalNow();
      };
    }

    isHydratedRef.current = false;
    const persistRemoteNow = () => {
      const payload = latestPayloadRef.current;
      if (!payload) return;
      void persistToSupabase(idToken, payload);
    };

    (async () => {
      const [data, hasOnboarded] = await Promise.all([
        fetchFromSupabase(idToken),
        fetchOnboardingStatus(idToken),
      ]);

      if (data) {
        if (data.transactions.length > 0 || data.goals.length > 0 || (data.budgets?.length ?? 0) > 0) {
          // Existing user with data — hydrate and mark as onboarded
          useFinanceStore.getState().hydrate(data);
          useFinanceStore.getState().setHasOnboarded(true);
        } else if (hasOnboarded) {
          // User completed/skipped onboarding before but has no transactions yet
          useFinanceStore.getState().hydrate(data);
          useFinanceStore.getState().setHasOnboarded(true);
        } else {
          // Brand-new user — show onboarding
          useFinanceStore.getState().setHasOnboarded(false);
        }
      }

      useFinanceStore.getState().setIsHydrated(true);
      isHydratedRef.current = true;
    })();

    const unsub = useFinanceStore.subscribe((state) => {
      if (!isHydratedRef.current) return;
      latestPayloadRef.current = {
        transactions: state.transactions,
        goals: state.goals,
        savingsBalance: state.savingsBalance,
        budgetSplit: state.budgetSplit,
        budgets: state.budgets,
      };
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        persistRemoteNow();
      }, PERSIST_DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Best-effort flush so closing/reloading right after edits does not lose changes.
      persistRemoteNow();
    };
  }, [user, idToken, authLoading]);

  return null;
}
