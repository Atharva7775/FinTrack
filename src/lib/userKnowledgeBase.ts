import { getSupabase } from "./supabase";
import type { Transaction } from "@/store/financeStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KBPersonalFacts {
  city?: string;
  age?: number;
  dependents?: number;
  employmentType?: string; // 'salaried' | 'freelancer' | 'business' | 'student' | 'retired'
  monthlyRent?: number;
  hasEmergencyFund?: boolean;
  hasInvestments?: boolean;
  riskTolerance?: string; // 'conservative' | 'moderate' | 'aggressive'
  primaryFinancialGoal?: string;
}

export interface KBSpendingPersonality {
  topCategories: string[];
  averageMonthlyExpenses: number;
  averageMonthlyIncome: number;
  savingsConsistency: 'consistent' | 'irregular' | 'none';
  labels: string[];
  lastDerivedAt: string;
}

export interface KBStatedGoal {
  description: string;
  mentionedDate: string;
  status: 'mentioned' | 'created' | 'dismissed';
}

export interface KBAdviceEntry {
  date: string;
  advice: string;
  followedUp?: boolean;
}

export interface KBPreferences {
  responseStyle: 'brief' | 'detailed';
  focusArea: 'saving' | 'investing' | 'debt' | 'goals' | 'general';
}

export interface KBNote {
  date: string;
  category: 'preference' | 'fact' | 'concern' | 'insight';
  note: string;
}

export interface UserKnowledgeBase {
  version: number;
  lastUpdated: string;
  personalFacts: KBPersonalFacts;
  spendingPersonality: KBSpendingPersonality;
  statedGoals: KBStatedGoal[];
  adviceHistory: KBAdviceEntry[];
  preferences: KBPreferences;
  aiNotes: KBNote[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KB_VERSION = 1;
const MAX_AI_NOTES = 20;
const MAX_ADVICE_HISTORY = 10;

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEmptyKnowledgeBase(): UserKnowledgeBase {
  return {
    version: KB_VERSION,
    lastUpdated: new Date().toISOString(),
    personalFacts: {},
    spendingPersonality: {
      topCategories: [],
      averageMonthlyExpenses: 0,
      averageMonthlyIncome: 0,
      savingsConsistency: 'none',
      labels: [],
      lastDerivedAt: '',
    },
    statedGoals: [],
    adviceHistory: [],
    preferences: {
      responseStyle: 'detailed',
      focusArea: 'general',
    },
    aiNotes: [],
  };
}

// ─── Personality Derivation ───────────────────────────────────────────────────

export function deriveSpendingPersonality(transactions: Transaction[]): KBSpendingPersonality {
  const months = Array.from(new Set(transactions.map(t => t.date.slice(0, 7)))).sort();

  if (months.length === 0) {
    return {
      topCategories: [],
      averageMonthlyExpenses: 0,
      averageMonthlyIncome: 0,
      savingsConsistency: 'none',
      labels: [],
      lastDerivedAt: new Date().toISOString(),
    };
  }

  const monthlyExpenses: Record<string, number> = {};
  const monthlyIncome: Record<string, number> = {};
  const categoryTotals: Record<string, number> = {};
  let totalExpenses = 0;

  for (const t of transactions) {
    const m = t.date.slice(0, 7);
    const amount = t.usdAmount ?? t.amount;
    if (t.type === 'expense') {
      monthlyExpenses[m] = (monthlyExpenses[m] ?? 0) + amount;
      categoryTotals[t.category] = (categoryTotals[t.category] ?? 0) + amount;
      totalExpenses += amount;
    } else {
      monthlyIncome[m] = (monthlyIncome[m] ?? 0) + amount;
    }
  }

  const numMonths = months.length;
  const avgExpenses = numMonths > 0
    ? Object.values(monthlyExpenses).reduce((a, b) => a + b, 0) / numMonths
    : 0;
  const avgIncome = numMonths > 0
    ? Object.values(monthlyIncome).reduce((a, b) => a + b, 0) / numMonths
    : 0;

  // Top 3 expense categories by total
  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  // Savings consistency: % of months with positive net savings
  const positiveMonths = months.filter(m => (monthlyIncome[m] ?? 0) > (monthlyExpenses[m] ?? 0)).length;
  const posPct = positiveMonths / numMonths;
  const savingsConsistency: KBSpendingPersonality['savingsConsistency'] =
    posPct >= 0.8 ? 'consistent' : posPct >= 0.4 ? 'irregular' : 'none';

  // Behavior labels derived from spending patterns
  const labels: string[] = [];
  const travelPct  = totalExpenses > 0 ? (categoryTotals['Travel']        ?? 0) / totalExpenses : 0;
  const foodPct    = totalExpenses > 0 ? (categoryTotals['Food']          ?? 0) / totalExpenses : 0;
  const subPct     = totalExpenses > 0 ? (categoryTotals['Subscriptions'] ?? 0) / totalExpenses : 0;
  const shopPct    = totalExpenses > 0 ? (categoryTotals['Shopping']      ?? 0) / totalExpenses : 0;
  const entPct     = totalExpenses > 0 ? (categoryTotals['Entertainment'] ?? 0) / totalExpenses : 0;
  const investAmt  = categoryTotals['Investments'] ?? 0;

  if (travelPct > 0.15)  labels.push('Frequent Traveler');
  if (foodPct > 0.25)    labels.push('Foodie');
  if (subPct > 0.08)     labels.push('Subscription Collector');
  if (shopPct > 0.15)    labels.push('Active Shopper');
  if (entPct > 0.10)     labels.push('Entertainment Spender');
  if (investAmt > 0)     labels.push('Investor');
  if (savingsConsistency === 'consistent') labels.push('Consistent Saver');
  if (savingsConsistency === 'none' && avgExpenses > avgIncome * 0.95) labels.push('Tight Budget');

  return {
    topCategories,
    averageMonthlyExpenses: Math.round(avgExpenses),
    averageMonthlyIncome: Math.round(avgIncome),
    savingsConsistency,
    labels,
    lastDerivedAt: new Date().toISOString(),
  };
}

// ─── Merge ────────────────────────────────────────────────────────────────────

export function mergeKnowledgeBaseUpdate(
  existing: UserKnowledgeBase,
  update: {
    personalFacts?: Partial<KBPersonalFacts>;
    spendingPersonality?: Partial<KBSpendingPersonality>;
    statedGoals?: Array<{ description: string; status: KBStatedGoal['status'] }>;
    adviceHistory?: Array<{ advice: string; followedUp?: boolean }>;
    preferences?: Partial<KBPreferences>;
    aiNotes?: Array<{ category: KBNote['category']; note: string }>;
  }
): UserKnowledgeBase {
  const now = new Date().toISOString();
  const merged: UserKnowledgeBase = { ...existing, lastUpdated: now };

  if (update.personalFacts && Object.keys(update.personalFacts).length > 0) {
    merged.personalFacts = { ...existing.personalFacts, ...update.personalFacts };
  }

  if (update.preferences && Object.keys(update.preferences).length > 0) {
    merged.preferences = { ...existing.preferences, ...update.preferences };
  }

  if (update.statedGoals?.length) {
    const updatedGoals = [...existing.statedGoals];
    for (const g of update.statedGoals) {
      if (!g.description) continue;
      const idx = updatedGoals.findIndex(
        eg => eg.description.toLowerCase() === g.description.toLowerCase()
      );
      if (idx >= 0) {
        updatedGoals[idx] = { ...updatedGoals[idx], status: g.status };
      } else {
        updatedGoals.push({ description: g.description, mentionedDate: now, status: g.status });
      }
    }
    merged.statedGoals = updatedGoals;
  }

  if (update.adviceHistory?.length) {
    const newEntries: KBAdviceEntry[] = update.adviceHistory
      .filter(a => a.advice)
      .map(a => ({ date: now, advice: a.advice, followedUp: a.followedUp }));
    merged.adviceHistory = [...existing.adviceHistory, ...newEntries].slice(-MAX_ADVICE_HISTORY);
  }

  if (update.aiNotes?.length) {
    const newNotes: KBNote[] = update.aiNotes
      .filter(n => n.note)
      .map(n => ({ date: now, category: n.category, note: n.note }));
    merged.aiNotes = [...existing.aiNotes, ...newNotes].slice(-MAX_AI_NOTES);
  }

  return merged;
}

// ─── Supabase I/O ─────────────────────────────────────────────────────────────

const KB_KEY = 'ai_knowledge_base';

export async function loadKnowledgeBase(userEmail: string): Promise<UserKnowledgeBase | null> {
  const supabase = getSupabase();
  if (!supabase || !userEmail) return null;

  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', KB_KEY)
      .eq('user_email', userEmail)
      .maybeSingle();

    if (error || !data) return null;
    const kb = data.value as UserKnowledgeBase;
    if (!kb || typeof kb !== 'object' || !kb.version) return null;
    return kb;
  } catch {
    return null;
  }
}

export async function saveKnowledgeBase(userEmail: string, kb: UserKnowledgeBase): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !userEmail) return;

  try {
    await supabase.from('app_settings').upsert(
      { key: KB_KEY, user_email: userEmail, value: kb, updated_at: new Date().toISOString() },
      { onConflict: 'key,user_email' }
    );
  } catch (e) {
    console.warn('FinTrack: failed to save knowledge base', e);
  }
}
