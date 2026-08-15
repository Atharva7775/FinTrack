import { Platform } from 'react-native';
import type { Transaction } from '@fintrack/shared-types';

export interface MobileTransactionDraft {
  amount: number;
  type: Transaction['type'];
  category: Transaction['category'];
  note?: string;
  date: string;
}

export interface MobileTransactionPayload extends MobileTransactionDraft {
  id: string;
  user_email: string;
  source: string;
  isPending: boolean;
}

interface ApiTransactionRow {
  id: string;
  type: Transaction['type'];
  amount: number;
  category: Transaction['category'];
  date: string;
  note?: string | null;
  source?: string | null;
  is_pending?: boolean | null;
  original_currency?: string | null;
  original_amount?: number | null;
  usd_amount?: number | null;
}

const DEV_DEMO_TOKEN = 'demo-google-id-token';

export function getApiBaseUrl(): string {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }

  return 'http://localhost:3001';
}

export function buildTransactionPayload(
  draft: MobileTransactionDraft,
  userEmail: string
): MobileTransactionPayload {
  return {
    id: `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_email: userEmail,
    amount: draft.amount,
    type: draft.type,
    category: draft.category,
    note: draft.note ?? '',
    date: draft.date,
    source: 'mobile',
    isPending: true,
  };
}

function buildAuthHeaders(idToken: string | undefined, userEmail: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  // Development bridge: backend can trust this header only with the demo token.
  if (idToken === DEV_DEMO_TOKEN) {
    headers['x-dev-user-email'] = userEmail;
  }

  return headers;
}

export async function submitTransaction(payload: MobileTransactionPayload, idToken?: string) {
  const headers = buildAuthHeaders(idToken, payload.user_email);
  const apiPayload = {
    ...payload,
    is_pending: payload.isPending,
  };

  const response = await fetch(`${getApiBaseUrl()}/api/transactions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(apiPayload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to submit transaction');
  }

  return response.json();
}

export async function fetchTransactions(userEmail: string, idToken?: string): Promise<Transaction[]> {
  const headers = buildAuthHeaders(idToken, userEmail);
  const url = `${getApiBaseUrl()}/api/transactions?user_email=${encodeURIComponent(userEmail)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Failed to fetch transactions');
  }

  const rows = (await response.json()) as ApiTransactionRow[];
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    category: row.category,
    date: row.date,
    note: row.note ?? '',
    source: row.source ?? undefined,
    isPending: row.is_pending ?? false,
    originalCurrency: row.original_currency ?? undefined,
    originalAmount: row.original_amount ?? undefined,
    usdAmount: row.usd_amount ?? undefined,
  }));
}
