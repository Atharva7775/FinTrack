import { useEffect, useRef } from "react";
import { getSupabase } from "@/lib/supabase";
import { useFinanceStore } from "@/store/financeStore";
import type { Transaction } from "@/store/financeStore";

/**
 * Subscribes to Supabase Realtime for this user's transactions.
 * When the Telegram bot inserts a new transaction (source='telegram_bot'),
 * it is immediately added to the local Zustand store without a full reload.
 *
 * Attach this hook in AppLayout so it runs on every page.
 */
export function useRealtimeSync(userEmail: string | null | undefined) {
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabase>>["channel"]> | null>(null);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userEmail) return;

    // Clean up any previous channel before creating a new one
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`realtime_transactions_${userEmail}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `user_email=eq.${userEmail}`,
        },
        (payload) => {
          const r = payload.new as Record<string, unknown>;
          const source = String(r.source ?? "manual");
          // Keep web store in sync with out-of-band sources (bot + mobile).
          if (source !== "telegram_bot" && source !== "mobile") return;

          const tx: Transaction = {
            id: String(r.id),
            type: String(r.type) as Transaction["type"],
            amount: Number(r.amount),
            category: String(r.category) as Transaction["category"],
            date: String(r.date),
            note: String(r.note ?? ""),
            originalCurrency: r.original_currency != null ? String(r.original_currency) : undefined,
            originalAmount: r.original_amount != null ? Number(r.original_amount) : undefined,
            usdAmount: r.usd_amount != null ? Number(r.usd_amount) : undefined,
            isPending: Boolean(r.is_pending ?? false),
            source,
          };

          useFinanceStore.setState((state) => {
            const idx = state.transactions.findIndex((t) => t.id === tx.id);
            if (idx >= 0) {
              const next = [...state.transactions];
              next[idx] = { ...next[idx], ...tx };
              return { transactions: next };
            }
            return { transactions: [tx, ...state.transactions] };
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `user_email=eq.${userEmail}`,
        },
        (payload) => {
          const r = payload.new as Record<string, unknown>;
          const source = String(r.source ?? "manual");
          if (source !== "telegram_bot" && source !== "mobile") return;
          updateTransaction(String(r.id), {
            amount: Number(r.amount),
            category: String(r.category) as Transaction["category"],
            date: String(r.date),
            note: String(r.note ?? ""),
            source,
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userEmail, updateTransaction]);
}
