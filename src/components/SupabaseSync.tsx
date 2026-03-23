import { useEffect, useRef } from "react";
import { useFinanceStore } from "@/store/financeStore";
import { getSupabase } from "@/lib/supabase";
import { fetchFromSupabase, persistToSupabase } from "@/lib/supabaseSync";

const PERSIST_DEBOUNCE_MS = 1500;

/**
 * If Supabase env is set: on mount loads data from DB into the store, then subscribes
 * to store changes and persists to DB after a short debounce.
 */
export function SupabaseSync() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHydratedRef = useRef(false);

  useEffect(() => {
    if (!getSupabase()) return;

    (async () => {
      const data = await fetchFromSupabase();
      if (data) {
        // If Supabase is completely empty, initialize it with the app's default seed data instead of wiping the UI.
        if (data.transactions.length === 0 && data.goals.length === 0 && !data.splitwiseKey) {
          const state = useFinanceStore.getState();
          persistToSupabase({
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
        persistToSupabase({
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
  }, []);

  return null;
}
