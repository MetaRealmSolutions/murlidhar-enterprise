import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

/**
 * Two side-by-side tables from this window width up (each half then needs about 620px for its ten columns without scrolling sideways);
 * below it, one table that scrolls sideways on a phone. Used by every product table of the Add New Bill Entry page, so they all switch together.
 */
export const SPLIT_AT = 1320;

export const useSplit = () => useWindowDimensions().width >= SPLIT_AT;

/**
 * Splits `items` into two balanced halves (the first gets the extra one) and draws each with `render`, side by side with a gap on a wide screen.
 * On a narrower one it draws everything in one piece. The items themselves are not changed: callers keep each item's own serial number.
 */
export function TwoUp<I>({ items, render }: { items: I[]; render: (list: I[]) => ReactNode }) {
  const split = useSplit();
  if (!split) return <>{render(items)}</>;
  const half = Math.ceil(items.length / 2);
  return (
    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, minWidth: 0 }}>{render(items.slice(0, half))}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{render(items.slice(half))}</View>
    </View>
  );
}
