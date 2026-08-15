import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { AuthScreen } from './src/components/AuthScreen';
import { HomeScreen } from './src/components/HomeScreen';
import { clearAuthState, loadAuthState, type MobileAuthState } from './src/lib/auth';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [authState, setAuthState] = useState<MobileAuthState | null>(null);
  const [isBooted, setIsBooted] = useState(false);

  const handleAuthenticated = useCallback((state: MobileAuthState) => {
    setAuthState(state);
    setIsBooted(true);
  }, []);

  const handleSignOut = useCallback(async () => {
    await clearAuthState();
    setAuthState(null);
    setIsBooted(true);
  }, []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const state = await loadAuthState();
      if (!active) return;
      setAuthState(state);
      setIsBooted(true);
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}> 
      {!isBooted ? null : authState ? (
        <HomeScreen auth={authState} onSignOut={handleSignOut} />
      ) : (
        <AuthScreen onAuthenticated={handleAuthenticated} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
});

export default App;
