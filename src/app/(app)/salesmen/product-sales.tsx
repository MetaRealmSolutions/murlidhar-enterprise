import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Btn, SearchIcon, T, TextField, useTheme } from '../../../components/controls';
import { Page, SimpleTable, usePageMetrics } from '../../../components/page';
import { PeriodFilter, usePeriodFilter } from '../../../components/period-filter';
import { FilterChip } from '../../../components/payment-status';
import { useDatabase, useSyncState } from '../../../data/db/database';
import { productSales, salesHistory, type DailyRow, type HistoryRow } from '../../../data/product-sales';
import { formatLong, periodText } from '../../../data/statements';
import { num, rupees } from '../../../mock/data';

// The detail history lists at most this many bill lines (a long range with many products can be large); the totals always cover all of them.
const HISTORY_CAP = 300;
// The two ranking tables sit side by side when the page column is at least this wide (measured, so a half-width browser window counts); below it they stack.
const SIDE_BY_SIDE = 820;

/** A searchable multi-select: "All" (nothing chosen) or any number of the options, as chips. */
function ChipPicker({ label, allLabel, options, value, onChange, searchPlaceholder }: { label: string; allLabel: string; options: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; searchPlaceholder: string }) {
  const [q, setQ] = useState('');
  const shown = options.filter((o) => !q.trim() || o.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <View style={{ flex: 1, minWidth: 260, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <T size={14} weight="500">
          {label}
        </T>
        <T size={13} muted>
          {value.length === 0 ? allLabel : `${value.length} selected`}
        </T>
      </View>
      <TextField label="" accessibilityLabel={`Search ${label}`} value={q} onChangeText={setQ} placeholder={searchPlaceholder} leading={<SearchIcon />} autoCorrect={false} autoCapitalize="none" />
      <ScrollView style={{ maxHeight: 116 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <FilterChip label={allLabel} selected={value.length === 0} onPress={() => onChange([])} />
        {shown.map((o) => (
          <FilterChip key={o.id} label={o.name} selected={value.includes(o.id)} onPress={() => onChange(value.includes(o.id) ? value.filter((x) => x !== o.id) : [...value, o.id])} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Product Sales Analysis: units sold, sales amount and commission per product and per salesman for a period, from the FINALIZED salesman
 * bills already loaded (see data/product-sales.ts). Private Bills are not included. The period, the salesmen and the products apply to the
 * summary, both ranking tables and the detail history alike. Tapping a product or salesman row narrows the analysis to it.
 */
export default function ProductSalesScreen() {
  const t = useTheme();
  const { phone } = usePageMetrics();
  const db = useDatabase();
  const sync = useSyncState();
  const period = usePeriodFilter();
  const { range } = period;
  // Empty = everything (the default); otherwise the chosen ids.
  const [chosen, setChosen] = useState<string[]>([]);
  const [who, setWho] = useState<string[]>([]);
  const [boxWidth, setBoxWidth] = useState(0);
  const side = boxWidth >= SIDE_BY_SIDE;
  const products = useMemo(() => db.products.filter((p) => p.active !== false).map((p) => ({ id: p.id, name: p.name })), [db.products]);
  const salesmen = useMemo(() => db.salesmen.map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)), [db.salesmen]);

  const productIds = chosen.length ? chosen : null;
  const salesmanIds = who.length ? who : null;
  const result = useMemo(() => (range ? productSales(db, range.from, range.to, productIds, salesmanIds) : null), [db, range?.from, range?.to, chosen, who]); // eslint-disable-line react-hooks/exhaustive-deps
  // The detail history is for a chosen salesman and/or product (not for "everything", which the ranking tables already cover).
  const detail = chosen.length > 0 || who.length > 0;
  const history = useMemo(() => (range && detail ? salesHistory(db, range.from, range.to, productIds, salesmanIds) : null), [db, range?.from, range?.to, chosen, who, detail]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = period.period !== 'today' || detail;

  const summary = (label: string, value: string) => (
    <View key={label} style={{ flexGrow: 1, flexBasis: phone ? '46%' : 0, minWidth: phone ? 0 : 160, gap: 4, paddingVertical: 4 }}>
      <T size={13} weight="500" muted>
        {label}
      </T>
      <T size={phone ? 22 : 26} weight="700" style={{ letterSpacing: -0.4, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {value}
      </T>
    </View>
  );

  type Row = NonNullable<typeof result>['products'][number];
  const table = (first: string, rows: Row[], onPick: (id: string) => void) => (
    <SimpleTable<Row>
      compact
      minWidth={side ? undefined : phone ? 520 : undefined}
      columns={[
        { label: 'Rank', width: side ? 48 : 64, render: (r) => String(rows.indexOf(r) + 1) },
        { label: first, weight: '500', render: (r) => r.name },
        { label: 'Units Sold', width: side ? 84 : 120, align: 'right', weight: '600', render: (r) => num(r.units) },
        { label: 'Amount', width: side ? 96 : 130, align: 'right', render: (r) => rupees(r.amount) },
        { label: 'Commission', width: side ? 104 : 130, align: 'right', render: (r) => rupees(r.commission) },
      ]}
      rows={rows}
      keyOf={(r) => r.id}
      onRowPress={(r) => onPick(r.id)}
      empty={{ title: period.error ?? 'No sales found.', note: period.error ? undefined : 'Change the period, salesmen or products.' }}
    />
  );

  if (sync.status === 'error') {
    return (
      <Page title="Product Sales Analysis" subtitle="Units, sales and commission by product and salesman.">
        <T style={{ color: t.danger }}>{sync.error ?? 'Unable to load your data.'}</T>
      </Page>
    );
  }
  if (sync.status !== 'ready') {
    return (
      <Page title="Product Sales Analysis" subtitle="Units, sales and commission by product and salesman.">
        <T muted>Loading sales…</T>
      </Page>
    );
  }

  const names = (ids: string[], list: { id: string; name: string }[]) => ids.map((id) => list.find((o) => o.id === id)?.name ?? id).join(', ');
  const scope = [who.length ? names(who, salesmen) : 'All salesmen', chosen.length ? names(chosen, products) : 'all products'].join(' · ');
  const isMonth = period.period === 'month';

  return (
    <Page title="Product Sales Analysis" subtitle={`Finalized salesman bills only · ${range ? periodText(range.from, range.to) : 'choose a valid date range'}`} wide>
      <PeriodFilter f={period} phone={phone} />

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Btn title="Reset Filters" variant="secondary" disabled={!filtered} onPress={() => (period.reset(), setChosen([]), setWho([]))} />
        </View>
        <View style={{ flexDirection: phone ? 'column' : 'row', gap: 16 }}>
          <ChipPicker label="Salesmen" allLabel="All salesmen" options={salesmen} value={who} onChange={setWho} searchPlaceholder="Search salesman..." />
          <ChipPicker label="Products" allLabel="All products" options={products} value={chosen} onChange={setChosen} searchPlaceholder="Search product..." />
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <T size={13} muted numberOfLines={2}>
          Showing: {scope}
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.border }}>
          {summary('Units Sold', num(result?.totals.units ?? 0))}
          {summary('Sales Amount', rupees(result?.totals.amount ?? 0))}
          {summary('Commission', rupees(result?.totals.commission ?? 0))}
        </View>
      </View>

      {/* Product Ranking (left) and Salesman Comparison (right) side by side while the page column is wide enough, else stacked. */}
      <View onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)} style={{ flexDirection: side ? 'row' : 'column', alignItems: side ? 'flex-start' : 'stretch', gap: side ? 16 : 24 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <T size={18} weight="700">
            {who.length === 1 ? `Product Performance — ${names(who, salesmen)}` : 'Product Ranking'}
          </T>
          <T size={13} muted>
            Tap a product to see its daily history.
          </T>
          {table('Product', result?.products ?? [], (id) => setChosen([id]))}
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <T size={18} weight="700">
            Salesman Comparison
          </T>
          <T size={13} muted>
            Tap a salesman to see their daily history.
          </T>
          {table('Salesman', result?.salesmen ?? [], (id) => setWho([id]))}
        </View>
      </View>

      {history ? (
        <>
          <View style={{ gap: 8 }}>
            <T size={18} weight="700">
              {isMonth ? 'Daily Breakdown — This Month' : 'Daily Breakdown'}
            </T>
            <T size={13} muted>
              Per bill date for the selection. Sold = Total − Return; stock given (Add More) is not a sale.
            </T>
            <SimpleTable<DailyRow>
              compact
              minWidth={phone ? 520 : undefined}
              columns={[
                { label: 'Date', width: 170, render: (r) => formatLong(r.date) },
                { label: 'Return', align: 'right', render: (r) => num(r.returned) },
                { label: 'Sold', align: 'right', weight: '600', render: (r) => num(r.sold) },
                { label: 'Amount', align: 'right', render: (r) => rupees(r.amount) },
                { label: 'Commission', align: 'right', render: (r) => rupees(r.commission) },
              ]}
              rows={history.daily}
              keyOf={(r) => r.date}
              foot={{ Date: isMonth ? 'Monthly Total' : 'Total', Return: num(history.totals.returned), Sold: num(history.totals.sold), Amount: rupees(history.totals.amount), Commission: rupees(history.totals.commission) }}
              empty={{ title: period.error ?? 'No bills found.', note: period.error ? undefined : 'No finalized bill matches this selection.' }}
            />
          </View>

          <View style={{ gap: 8 }}>
            <T size={18} weight="700">
              Bill History
            </T>
            <T size={13} muted>
              Newest first, from the saved finalized daily bills. Fillup and Add More are as saved on each bill; only confirmed Returns are shown.{history.rows.length > HISTORY_CAP ? ` Showing the latest ${HISTORY_CAP} of ${history.rows.length} lines; the totals cover all of them.` : ''}
            </T>
            <SimpleTable<HistoryRow>
              compact
              minWidth={1080}
              columns={[
                { label: 'Date', width: 130, render: (r) => formatLong(r.date) },
                { label: 'Salesman', weight: '500', render: (r) => r.salesman },
                { label: 'Product', render: (r) => r.product },
                { label: 'Fillup', width: 64, align: 'right', render: (r) => num(r.fillup) },
                { label: 'Add More', width: 82, align: 'right', render: (r) => num(r.addMore) },
                { label: 'Total', width: 64, align: 'right', render: (r) => num(r.total) },
                { label: 'Return', width: 70, align: 'right', render: (r) => num(r.returned) },
                { label: 'Sold', width: 64, align: 'right', weight: '600', render: (r) => num(r.sold) },
                { label: 'Amount', width: 96, align: 'right', render: (r) => rupees(r.amount) },
                { label: 'Commission', width: 104, align: 'right', render: (r) => rupees(r.commission) },
                { label: 'Status', width: 84, render: () => 'Finalized' },
              ]}
              rows={history.rows.slice(0, HISTORY_CAP)}
              keyOf={(r) => r.key}
              foot={{ Date: 'Total', Return: num(history.totals.returned), Sold: num(history.totals.sold), Amount: rupees(history.totals.amount), Commission: rupees(history.totals.commission) }}
              empty={{ title: period.error ?? 'No bills found.', note: period.error ? undefined : 'No finalized bill matches this selection.' }}
            />
          </View>
        </>
      ) : null}
    </Page>
  );
}
