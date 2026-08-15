import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { clearAuthState, loadAuthState, saveAuthState, type MobileAuthState } from '../lib/auth';

interface AuthScreenProps {
  onAuthenticated: (state: MobileAuthState) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('demo@fintrack.app');

  const signInDemo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        throw new Error('Enter a valid email to continue');
      }

      const state = {
        user: {
          name: normalizedEmail.split('@')[0].replace(/[._]/g, ' '),
          email: normalizedEmail,
          picture: undefined,
        },
        idToken: 'demo-google-id-token',
      };
      await saveAuthState(state);
      onAuthenticated(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  }, [email, onAuthenticated]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const state = await loadAuthState();
        if (!active) return;
        if (state) {
          onAuthenticated(state);
        } else {
          setLoading(false);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to restore auth state');
        setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [onAuthenticated]);

  const helperText = useMemo(() => {
    return 'Sign in with a demo account for now. This is the first mobile auth step before the real Google/OAuth integration is added.';
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.subtitle}>Restoring FinTrack mobile session…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Welcome to FinTrack Mobile</Text>
        <Text style={styles.body}>{helperText}</Text>
        <Text style={styles.label}>Email (use the same as web)</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor="#64748b"
        />
        <Pressable style={styles.button} onPress={() => void signInDemo()}>
          <Text style={styles.buttonText}>Continue with demo sign in</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={() => void clearAuthState().catch(() => undefined)}>
          <Text style={styles.link}>Clear saved session</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 24,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
  },
  body: {
    color: '#cbd5e1',
    lineHeight: 20,
  },
  label: {
    color: '#e2e8f0',
    fontWeight: '600',
    marginTop: 8,
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
  subtitle: {
    marginTop: 12,
    color: '#cbd5e1',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
  link: {
    color: '#93c5fd',
    textAlign: 'center',
    marginTop: 8,
  },
  error: {
    color: '#fda4af',
    marginTop: 4,
  },
});
