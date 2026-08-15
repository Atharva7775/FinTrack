import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PendingTransactionDraft } from '../lib/pendingTransactions';

interface PendingTransactionsScreenProps {
  items: PendingTransactionDraft[];
  onBack: () => void;
  onSubmitAll: () => Promise<void>;
  submitting: boolean;
}

export function PendingTransactionsScreen({ items, onBack, onSubmitAll, submitting }: PendingTransactionsScreenProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Pending review</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No pending items</Text>
          <Text style={styles.emptyBody}>Imported rows will appear here before they are submitted.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.cardTitle}>{item.note}</Text>
              <Text style={styles.cardMeta}>${item.amount.toFixed(2)} • {item.category} • {item.date}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable style={styles.submitButton} onPress={() => void onSubmitAll()}>
        <Text style={styles.submitButtonText}>{submitting ? 'Submitting…' : `Submit ${items.length} items`}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    backgroundColor: '#020617',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  back: {
    color: '#93c5fd',
    fontWeight: '600',
  },
  title: {
    color: 'white',
    fontSize: 22,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 24,
  },
  emptyTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyBody: {
    color: '#cbd5e1',
    marginTop: 8,
    textAlign: 'center',
  },
  list: {
    gap: 10,
    flex: 1,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    borderColor: '#1f2937',
    borderWidth: 1,
  },
  cardTitle: {
    color: 'white',
    fontWeight: '700',
  },
  cardMeta: {
    color: '#94a3b8',
    marginTop: 4,
  },
  submitButton: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});
