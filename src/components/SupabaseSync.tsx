import { useEffect, useRef } from "react";
import { useFinanceStore } from "@/store/financeStore";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/lib/supabase";
import { fetchFromSupabase, persistToSupabase, fetchOnboardingStatus } from "@/lib/supabaseSync";
import { SEED_TRANSACTIONS } from "@/lib/seedData";

const PERSIST_DEBOUNCE_MS = 1500;

/**
 * If Supabase env is set: on mount (or when the logged-in user changes) loads
 * that user's data from DB into the store, then persists changes after a debounce.
 * Clears the store when no user is logged in so data never bleeds between accounts.
 */
export function SupabaseSync() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHydratedRef = useRef(false);
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    // Wait until auth is resolved
    if (authLoading) return;

    // No user: clear the store so nothing appears on screen
    if (!user) {
      useFinanceStore.getState().clearStore();
      isHydratedRef.current = false;
      return;
    }

    // Without Supabase: load seed data and skip onboarding
    if (!getSupabase()) {
      useFinanceStore.getState().hydrate({
        transactions: SEED_TRANSACTIONS,
        goals: [],
        savingsBalance: 0,
        splitwiseKey: null,
        splitwiseLastSync: null,
        splitwiseBalances: null,
        viewMode: "personal",
      });
      useFinanceStore.getState().setHasOnboarded(true);
      useFinanceStore.getState().setIsHydrated(true);
      isHydratedRef.current = true;
      return;
    }

    const userEmail = user.email;
    isHydratedRef.current = false;

    (async () => {
      const [data, hasOnboarded] = await Promise.all([
        fetchFromSupabase(userEmail),
        fetchOnboardingStatus(userEmail),
      ]);

      if (data) {
        if (data.transactions.length > 0 || data.goals.length > 0 || data.splitwiseKey) {
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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        persistToSupabase(userEmail, {
          transactions: state.transactions,
          goals: state.goals,
          savingsBalance: state.savingsBalance,
          splitwiseKey: state.splitwiseKey,
          splitwiseLastSync: state.splitwiseLastSync,
          splitwiseBalances: state.splitwiseBalances,
          viewMode: state.viewMode,
          budgetSplit: state.budgetSplit,
          budgets: state.budgets,
        });
      }, PERSIST_DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [user, authLoading]);

  return null;
}
