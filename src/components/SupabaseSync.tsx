import { useEffect, useRef } from "react";
import { useFinanceStore } from "@/store/financeStore";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/lib/supabase";
import { fetchFromSupabase, persistToSupabase } from "@/lib/supabaseSync";

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

    if (!getSupabase()) return;

    const userEmail = user.email;
    isHydratedRef.current = false;

    (async () => {
      const data = await fetchFromSupabase(userEmail);
      if (data) {
        // If this user has no data yet, seed from the in-memory defaults
        if (data.transactions.length === 0 && data.goals.length === 0 && !data.splitwiseKey) {
          const state = useFinanceStore.getState();
          persistToSupabase(userEmail, {
            transactions: state.transactions,
            goals: state.goals,
            savingsBalance: state.savingsBalance,
            splitwiseKey: state.splitwiseKey,
            splitwiseLastSync: state.splitwiseLastSync,
            splitwiseBalances: state.splitwiseBalances,
            viewMode: state.viewMode,
          });
          isHydratedRef.current = true;
        } else {
          useFinanceStore.getState().hydrate(data);
          isHydratedRef.current = true;
        }
      }
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
