import { usePathname, useRouter, useSegments, type Href } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  View,
  useWindowDimensions,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthContext';
import { can, isOwner, type Area } from '../auth/access';
import { BUSINESS_NAME } from '../mock/data';
import { BrandLogo } from './brand-logo';
import { T, useTheme } from './controls';
import { MenuDivider, MenuItem, Popover } from './popover';

export const NAV_BREAKPOINT = 720;
const MAX_WIDTH = 1400;

// The owner's primary destinations: the sticky bottom bar on phones, the header links on desktop.
type NavLink = { key: string; label: string; /** Shorter label for narrow bars. */ short?: string; href: Href };
const LINKS: NavLink[] = [
  { key: 'index', label: 'Home', href: '/' },
  { key: 'stock', label: 'Stock', href: '/stock' },
  { key: 'private-bills', label: 'Private Bill', short: 'Private', href: '/private-bills' as Href },
  { key: 'salesmen', label: 'Salesman Master', short: 'Salesmen', href: '/salesmen' },
  { key: 'products', label: 'Item Master', short: 'Items', href: '/products' },
];
const COMPACT_HEADER = 1180;

// Secondary options: the "More" menu on desktop, the ☰ menu on phones. Logout is added below them.
const MORE_ITEMS: { label: string; href: Href }[] = [
  { label: 'Reports', href: '/more/reports' },
  { label: 'Expense', href: '/more/expense' },
  { label: 'Users', href: '/more/users' },
  { label: 'Businesses', href: '/more/businesses' },
  { label: 'Settings', href: '/more/settings' },
];

// Which permission opens a primary link. Links not listed here (Home, Item Master) are for the owner only.
const LINK_AREA: Record<string, Area | undefined> = { stock: 'stock', 'private-bills': 'privateBills', salesmen: 'salesmen' };

/** The primary links the signed-in user may use: everything for the owner, only the permitted pages for an employee. */
function useLinks(): NavLink[] {
  const { user } = useAuth();
  return LINKS.filter((l) => (LINK_AREA[l.key] ? can(user, LINK_AREA[l.key] as Area) : isOwner(user)));
}

// The Salesman link opens a dropdown with its two pages: today's work, and the saved bills. The pages are separate routes; the menu is the way in to both.
const SALESMEN_MENU: { key: 'entry' | 'previous' | 'analysis'; label: string; href: Href }[] = [
  { key: 'entry', label: 'Add New Bill Entry', href: '/salesmen' },
  { key: 'previous', label: 'List of Bill Entry', href: '/salesmen/previous' as Href },
  { key: 'analysis', label: 'Product Sales Analysis', href: '/salesmen/product-sales' as Href },
];

/** Which of the two Salesman pages is showing (Statements belongs to Previous Bills). */
function useSalesmenSection(): 'entry' | 'previous' | 'analysis' {
  const path = usePathname();
  if (path.startsWith('/salesmen/product-sales')) return 'analysis';
  return path.startsWith('/salesmen/previous') || path.startsWith('/salesmen/statements') ? 'previous' : 'entry';
}

/** The Salesman dropdown: Add New Bill Entry / List of Bill Entry / Product Sales Analysis, with a check on the page that is open. `trigger` draws the nav item that opens it. */
function SalesmenMenu({ trigger }: { trigger: (open: () => void, isOpen: boolean) => React.ReactNode }) {
  const router = useRouter();
  const current = useSalesmenSection();
  return (
    <Popover width={208} renderTrigger={trigger}>
      {(close) => (
        <View accessibilityRole="menu">
          {SALESMEN_MENU.map((i) => (
            <MenuItem
              key={i.key}
              label={i.label}
              checked={i.key === current}
              onPress={() => {
                close();
                router.navigate(i.href);
              }}
            />
          ))}
        </View>
      )}
    </Popover>
  );
}

/** Active primary destination from the route, or 'more' for a secondary page (Reports, Users, ...). */
function useActiveKey() {
  const segments = useSegments() as string[];
  const first = segments[1];
  if (!first || first === 'index') return 'index';
  if (first === 'more') return ['products', 'product-detail', 'product-form'].includes(segments[2]) ? 'products' : 'more';
  return first;
}

type PState = PressableStateCallbackType & { hovered?: boolean };

export function Brand() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <BrandLogo height={34} />
      <T size={17} weight="600" numberOfLines={1} style={{ letterSpacing: -0.2 }}>
        {BUSINESS_NAME}
      </T>
    </View>
  );
}

function MoreMenu({
  children,
  style,
  items = MORE_ITEMS,
}: {
  children: (open: () => void, isOpen: boolean) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Menu entries above Logout (none for a salesman, whose menu is just Logout). */
  items?: { label: string; href: Href }[];
}) {
  const router = useRouter();
  const { signOut } = useAuth();
  return (
    <Popover width={208} align="right" style={style} renderTrigger={children}>
      {(close) => (
        <View accessibilityRole="menu">
          {items.map((i) => (
            <MenuItem
              key={i.label}
              label={i.label}
              onPress={() => {
                close();
                router.navigate(i.href);
              }}
            />
          ))}
          {items.length > 0 ? <MenuDivider /> : null}
          <MenuItem
            label="Logout"
            onPress={() => {
              close();
              signOut();
            }}
          />
        </View>
      )}
    </Popover>
  );
}

export function NavLabel({ label, active, open, caret }: { label: string; active: boolean; open?: boolean; caret?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <T size={15} weight={active ? '600' : '500'} style={{ color: active || open ? t.accent : t.muted }}>
        {label}
      </T>
      {caret ? (
        <T size={9} style={{ color: active || open ? t.accent : t.muted }}>
          {open ? '▲' : '▼'}
        </T>
      ) : null}
    </View>
  );
}

export function NavItem({
  label,
  active,
  open,
  caret,
  onPress,
}: {
  label: string;
  active: boolean;
  open?: boolean;
  caret?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const on = active || open;
  return (
    <Pressable
      accessibilityRole={caret ? 'button' : 'link'}
      accessibilityState={{ selected: active, expanded: caret ? !!open : undefined }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={(s: PState) => [
        {
          height: 64,
          paddingHorizontal: 18,
          justifyContent: 'center',
          borderBottomWidth: 2,
          borderBottomColor: on ? t.accent : 'transparent',
          backgroundColor: s.pressed ? t.hover : s.hovered && !on ? t.subtle : 'transparent',
        },
        focused ? ({ boxShadow: `inset 0 0 0 2px ${t.accent}55` } as object) : null,
      ]}>
      <NavLabel label={label} active={active} open={open} caret={caret} />
    </Pressable>
  );
}

/** Top application header for the owner. Wide screens carry the primary destinations; phones use BottomNav. */
export function AppHeader() {
  const active = useActiveKey();
  const links = useLinks();
  const { user } = useAuth();
  // Reports, Users, Businesses and Settings are for the owner: an employee's menu is just Logout.
  return <ShellHeader links={links} items={isOwner(user) ? undefined : []} active={active} moreActive={active === 'more'} />;
}

/**
 * The one application header, shared by both roles: brand on the left, the role's primary links on
 * wide screens, and the ☰ menu on phones (Logout is always inside it). Only the links and the menu
 * entries differ per role.
 */
export function ShellHeader({
  links,
  active,
  items,
  moreLabel = 'More',
  moreActive = false,
}: {
  links: NavLink[];
  active: string;
  items?: { label: string; href: Href }[];
  moreLabel?: string;
  moreActive?: boolean;
}) {
  const t = useTheme();
  const router = useRouter();
  const width = useWindowDimensions().width;
  const wide = width >= NAV_BREAKPOINT;
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border, paddingTop: insets.top }}>
      <View
        style={{
          height: wide ? 64 : 56,
          width: '100%',
          maxWidth: MAX_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: wide ? 32 : 16,
          flexDirection: 'row',
          alignItems: 'center',
        }}>
        <View style={{ flex: 1 }}>
          <Brand />
        </View>
        {wide && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {links.map((l) => {
              const label = width < COMPACT_HEADER && l.short ? l.short : l.label;
              return l.key === 'salesmen' ? (
                <SalesmenMenu key={l.key} trigger={(open, isOpen) => <NavItem label={label} caret active={l.key === active} open={isOpen} onPress={open} />} />
              ) : (
                <NavItem key={l.key} label={label} active={l.key === active} onPress={() => router.navigate(l.href)} />
              );
            })}
            <MoreMenu items={items}>
              {(open, isOpen) => <NavItem label={moreLabel} caret active={moreActive} open={isOpen} onPress={open} />}
            </MoreMenu>
          </View>
        )}
        {/* Phones: the ☰ menu holds the secondary options. */}
        <View style={wide ? { flex: 1 } : { alignItems: 'flex-end' }}>
          {!wide && (
            <MoreMenu items={items}>
              {(open, isOpen) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Menu"
                  accessibilityState={{ expanded: isOpen }}
                  onPress={open}
                  hitSlop={6}
                  style={(s: PState) => ({
                    width: 44,
                    height: 44,
                    marginRight: -8,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: s.pressed || isOpen ? t.hover : 'transparent',
                  })}>
                  <T size={26} style={{ lineHeight: 28 }}>
                    ☰
                  </T>
                </Pressable>
              )}
            </MoreMenu>
          )}
        </View>
      </View>
    </View>
  );
}

/** Sticky bottom navigation for phones: the primary destinations, with short labels. */
export function BottomNav() {
  const t = useTheme();
  const router = useRouter();
  const active = useActiveKey();
  const insets = useSafeAreaInsets();
  const links = useLinks();

  const cell = (label: string, on: boolean, onPress: () => void) => (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={(s: PState) => ({
        height: 58,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: s.pressed ? t.hover : 'transparent',
        borderTopWidth: 2,
        borderTopColor: on ? t.accent : 'transparent',
        marginTop: -1,
      })}>
      <NavLabel label={label} active={on} />
    </Pressable>
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.surface,
        borderTopWidth: 1,
        borderTopColor: t.border,
        paddingBottom: insets.bottom,
      }}>
      {links.map((l) => (
        <View key={l.key} style={{ flex: 1 }}>
          {l.key === 'salesmen' ? <SalesmenMenu trigger={(open) => cell(l.short ?? l.label, l.key === active, open)} /> : cell(l.short ?? l.label, l.key === active, () => router.navigate(l.href))}
        </View>
      ))}
    </View>
  );
}
