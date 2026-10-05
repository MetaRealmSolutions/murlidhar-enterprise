import { Button, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';

export default function HomeScreen() {
  const { user, logout } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Business App</Text>
      <Text style={styles.subtitle}>
        {user?.name} ({user?.role})
      </Text>
      <Button title="Logout" onPress={logout} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 16,
  },
});
