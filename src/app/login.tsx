import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { BrandLogo } from '../components/brand-logo';
import { Btn, T, TextField, useTheme } from '../components/controls';
import { BUSINESS_NAME } from '../mock/data';

// Firebase Authentication (email + password). The role is never chosen here: after sign-in the
// app reads it from the user's Firestore profile and the route guards pick the right area.
export default function LoginScreen() {
  const { signIn, accessError } = useAuth();
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    const result = await signIn(email, password);
    // On success the root layout's route guards take over once the profile has loaded.
    if (!result.ok) setError(result.error);
    setBusy(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}
      keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: 440, gap: 28 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BrandLogo height={56} />
          <T size={20} weight="600" style={{ letterSpacing: -0.3 }}>
            {BUSINESS_NAME}
          </T>
        </View>

        <View style={{ gap: 4 }}>
          <T size={30} weight="700" style={{ letterSpacing: -0.6 }}>
            Sign in
          </T>
          <T size={15} muted>
            Owners and salesmen sign in here.
          </T>
        </View>

        <View style={{ gap: 16 }}>
          <TextField
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError('');
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            placeholder="name@example.com"
            onSubmitEditing={submit}
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setError('');
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            placeholder="Password"
            error={error || accessError || undefined}
            onSubmitEditing={submit}
          />
        </View>

        <Btn title={busy ? 'Signing in…' : 'Sign in'} large fill onPress={submit} />
      </View>
    </ScrollView>
  );
}
