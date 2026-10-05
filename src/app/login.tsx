import { useState } from 'react';
import { Button, Pressable, StyleSheet, Text, View } from 'react-native';

import { FAKE_USERS, useAuth } from '../auth/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select user</Text>
      {FAKE_USERS.map((u) => (
        <Pressable
          key={u.id}
          onPress={() => setSelectedId(u.id)}
          style={[styles.option, selectedId === u.id && styles.optionSelected]}>
          <Text style={styles.optionText}>{u.name}</Text>
        </Pressable>
      ))}
      <Button title="Login" disabled={!selectedId} onPress={() => selectedId && login(selectedId)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 8 },
  option: {
    width: '100%',
    maxWidth: 320,
    padding: 14,
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    alignItems: 'center',
  },
  optionSelected: { borderColor: '#007AFF', backgroundColor: '#007AFF22' },
  optionText: { fontSize: 16 },
});
