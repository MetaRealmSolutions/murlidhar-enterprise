import { Stack } from 'expo-router';

import { RequireAccess } from '../../../components/require-access';

export default function SalesmenLayout() {
  return (
    <RequireAccess area="salesmen">
    <Stack>
      {/* The shared app header already identifies the section; these pages draw their own titles. */}
      <Stack.Screen name="index" options={{ title: 'Salesmen', headerShown: false }} />
      <Stack.Screen name="previous" options={{ title: 'List of Bill Entry', headerShown: false }} />
      <Stack.Screen name="product-sales" options={{ title: 'Product Sales Analysis', headerShown: false }} />
      <Stack.Screen name="form" options={{ title: 'Salesman', headerShown: false }} />
      <Stack.Screen name="statements" options={{ title: 'Statements', headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Salesman', headerShown: false }} />
    </Stack>
    </RequireAccess>
  );
}
