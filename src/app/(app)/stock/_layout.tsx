import { Stack } from 'expo-router';

import { RequireAccess } from '../../../components/require-access';

export default function StockLayout() {
  return (
    <RequireAccess area="stock">
    <Stack>
      {/* The shared app header already identifies the page. */}
      <Stack.Screen name="index" options={{ title: 'Stock', headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Product', headerShown: false }} />
      <Stack.Screen name="receive" options={{ title: 'Receive Stock', headerShown: false }} />
      <Stack.Screen name="received" options={{ title: 'Stock Received', headerShown: false }} />
    </Stack>
    </RequireAccess>
  );
}
