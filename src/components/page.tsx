import { useRouter, type Href } from 'expo-router';
import { type ReactNode, type Ref } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions, type PressableStateCallbackType } from 'react-native';

import { NAV_BREAKPOINT } from './app-nav';
import { T, useTheme } from './controls';

type PState = PressableStateCallbackType & { hovered?: boolean };

export function usePageMetrics() {
  const width = useWindowDimensions().width;
  const phone = width < NAV_BREAKPOINT;
  return { width, phone, pad: phone ? 16 : width >= 1024 ? 32 : 24 };
}

/**
 * Standard page: white surface, content up to 1400px, a title block with optional actions, and an
 * optional back link. `narrow` keeps forms at a comfortable reading width.
 */
export function Page({
  title,
  subtitle,
  actions,
  back,
  narrow,
  wide,
  maxWidth,
  scrollRef,
  onScrollY,
  children,
}: {
  /** Omit to start the page directly with its content. */
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  back?: { label: string; href: Href };
  narrow?: boolean;
  /** Uses the whole window width (dense entry screens) instead of the 1400px column. */
  wide?: boolean;
  /** Width of the centered content column (default 1400): the heading, actions and content all share it. */
  maxWidth?: number;
  /** For pages that scroll themselves (jump to top). */
  scrollRef?: Ref<ScrollView>;
  /** Called with the vertical scroll offset while the page scrolls. */
  onScrollY?: (y: number) => void;
  children: ReactNode;
}) {
  const t = useTheme();
  const router = useRouter();
  const { phone, pad } = usePageMetrics();
  return (
    <ScrollView
      ref={scrollRef}
      onScroll={onScrollY ? (e) => onScrollY(e.nativeEvent.contentOffset.y) : undefined}
      scrollEventThrottle={onScrollY ? 32 : undefined}
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ alignItems: 'center', paddingTop: phone ? 22 : 40, paddingBottom: 56 }}
      keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: narrow ? 640 + pad * 2 : wide ? undefined : (maxWidth ?? 1400), paddingHorizontal: pad, gap: phone ? 18 : 28 }}>
        {title !== undefined || back || actions ? (
        <View style={{ gap: 14 }}>
          {back && (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.navigate(back.href)}
              hitSlop={8}
              style={(s: PState) => ({ alignSelf: 'flex-start', opacity: s.hovered ? 0.7 : 1 })}>
              <T size={14} weight="500" style={{ color: t.accent }}>
                ← {back.label}
              </T>
            </Pressable>
          )}
          <View style={{ flexDirection: phone || !actions ? 'column' : 'row', alignItems: phone || !actions ? 'stretch' : 'flex-end', justifyContent: 'space-between', gap: 16 }}>
            <View style={{ flex: phone || !actions ? undefined : 1, gap: 4 }}>
              <T size={phone ? 26 : 30} weight="700" style={{ letterSpacing: -0.6 }}>
                {title}
              </T>
              {subtitle ? (
                <T size={15} muted>
                  {subtitle}
                </T>
              ) : null}
            </View>
            {actions ? <View style={{ flexDirection: 'row', gap: 8 }}>{actions}</View> : null}
          </View>
        </View>
        ) : null}
        {children}
      </View>
    </ScrollView>
  );
}

export function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
      <T size={19} weight="600" style={{ letterSpacing: -0.2 }}>
        {title}
      </T>
      {meta ? (
        <T size={14} muted>
          {meta}
        </T>
      ) : null}
    </View>
  );
}

const GRID_LINE = '#dbe3ee';

export type Col<R> = {
  label: string;
  /** Fixed width; columns without one share the remaining space. */
  width?: number;
  align?: 'left' | 'right';
  weight?: '400' | '500' | '600';
  render: (row: R) => ReactNode;
  /** Makes the header tappable (sorting). `sort` shows the current direction on the active column only. */
  onHeaderPress?: () => void;
  sort?: 'asc' | 'desc' | null;
  /** The cell holds its own button/link. On web a button role renders a <button>, which cannot sit inside another <button>, so a pressable row then drops its own button role. */
  action?: boolean;
};

/** Standard data table: tinted header, hairline rows, hover, numbers aligned. */
export function SimpleTable<R>({
  columns,
  rows,
  keyOf,
  onRowPress,
  empty,
  minWidth,
  grid,
  compact,
  foot,
}: {
  columns: Col<R>[];
  rows: R[];
  keyOf: (row: R) => string;
  onRowPress?: (row: R) => void;
  empty?: { title: string; note?: string };
  /** Scrolls sideways below this width (wide tables on phones). */
  minWidth?: number;
  /** Thin vertical lines between columns (header and rows share the same cell boxes, so they line up exactly). */
  grid?: boolean;
  /** Tighter padding, gaps and row height, for tables shown side by side. */
  compact?: boolean;
  /** A totals row under the rows, in the same column boxes: text by column label (columns not listed stay empty). Shown even when there are no rows. */
  foot?: Record<string, string>;
}) {
  const t = useTheme();
  const { phone } = usePageMetrics();
  const gap = grid ? 0 : compact ? 8 : phone ? 12 : 24;
  const pad = grid ? 0 : compact ? 8 : phone ? 12 : 20;
  const cell = (c: Col<R>) => {
    const box = c.width ? { width: c.width } : { flex: 1 };
    if (!grid) return box;
    const last = c === columns[columns.length - 1];
    return { ...box, alignSelf: 'stretch' as const, justifyContent: 'center' as const, paddingHorizontal: 12, borderRightWidth: last ? 0 : 1, borderRightColor: GRID_LINE };
  };
  const body = (
    <View style={{ flexGrow: 1, minWidth }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: grid ? 'stretch' : 'center',
          height: compact ? 38 : 46,
          paddingHorizontal: pad,
          gap,
          backgroundColor: t.subtle,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: t.border,
        }}>
        {columns.map((c) =>
          c.onHeaderPress ? (
            <Pressable
              key={c.label}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${c.label}`}
              onPress={c.onHeaderPress}
              hitSlop={{ top: 8, bottom: 8 }}
              style={[cell(c), { height: 46, flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start' }]}>
              <T size={13} weight="600" muted={!c.sort} numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {c.label}
              </T>
              <T size={12} style={{ color: c.sort ? t.accent : t.borderStrong }}>
                {c.sort === 'asc' ? '↑' : c.sort === 'desc' ? '↓' : '↕'}
              </T>
            </Pressable>
          ) : grid ? (
            <View key={c.label} style={cell(c)}>
              <T size={13} weight="600" muted numberOfLines={1} style={[{ textTransform: 'uppercase', letterSpacing: 0.5 }, c.align === 'right' ? { textAlign: 'right' } : null]}>
                {c.label}
              </T>
            </View>
          ) : (
            <T
              key={c.label}
              size={13}
              weight="600"
              muted
              style={[{ textTransform: 'uppercase', letterSpacing: 0.5 }, cell(c), c.align === 'right' ? { textAlign: 'right' } : null]}>
              {c.label}
            </T>
          ),
        )}
      </View>
      {rows.map((r) => {
        const content = columns.map((c) => {
          const v = c.render(r);
          return (
            <View key={c.label} style={[cell(c), c.align === 'right' ? { alignItems: 'flex-end' } : null]}>
              {typeof v === 'string' || typeof v === 'number' ? (
                <T size={15} weight={c.weight ?? '400'} numberOfLines={2} style={[c.align === 'right' ? { textAlign: 'right' } : null, { fontVariant: ['tabular-nums'] }]}>
                  {v}
                </T>
              ) : (
                v
              )}
            </View>
          );
        });
        const style = (s: PState) => ({
          flexDirection: 'row' as const,
          alignItems: grid ? ('stretch' as const) : ('center' as const),
          minHeight: compact ? 44 : 58,
          paddingHorizontal: pad,
          gap,
          backgroundColor: s.pressed ? t.hover : s.hovered && onRowPress ? t.subtle : t.surface,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        });
        return onRowPress ? (
          <Pressable key={keyOf(r)} accessibilityRole={columns.some((c) => c.action) ? undefined : 'button'} onPress={() => onRowPress(r)} style={style}>
            {content}
          </Pressable>
        ) : (
          <View key={keyOf(r)} style={style({ pressed: false, hovered: false })}>
            {content}
          </View>
        );
      })}
      {rows.length === 0 && empty && (
        <View style={{ paddingVertical: 48, alignItems: 'center', gap: 4, borderBottomWidth: 1, borderBottomColor: t.border }}>
          <T size={15} weight="600">
            {empty.title}
          </T>
          {empty.note ? (
            <T size={14} muted>
              {empty.note}
            </T>
          ) : null}
        </View>
      )}
      {foot ? (
        <View style={{ flexDirection: 'row', alignItems: grid ? 'stretch' : 'center', minHeight: compact ? 40 : 46, paddingHorizontal: pad, gap, backgroundColor: t.subtle, borderBottomWidth: 1, borderBottomColor: t.border }}>
          {columns.map((c) => (
            <View key={c.label} style={[cell(c), c.align === 'right' ? { alignItems: 'flex-end' } : null]}>
              {foot[c.label] !== undefined ? (
                <T size={15} weight="700" numberOfLines={1} style={[c.align === 'right' ? { textAlign: 'right' } : null, { fontVariant: ['tabular-nums'] }]}>
                  {foot[c.label]}
                </T>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
  return minWidth ? (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%' }}>
      {body}
    </ScrollView>
  ) : (
    body
  );
}

/** Cancel + primary action, right-aligned on desktop and stacked full-width on phones. */
export function FormActions({ children }: { children: ReactNode }) {
  const t = useTheme();
  const { phone } = usePageMetrics();
  return (
    <View
      style={{
        flexDirection: phone ? 'column-reverse' : 'row',
        justifyContent: 'flex-end',
        gap: 10,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: t.border,
      }}>
      {children}
    </View>
  );
}

/** Plain label + value line used on settings-style pages. */
export function InfoRow({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        minHeight: 58,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}>
      <T size={15} muted>
        {label}
      </T>
      <T size={15} weight="500" style={{ textAlign: 'right', flexShrink: 1 }}>
        {value}
      </T>
    </View>
  );
}
