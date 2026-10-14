import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';

import { AuthProvider, useAuth } from '../auth/AuthContext';
import { LoadingScreen } from '../components/data-gate';

// Role boundary, derived from the signed-in Firebase user's Firestore profile: owners and employees get the
// business app (an employee only the pages their permissions allow), salesmen get their own area, and nobody reaches either without signing in.
// Navigating to a route outside your role is redirected.
function RootStack() {
  const { user, loading } = useAuth();
  // Wait for Firebase to restore the session so a signed-in user never sees the login screen flash.
  if (loading) return <LoadingScreen />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={user?.role === 'owner' || user?.role === 'employee'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={user?.role === 'salesman'}>
        <Stack.Screen name="salesman" />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <Head>
        <title>Murlidhar Enterprise</title>
      </Head>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </ThemeProvider>
  );
}
