import { Redirect, type Href } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useWindowDimensions } from 'react-native';

import { useAuth } from '../../auth/AuthContext';
import { AppHeader, BottomNav, NAV_BREAKPOINT } from '../../components/app-nav';
import { DataGate } from '../../components/data-gate';

export default function AppLayout() {
  const wide = useWindowDimensions().width >= NAV_BREAKPOINT;
  const { user } = useAuth();
  // Business area for the owner and employees (what an employee can open is guarded per page). Anyone else who lands here is sent where they belong.
  if (user?.role === 'salesman') return <Redirect href={'/salesman' as Href} />;
  if (user?.role !== 'owner' && user?.role !== 'employee') return <Redirect href={'/login' as Href} />;
  return (
    <DataGate>
      <Tabs
        tabBar={() => (wide ? null : <BottomNav />)}
        screenOptions={{
          header: () => <AppHeader />,
          tabBarPosition: wide ? 'top' : 'bottom',
        }}>
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="stock" options={{ title: 'Stock', headerShown: true }} />
        <Tabs.Screen name="bills" options={{ title: 'Bill', href: null }} />
        <Tabs.Screen name="private-bills" options={{ title: 'Private Bill' }} />
        <Tabs.Screen name="salesmen" options={{ title: 'Salesmen' }} />
        <Tabs.Screen name="products" options={{ title: 'Products' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
      </Tabs>
    </DataGate>
  );
}
