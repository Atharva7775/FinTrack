import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Current month as YYYY-MM (e.g. "2026-02") */
export function getCurrentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Last N months including current: [{ key: "2025-11", label: "Nov" }, ...] */
export function getLastNMonths(n: number): { key: string; label: string }[] {
  const now = new Date();
  const result: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "short" });
    result.push({ key, label });
  }
  return result;
}

/** Human-readable current month (e.g. "February 2026") */
export function getCurrentMonthLabel(): string {
  return new Date().toLocaleString("default", { month: "long", year: "numeric" });
}

/** Previous month as YYYY-MM */
export function getPrevMonthKey(): string {
  const d = new Date();
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

/** Human-readable label for a YYYY-MM key (e.g. "Feb 2026") */
export function getMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("default", { month: "short", year: "numeric" });
}

/** List of month keys from firstTransactionMonth through current (or last 12 months if no data) */
export function getAvailableMonthKeys(transactionDates: string[]): string[] {
  const now = new Date();
  const currentKey = getCurrentMonthKey();
  if (transactionDates.length === 0) {
    const keys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return keys;
  }
  const first = transactionDates.reduce((a, b) => (a < b ? a : b)).slice(0, 7);
  const keys: string[] = [];
  const [fy, fm] = first.split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return keys;
}

/** Last N months ending at a given YYYY-MM */
export function getLastNMonthsEndingAt(endMonthKey: string, n: number): { key: string; label: string }[] {
  const [y, m] = endMonthKey.split("-").map(Number);
  const endDate = new Date(y, m - 1, 1);
  const result: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    result.push({ key, label: d.toLocaleString("default", { month: "short" }) });
  }
  return result;
}
