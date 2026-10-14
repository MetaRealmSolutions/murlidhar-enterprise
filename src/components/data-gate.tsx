import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { useSyncState } from '../data/db/database';
import { Btn, T, useTheme } from './controls';

/** Full-screen spinner (used while Firebase restores the session). */
export function LoadingScreen({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: t.bg }}>
      <ActivityIndicator color={t.accent} />
      {label ? (
        <T size={14} muted>
          {label}
        </T>
      ) : null}
    </View>
  );
}

/** Shows the app only once the signed-in user's Firestore data has loaded; otherwise a loading or error state. */
export function DataGate({ children }: { children: ReactNode }) {
  const t = useTheme();
  const sync = useSyncState();
  const { signOut } = useAuth();

  if (sync.status === 'error') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: t.bg }}>
        <T size={18} weight="600">
          Unable to load your data
        </T>
        <T size={14} muted style={{ textAlign: 'center' }}>
          {sync.error}
        </T>
        <Btn title="Sign out" variant="secondary" onPress={signOut} />
      </View>
    );
  }
  if (sync.status !== 'ready') return <LoadingScreen label="Loading your data…" />;
  return <>{children}</>;
}
