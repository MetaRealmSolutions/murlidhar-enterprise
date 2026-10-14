import { Pressable, View } from 'react-native';

import type { PaymentStatus } from '../data/db/schema';
import { T, useTheme } from './controls';

export const PAYMENT_LABEL = { paid: 'FULLY PAID', partial: 'PARTIALLY PAID', unpaid: 'UNPAID' } as const;

// Payment state is the only thing these colors say: green = settled, amber = a balance remains after some payment, red = nothing paid.
// The app is light-mode only, so one palette is enough; every text/background pair is above 4.5:1.
const TONE = {
  paid: { fg: '#166534', bg: '#ecfdf3', border: '#a7e3c1' },
  partial: { fg: '#9a4d00', bg: '#fff6e8', border: '#f5cf9b' },
  unpaid: { fg: '#b42318', bg: '#fef3f2', border: '#f6b9b3' },
} as const;

export const paymentTone = (status: PaymentStatus) => TONE[status];

/** Colour of a balance: green at ₹0, otherwise amber when something was paid, red when nothing was. */
export const remainingTone = (remaining: number, paid: number) => TONE[remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'];

/** Compact rounded status label. */
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const c = TONE[status];
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>
      <T size={11} weight="700" style={{ color: c.fg, letterSpacing: 0.4 }} numberOfLines={1}>
        {PAYMENT_LABEL[status]}
      </T>
    </View>
  );
}

/** A statement filter. Selected chips take the colour of the status they show; All uses the app's accent. */
export function FilterChip({ label, status, selected, onPress }: { label: string; status?: PaymentStatus; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  const c = status ? TONE[status] : { fg: t.accent, bg: t.accentSoft, border: t.accent };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={(s: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? c.border : t.border,
        backgroundColor: selected ? c.bg : s.pressed || s.hovered ? t.hover : t.surface,
      })}>
      {status ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.fg }} /> : null}
      <T size={13} weight={selected ? '700' : '500'} style={{ color: selected ? c.fg : t.muted }}>
        {label}
      </T>
    </Pressable>
  );
}
