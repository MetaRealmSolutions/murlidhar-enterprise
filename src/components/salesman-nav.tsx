import { useRouter, useSegments, type Href } from 'expo-router';
import { Pressable, View, type PressableStateCallbackType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavLabel, ShellHeader } from './app-nav';
import { useTheme } from './controls';

type PState = PressableStateCallbackType & { hovered?: boolean };

// The salesman's whole app: two destinations, nothing owner-side.
const ITEMS: { key: string; label: string; href: Href }[] = [
  { key: 'home', label: 'Home', href: '/salesman' as Href },
  { key: 'stock', label: 'Stock', href: '/salesman/stock' as Href },
];

/** (salesman) → Home, (salesman)/stock → My Stock, … */
function useActive() {
  const segments = useSegments() as string[];
  return segments[1] ?? 'home';
}

/** The same header as the owner's (brand left, ☰ on phones); the only entry in the salesman's menu is Logout. */
export function SalesmanHeader() {
  const active = useActive();
  return <ShellHeader links={ITEMS} active={active} items={[]} moreLabel="Menu" />;
}

export function SalesmanBottomNav() {
  const t = useTheme();
  const router = useRouter();
  const active = useActive();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.surface,
        borderTopWidth: 1,
        borderTopColor: t.border,
        paddingBottom: insets.bottom,
      }}>
      {ITEMS.map((i) => {
        const on = i.key === active;
        return (
          <Pressable
            key={i.key}
            accessibilityRole="link"
            accessibilityState={{ selected: on }}
            onPress={() => router.navigate(i.href)}
            style={(s: PState) => ({
              flex: 1,
              height: 58,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: s.pressed ? t.hover : 'transparent',
              borderTopWidth: 2,
              borderTopColor: on ? t.accent : 'transparent',
              marginTop: -1,
            })}>
            <NavLabel label={i.label} active={on} />
          </Pressable>
        );
      })}
    </View>
  );
}
