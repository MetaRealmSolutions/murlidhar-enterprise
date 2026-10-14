import { useRouter } from 'expo-router';
import { RequireAccess } from '../../components/require-access';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions, type PressableStateCallbackType } from 'react-native';

import { NAV_BREAKPOINT } from '../../components/app-nav';
import { Btn, StatusDot, T, TextAction, useTheme } from '../../components/controls';
import { DateField } from '../../components/date-field';
import { useDatabase } from '../../data/db/database';
import { expensesBetween, salesTotals, salesTotalsBetween, supplierPaidBetween } from '../../data/derive';
import { useProductsWithStock, useRecentActivity, useSalesmen } from '../../data/repository';
import { num, rupees } from '../../mock/data';
import { STATUS_LABEL, STATUS_RANK, productStatus, type StockStatus } from '../../mock/stock-status';
import { MONTH_NAMES, istHour } from '../../data/business-date';
import { addDays, formatLong, formatTime, localDate, periodText, todayISO } from '../../data/statements';

type Period = 'today' | 'week' | 'month' | 'custom';

type PState = PressableStateCallbackType & { hovered?: boolean };

const TNUM = { fontVariant: ['tabular-nums' as const] };
const DESKTOP = 1024;

/** "5:20 PM" for today, "05 Oct" for earlier days (India time). */
function stamp(iso: string) {
  if (localDate(iso) === todayISO()) return formatTime(iso);
  const [, m, d] = localDate(iso).split('-');
  return `${d} ${MONTH_NAMES[Number(m) - 1].slice(0, 3)}`;
}

function greeting() {
  const h = istHour();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function useStatusColor() {
  const t = useTheme();
  return (s: StockStatus) => (s === 'healthy' ? t.success : s === 'low' ? t.warning : t.danger);
}

/* ---------- Building blocks ---------- */

function Section({
  title,
  link,
  onLink,
  children,
}: {
  title: string;
  link?: string;
  onLink?: () => void;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <T size={19} weight="600" style={{ letterSpacing: -0.2 }}>
          {title}
        </T>
        {link && onLink ? (
          <Pressable
            accessibilityRole="link"
            onPress={onLink}
            hitSlop={8}
            style={(s: PState) => ({ opacity: s.hovered ? 0.7 : 1 })}>
            <T size={14} weight="500" style={{ color: t.accent }}>
              {link}
            </T>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function HeadRow({ cols, pad }: { cols: ReactNode; pad: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 46,
        paddingHorizontal: pad,
        gap: 16,
        backgroundColor: t.subtle,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: t.border,
      }}>
      {cols}
    </View>
  );
}

function Th({ children, width, right }: { children: string; width?: number; right?: boolean }) {
  return (
    <T
      size={13}
      weight="600"
      muted
      style={[
        { textTransform: 'uppercase', letterSpacing: 0.5 },
        width ? { width } : { flex: 1 },
        right ? { textAlign: 'right' } : null,
      ]}>
      {children}
    </T>
  );
}

function Empty({ title, note }: { title: string; note?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 36, alignItems: 'center', gap: 4, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.border }}>
      <T size={15} weight="600">
        {title}
      </T>
      {note ? (
        <T size={14} muted>
          {note}
        </T>
      ) : null}
    </View>
  );
}

function Status({ status }: { status: StockStatus }) {
  const t = useTheme();
  const color = useStatusColor()(status);
  return (
    <StatusDot color={color}>
      <T size={14} weight="500" style={{ color: status === 'healthy' ? t.muted : color }}>
        {STATUS_LABEL[status]}
      </T>
    </StatusDot>
  );
}

/* ---------- Metrics ---------- */

function Metrics({ items, columns }: { items: { label: string; value: string; note: string }[]; columns: 1 | 2 | 3 | 4 }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.border }}>
      {items.map((m, i) => {
        const col = i % columns;
        const lastRow = i >= items.length - columns;
        return (
          <View
            key={m.label}
            style={{
              width: `${100 / columns}%`,
              paddingVertical: columns === 4 ? 22 : 16,
              paddingLeft: col === 0 ? (columns === 4 ? 0 : 4) : columns === 4 ? 28 : 16,
              paddingRight: 12,
              borderLeftWidth: col > 0 ? 1 : 0,
              borderLeftColor: t.border,
              borderBottomWidth: columns <= 2 && !lastRow ? 1 : 0,
              borderBottomColor: t.border,
              gap: 4,
            }}>
            <T size={14} weight="500" muted>
              {m.label}
            </T>
            <T size={columns === 4 ? 30 : 24} weight="700" style={[{ letterSpacing: -0.6 }, TNUM]} numberOfLines={1}>
              {m.value}
            </T>
            <T size={13} muted>
              {m.note}
            </T>
          </View>
        );
      })}
    </View>
  );
}

/* ---------- Screen ---------- */

function HomeScreen() {
  const router = useRouter();
  const t = useTheme();
  const color = useStatusColor();
  const width = useWindowDimensions().width;
  const phone = width < NAV_BREAKPOINT;
  const desktop = width >= DESKTOP;
  const pad = phone ? 16 : desktop ? 32 : 24;
  const rowPad = phone ? 0 : 16;

  // Period shown: Today (default), This Week (Monday to today), This Month (1st to today) or a Custom Range. All dates are Asia/Kolkata
  // business dates (todayISO). A custom range is applied only when both dates are real and Start is not after End; otherwise nothing is
  // shown for it and the reason is said, never a silently swapped or stale total.
  const [period, setPeriod] = useState<Period>('today');
  const [startInput, setStartInput] = useState(() => todayISO());
  const [endInput, setEndInput] = useState(() => todayISO());
  const realDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  const now = todayISO();
  const weekday = new Date(`${now}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const customError = period !== 'custom' ? null : !realDay(startInput) || !realDay(endInput) ? 'Choose a valid Start Date and End Date.' : startInput > endInput ? 'Start Date cannot be after End Date.' : null;
  const range =
    period === 'today' ? { from: now, to: now }
    : period === 'week' ? { from: addDays(now, -((weekday + 6) % 7)), to: now }
    : period === 'month' ? { from: `${now.slice(0, 8)}01`, to: now }
    : customError ? null : { from: startInput, to: endInput };
  const periodName = period === 'week' ? 'This Week' : period === 'month' ? 'This Month' : range && range.from === range.to ? formatLong(range.from) : range ? periodText(range.from, range.to) : '';
  const isToday = period === 'today';

  const db = useDatabase(); // the period's figures follow the saved bills
  const salesmen = useSalesmen();
  // Salesman bills finalized in the period (saved totals), plus the private bills made in it (their saved totals, never payments).
  const all = range ? salesTotalsBetween(db, range.from, range.to) : { sold: 0, amount: 0, commission: 0, direct: 0 };
  const todaySales = all.amount + all.direct;
  const todayCommission = all.commission;
  // Financial summary for the same period: turnover as above, what was actually paid to suppliers in it, and what is left of the turnover.
  const paidToParties = range ? supplierPaidBetween(db, range.from, range.to) : 0;
  const totalExpenses = range ? expensesBetween(db, range.from, range.to) : 0;
  const balance = Math.round((todaySales - paidToParties - totalExpenses) * 100) / 100;
  const signed = (n: number) => (n < 0 ? `-${rupees(-n)}` : rupees(n));
  // Salesmen card keeps its own meaning: who billed today.
  const today = salesmen.map((s) => ({ s, totals: salesTotals(db, now, s.id) }));

  const products = useProductsWithStock();
  const activity = useRecentActivity(6).map((a) => ({ id: a.id, text: a.text, time: stamp(a.at) }));
  const counts = { healthy: 0, low: 0, out: 0 };
  products.forEach((p) => (counts[productStatus(p)] += 1));
  const attention = products
    .filter((p) => productStatus(p) !== 'healthy')
    .sort((a, b) => STATUS_RANK[productStatus(b)] - STATUS_RANK[productStatus(a)] || a.stock - b.stock);

  const goStock = () => router.navigate('/stock');

  const metrics = [
    { label: `${isToday ? "Today's " : ''}Turnover — ${periodName || 'Custom Range'}`, value: range ? rupees(todaySales) : '—', note: 'Salesman bills and private bills' },
    { label: `${isToday ? "Today's " : ''}Commission — ${periodName || 'Custom Range'}`, value: range ? rupees(todayCommission) : '—', note: 'Payable to salesmen' },
    { label: 'Items', value: String(products.length), note: `${counts.low + counts.out} need attention` },
    { label: 'Salesmen', value: String(salesmen.length), note: `${today.filter((r) => r.totals.sold > 0).length} billed today` },
  ];

  /* Stock overview + attention */
  const stockSection = (
    <Section title="Stock Overview" link="View all stock →" onLink={() => goStock()}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 24, rowGap: 8 }}>
        <T size={15} weight="600">
          {products.length} <T size={14} weight="400" muted>Items</T>
        </T>
        {(['healthy', 'low', 'out'] as StockStatus[]).map((s) => (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color(s) }} />
            <T size={15} weight="600" style={TNUM}>
              {counts[s]}
            </T>
            <T size={14} muted>
              {STATUS_LABEL[s]}
            </T>
          </View>
        ))}
      </View>

      <View>
        <T size={13} weight="600" muted style={{ textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Stock Attention
        </T>
        {attention.length === 0 ? (
          <Empty title="All stock levels are healthy." />
        ) : phone ? (
          <View style={{ borderTopWidth: 1, borderTopColor: t.border }}>
            {attention.map((p) => (
              <View
                key={p.id}
                style={{ paddingVertical: 14, gap: 4, borderBottomWidth: 1, borderBottomColor: t.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <T size={16} weight="600" style={{ flex: 1 }} numberOfLines={1}>
                    {p.name}
                  </T>
                  <Status status={productStatus(p)} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <T size={14} muted>
                    Stock{'  '}
                    <T size={17} weight="600" style={TNUM}>
                      {num(p.stock)}
                    </T>
                  </T>
                  <View style={{ marginRight: -12 }}>
                    <TextAction title="View" label={`View ${p.name}`} onPress={() => goStock()} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View>
            <HeadRow
              pad={rowPad}
              cols={
                <>
                  <Th>Item</Th>
                  <Th width={110} right>
                    Stock
                  </Th>
                  <Th width={150}>Status</Th>
                  <Th width={80} right>
                    Action
                  </Th>
                </>
              }
            />
            {attention.map((p) => (
              <Pressable
                key={p.id}
                accessible={false}
                onPress={() => goStock()}
                style={(s: PState) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: 58,
                  paddingHorizontal: rowPad,
                  gap: 16,
                  backgroundColor: s.hovered ? t.subtle : t.surface,
                  borderBottomWidth: 1,
                  borderBottomColor: t.border,
                })}>
                <T size={15} weight="500" style={{ flex: 1 }} numberOfLines={1}>
                  {p.name}
                </T>
                <T size={16} weight="600" style={[{ width: 110, textAlign: 'right' }, TNUM]}>
                  {num(p.stock)}
                </T>
                <View style={{ width: 150 }}>
                  <Status status={productStatus(p)} />
                </View>
                <View style={{ width: 80, alignItems: 'flex-end', marginRight: -12 }}>
                  <TextAction title="View" label={`View ${p.name}`} onPress={() => goStock()} />
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Section>
  );

  /* Recent activity */
  const activitySection = (
    <Section title="Recent Activity">
      {activity.length === 0 ? (
        <Empty title="No recent activity" note="Received stock and bills will appear here." />
      ) : (
        <View style={{ borderTopWidth: 1, borderTopColor: t.border }}>
          {activity.map((a) => (
            <View
              key={a.id}
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: t.border,
              }}>
              <T size={13} weight="500" muted style={[{ width: 84 }, TNUM]}>
                {a.time}
              </T>
              <T size={15} style={{ flex: 1 }}>
                {a.text}
              </T>
            </View>
          ))}
        </View>
      )}
    </Section>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ alignItems: 'center', paddingTop: phone ? 22 : 40, paddingBottom: 56 }}>
      <View style={{ width: '100%', maxWidth: 1400, paddingHorizontal: pad, gap: phone ? 24 : 36 }}>
        <View style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <T size={phone ? 26 : 30} weight="700" style={{ letterSpacing: -0.6 }}>
              {greeting()}
            </T>
            <T size={15} muted>
              Murlidhar Enterprise · Business overview for {range ? periodText(range.from, range.to) : 'the chosen range'}
            </T>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
            {(
              [
                ['today', 'Today'],
                ['week', 'This Week'],
                ['month', 'This Month'],
                ['custom', 'Custom Range'],
              ] as const
            ).map(([id, label]) => (
              <Btn key={id} title={label} variant={period === id ? 'primary' : 'secondary'} onPress={() => setPeriod(id)} />
            ))}
          </View>
          {period === 'custom' ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
                <DateField label="Start Date" value={startInput} onChange={setStartInput} />
                <DateField label="End Date" value={endInput} onChange={setEndInput} />
              </View>
              {customError ? (
                <T size={13} weight="500" style={{ color: t.danger }}>
                  {customError}
                </T>
              ) : null}
            </View>
          ) : null}
        </View>

        <Metrics items={metrics} columns={phone ? 2 : 4} />
        <Metrics
          columns={phone ? 2 : 4}
          items={[
            { label: `Total Turnover — ${periodName || 'Custom Range'}`, value: range ? rupees(todaySales) : '—', note: 'Salesman bills and private bills' },
            { label: `Total Paid to Parties — ${periodName || 'Custom Range'}`, value: range ? rupees(paidToParties) : '—', note: 'Supplier payments recorded' },
            { label: `Total Expenses — ${periodName || 'Custom Range'}`, value: range ? rupees(totalExpenses) : '—', note: 'Saved expenses by expense date' },
            { label: 'Total Balance Remaining', value: range ? signed(balance) : '—', note: 'Turnover − paid to parties − expenses' },
          ]}
        />

        {desktop ? (
          <>
            <View style={{ flexDirection: 'row', gap: 48, alignItems: 'flex-start' }}>
              <View style={{ flex: 3 }}>{stockSection}</View>
              <View style={{ flex: 2 }}>{activitySection}</View>
            </View>
          </>
        ) : (
          <>
            {stockSection}
            {activitySection}
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function GuardedHomeScreen() {
  return (
    <RequireAccess area="home">
      <HomeScreen />
    </RequireAccess>
  );
}
