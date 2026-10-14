import { Redirect, type Href } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useWindowDimensions } from 'react-native';

import { useSalesmanSession } from '../../auth/AuthContext';
import { NAV_BREAKPOINT } from '../../components/app-nav';
import { DataGate } from '../../components/data-gate';
import { SalesmanBottomNav, SalesmanHeader } from '../../components/salesman-nav';

// Salesman-only area. Anyone who is not a signed-in salesman is turned away here, in addition to
// the guard in the root layout; every page below reads the salesman id from the session, and the
// Firestore rules only ever return that salesman's own data.
export default function SalesmanLayout() {
  const session = useSalesmanSession();
  const wide = useWindowDimensions().width >= NAV_BREAKPOINT;
  if (!session) return <Redirect href={'/' as Href} />;
  return (
    <DataGate>
      <Tabs
        tabBar={() => (wide ? null : <SalesmanBottomNav />)}
        screenOptions={{ header: () => <SalesmanHeader />, tabBarPosition: wide ? 'top' : 'bottom' }}>
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="stock" options={{ title: 'Stock' }} />
      </Tabs>
    </DataGate>
  );
}
