import type { Transaction } from '@fintrack/shared-types';

export interface PendingTransactionDraft {
  id: string;
  amount: number;
  type: Transaction['type'];
  category: Transaction['category'];
  date: string;
  note: string;
  source: string;
}

export function createPendingTransactionDraft(
  draft: Omit<PendingTransactionDraft, 'id' | 'source'>
): PendingTransactionDraft {
  return {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'mobile',
    ...draft,
  };
}
