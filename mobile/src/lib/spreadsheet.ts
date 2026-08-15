import type { Transaction } from '@fintrack/shared-types';

export interface SpreadsheetRow {
  date: string;
  description: string;
  amount: number;
  type: Transaction['type'];
  category: Transaction['category'];
  note: string;
}

function normalizeCategory(description: string): Transaction['category'] {
  const lower = description.toLowerCase();
  if (lower.includes('taxi') || lower.includes('uber') || lower.includes('ride')) return 'Travel';
  if (lower.includes('grocery') || lower.includes('lunch') || lower.includes('coffee') || lower.includes('restaurant')) return 'Food';
  if (lower.includes('netflix') || lower.includes('spotify') || lower.includes('movie')) return 'Subscriptions';
  if (lower.includes('rent') || lower.includes('house')) return 'Rent';
  if (lower.includes('electric') || lower.includes('water') || lower.includes('utility')) return 'Utilities';
  if (lower.includes('salary') || lower.includes('pay')) return 'Salary';
  return 'Other';
}

export function parseCsvTransactions(csv: string): SpreadsheetRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];

  return lines.slice(1).map((line) => {
    const [date, description, amountText] = line.split(',');
    const amount = Number.parseFloat(amountText ?? '0');
    const normalizedAmount = Number.isFinite(amount) ? Math.abs(amount) : 0;

    return {
      date: date?.trim() || new Date().toISOString().slice(0, 10),
      description: description?.trim() || 'Imported transaction',
      amount: normalizedAmount,
      type: 'expense',
      category: normalizeCategory(description ?? ''),
      note: description?.trim() || 'Imported transaction',
    };
  });
}
