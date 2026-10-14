import { useState } from 'react';
import { Pressable, View, type PressableStateCallbackType } from 'react-native';

import { productStatus, STATUS_RANK, type StockStatus } from '../mock/stock-status';
import type { ProductWithStock as StockProduct } from '../data/repository';
import { T, useTheme } from './controls';

type PState = PressableStateCallbackType & { hovered?: boolean };

/* ---------- Types ---------- */

export type SortKey = 'name' | 'amount' | 'commission' | 'stock' | 'status';
export type SortDir = 'asc' | 'desc';
export type Sort = { key: SortKey; dir: SortDir } | null;

export type Range = { id: string; label: string; min: number; max: number };

export type Filters = {
  status: StockStatus | 'all';
  amount: string; // Range id, 'any' for no filter
  commission: string;
};

export const NO_FILTERS: Filters = { status: 'all', amount: 'any', commission: 'any' };

/* ---------- Options ---------- */

export const STATUS_OPTIONS: { id: Filters['status']; label: string }[] = [
  { id: 'all', label: 'All Status' },
  { id: 'healthy', label: 'Healthy' },
  { id: 'low', label: 'Low Stock' },
  { id: 'out', label: 'Out of Stock' },
];

const ANY: Range = { id: 'any', label: 'Any', min: -Infinity, max: Infinity };

export const AMOUNT_RANGES: Range[] = [
  ANY,
  { id: 'a1', label: 'Up to ₹250', min: 0, max: 250 },
  { id: 'a2', label: '₹251 – ₹500', min: 251, max: 500 },
  { id: 'a3', label: '₹501 – ₹1,000', min: 501, max: 1000 },
  { id: 'a4', label: 'Above ₹1,000', min: 1001, max: Infinity },
];

export const COMMISSION_RANGES: Range[] = [
  ANY,
  { id: 'c1', label: 'Up to ₹10', min: 0, max: 10 },
  { id: 'c2', label: '₹11 – ₹20', min: 11, max: 20 },
  { id: 'c3', label: '₹21 – ₹40', min: 21, max: 40 },
  { id: 'c4', label: 'Above ₹40', min: 41, max: Infinity },
];

export const SORT_OPTIONS: { key: SortKey; dir: SortDir; label: string; short: string }[] = [
  { key: 'name', dir: 'asc', label: 'Item — A to Z', short: 'Item ↑' },
  { key: 'name', dir: 'desc', label: 'Item — Z to A', short: 'Item ↓' },
  { key: 'amount', dir: 'asc', label: 'Amount — Low to High', short: 'Amount ↑' },
  { key: 'amount', dir: 'desc', label: 'Amount — High to Low', short: 'Amount ↓' },
  { key: 'commission', dir: 'asc', label: 'Commission — Low to High', short: 'Commission ↑' },
  { key: 'commission', dir: 'desc', label: 'Commission — High to Low', short: 'Commission ↓' },
  { key: 'stock', dir: 'asc', label: 'Stock — Low to High', short: 'Stock ↑' },
  { key: 'stock', dir: 'desc', label: 'Stock — High to Low', short: 'Stock ↓' },
];

const SORT_NAMES: Record<SortKey, string> = {
  name: 'Product',
  amount: 'Amount',
  commission: 'Commission',
  stock: 'Stock',
  status: 'Status',
};

export function sortLabel(sort: Sort) {
  return sort ? `${SORT_NAMES[sort.key]} ${sort.dir === 'asc' ? '↑' : '↓'}` : '';
}

/* ---------- Logic ---------- */

export function activeFilterCount(f: Filters) {
  return (f.status !== 'all' ? 1 : 0) + (f.amount !== 'any' ? 1 : 0) + (f.commission !== 'any' ? 1 : 0);
}

const inRange = (ranges: Range[], id: string, v: number) => {
  const r = ranges.find((x) => x.id === id) ?? ANY;
  return v >= r.min && v <= r.max;
};

export function applyView(products: StockProduct[], search: string, f: Filters, sort: Sort): StockProduct[] {
  const q = search.trim().toLowerCase();
  const out = products.filter(
    (p) =>
      p.name.toLowerCase().includes(q) &&
      (f.status === 'all' || productStatus(p) === f.status) &&
      inRange(AMOUNT_RANGES, f.amount, p.amount) &&
      inRange(COMMISSION_RANGES, f.commission, p.commission),
  );
  if (!sort) return out;
  const dir = sort.dir === 'asc' ? 1 : -1;
  const cmp = (a: StockProduct, b: StockProduct) => {
    switch (sort.key) {
      case 'name':
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      case 'status':
        return STATUS_RANK[productStatus(a)] - STATUS_RANK[productStatus(b)] || a.stock - b.stock;
      default:
        return a[sort.key] - b[sort.key];
    }
  };
  return [...out].sort((a, b) => dir * cmp(a, b));
}

/* ---------- UI ---------- */

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={(s: PState) => ({
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 6,
        borderWidth: 1,
        justifyContent: 'center',
        backgroundColor: on ? t.accentSoft : s.hovered ? t.hover : t.surface,
        borderColor: on || focused ? t.accent : t.border,
      })}>
      <T size={13} weight={on ? '600' : '500'} style={{ color: on ? t.accent : t.text }}>
        {label}
      </T>
    </Pressable>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <T size={12} weight="600" muted style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

/** Status, Amount and Commission filters. Shared by the desktop popover and the mobile sheet. */
export function FilterPanel({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  return (
    <View style={{ padding: 16, gap: 18 }}>
      <Group title="Status">
        {STATUS_OPTIONS.map((o) => (
          <Chip key={o.id} label={o.label} on={value.status === o.id} onPress={() => onChange({ ...value, status: o.id })} />
        ))}
      </Group>
      <Group title="Amount">
        {AMOUNT_RANGES.map((o) => (
          <Chip key={o.id} label={o.label} on={value.amount === o.id} onPress={() => onChange({ ...value, amount: o.id })} />
        ))}
      </Group>
      <Group title="Commission">
        {COMMISSION_RANGES.map((o) => (
          <Chip
            key={o.id}
            label={o.label}
            on={value.commission === o.id}
            onPress={() => onChange({ ...value, commission: o.id })}
          />
        ))}
      </Group>
    </View>
  );
}

/** Radio-style rows for the mobile sort sheet. */
export function SortRadioList({ sort, onSelect }: { sort: Sort; onSelect: (s: { key: SortKey; dir: SortDir }) => void }) {
  const t = useTheme();
  return (
    <View>
      {SORT_OPTIONS.map((o) => {
        const on = sort?.key === o.key && sort.dir === o.dir;
        return (
          <Pressable
            key={o.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onSelect({ key: o.key, dir: o.dir })}
            style={(s: PState) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              height: 50,
              paddingHorizontal: 20,
              backgroundColor: s.pressed ? t.hover : 'transparent',
            })}>
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                borderWidth: 1.5,
                borderColor: on ? t.accent : t.borderStrong,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent }} /> : null}
            </View>
            <T size={15} weight={on ? '600' : '400'}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
