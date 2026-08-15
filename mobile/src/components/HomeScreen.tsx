import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { MobileAuthState } from '../lib/auth';
import type { Transaction } from '@fintrack/shared-types';
import { buildTransactionPayload, fetchTransactions, submitTransaction } from '../lib/transactions';
import { parseCsvTransactions } from '../lib/spreadsheet';
import { createPendingTransactionDraft, type PendingTransactionDraft } from '../lib/pendingTransactions';
import { PendingTransactionsScreen } from './PendingTransactionsScreen';

interface HomeScreenProps {
  auth: MobileAuthState;
  onSignOut: () => void;
}

export function HomeScreen({ auth, onSignOut }: HomeScreenProps) {
  const [amount, setAmount] = useState('24.50');
  const [note, setNote] = useState('Lunch');
  const [csvText, setCsvText] = useState('date,description,amount\n2026-08-08,Lunch,24.50\n2026-08-08,Taxi,-18.00');
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingTransactionDraft[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [syncedTransactions, setSyncedTransactions] = useState<Transaction[]>([]);
  const [syncing, setSyncing] = useState(false);

  const syncTransactions = useCallback(async () => {
    try {
      setSyncing(true);
      const rows = await fetchTransactions(auth.user.email, auth.idToken);
      setSyncedTransactions(rows);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to sync transactions');
    } finally {
      setSyncing(false);
    }
  }, [auth.user.email, auth.idToken]);

  useEffect(() => {
    void syncTransactions();
    // Keep mobile view in sync with web updates for the same user.
    const timer = setInterval(() => {
      void syncTransactions();
    }, 10000);

    return () => clearInterval(timer);
  }, [syncTransactions]);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setStatus(null);
      const payload = buildTransactionPayload(
        {
          amount: Number(amount),
          type: 'expense',
          category: 'Food',
          note,
          date: new Date().toISOString().slice(0, 10),
        },
        auth.user.email
      );
      await submitTransaction(payload, auth.idToken);
      await syncTransactions();
      setStatus('Transaction submitted to FinTrack');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCsvImport = async () => {
    try {
      setSubmitting(true);
      setStatus(null);
      const rows = parseCsvTransactions(csvText);
      if (!rows.length) {
        setStatus('No rows could be parsed from the CSV input');
        return;
      }

      const nextItems = rows.map((row) =>
        createPendingTransactionDraft({
          amount: row.amount,
          type: row.type,
          category: row.category,
          note: row.note,
          date: row.date,
        })
      );
      setPendingItems(nextItems);
      setReviewOpen(true);
      setStatus(`Prepared ${nextItems.length} pending transactions for review`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAll = async () => {
    try {
      setSubmitting(true);
      setStatus(null);
      await Promise.all(
        pendingItems.map((item) =>
          submitTransaction(
            buildTransactionPayload(
              {
                amount: item.amount,
                type: item.type,
                category: item.category,
                note: item.note,
                date: item.date,
              },
              auth.user.email
            ),
            auth.idToken
          )
        )
      );
      await syncTransactions();
      setPendingItems([]);
      setReviewOpen(false);
      setStatus(`Submitted ${pendingItems.length} items to FinTrack`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (reviewOpen) {
    return (
      <PendingTransactionsScreen
        items={pendingItems}
        onBack={() => setReviewOpen(false)}
        onSubmitAll={handleSubmitAll}
        submitting={submitting}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>FinTrack Mobile</Text>
        <Text style={styles.title}>Welcome back, {auth.user.name ?? auth.user.email}</Text>
        <Text style={styles.body}>The next step is to connect your capture sources, starting with transaction import and review.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          <Text style={styles.label}>Note</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="What did you spend on?"
          />
          <Pressable style={styles.primaryButton} onPress={() => void handleSubmit()}>
            {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>Send to FinTrack</Text>}
          </Pressable>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Spreadsheet import (CSV)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={csvText}
            onChangeText={setCsvText}
            multiline
            placeholder="date,description,amount"
          />
          <Pressable style={styles.secondaryButton} onPress={() => void handleCsvImport()}>
            {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.secondaryButtonText}>Import pending rows</Text>}
          </Pressable>
        </View>

        <View style={styles.form}>
          <View style={styles.syncHeader}>
            <Text style={styles.label}>Synced transactions ({syncedTransactions.length})</Text>
            <Pressable style={styles.miniButton} onPress={() => void syncTransactions()}>
              <Text style={styles.miniButtonText}>{syncing ? 'Syncing…' : 'Refresh'}</Text>
            </Pressable>
          </View>
          {syncedTransactions.length === 0 ? (
            <Text style={styles.syncEmpty}>No transactions synced yet for this email.</Text>
          ) : (
            <View style={styles.syncList}>
              {syncedTransactions.slice(0, 5).map((tx) => (
                <View key={tx.id} style={styles.syncRow}>
                  <Text style={styles.syncPrimary}>{tx.category} • ${tx.amount.toFixed(2)}</Text>
                  <Text style={styles.syncSecondary}>{tx.date} • {tx.note || 'No note'} • {tx.source ?? 'manual'}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {status ? <Text style={styles.status}>{status}</Text> : null}

        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={onSignOut}>
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#020617',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  eyebrow: {
    color: '#93c5fd',
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: '700',
  },
  body: {
    color: '#cbd5e1',
    lineHeight: 20,
  },
  form: {
    gap: 8,
    marginTop: 8,
  },
  label: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#1f2937',
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 12,
    color: 'white',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniButton: {
    borderColor: '#475569',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  miniButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  syncEmpty: {
    color: '#94a3b8',
    fontSize: 13,
  },
  syncList: {
    gap: 8,
  },
  syncRow: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 10,
  },
  syncPrimary: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  syncSecondary: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  secondaryButton: {
    borderColor: '#475569',
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  status: {
    marginTop: 8,
    color: '#bfdbfe',
  },
});
