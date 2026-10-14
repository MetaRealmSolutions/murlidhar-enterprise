import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { StatusDot, T, useTheme } from '../../../../components/controls';
import { Page, SimpleTable } from '../../../../components/page';
import { useMovementRows, useProductsWithStock, useSalesmanStock, useSalesmen } from '../../../../data/repository';
import { num, rupees } from '../../../../mock/data';
import { STATUS_LABEL, productStatus } from '../../../../mock/stock-status';
import { formatStamp, getStatement, periodText, presetRange } from '../../../../data/statements';

const BACK = { label: 'Reports', href: '/more/reports' } as const;

function TotalStrip({ items }: { items: { label: string; value: string }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 28, paddingTop: 16, borderTopWidth: 2, borderTopColor: t.text }}>
      {items.map((i) => (
        <View key={i.label} style={{ gap: 2 }}>
          <T size={13} muted weight="500">
            {i.label}
          </T>
          <T size={22} weight="700" style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.3 }}>
            {i.value}
          </T>
        </View>
      ))}
    </View>
  );
}

// Tables and totals built from the same mock data as the rest of the app.
export default function ReportScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const t = useTheme();
  const salesmen = useSalesmen();
  const stock = useProductsWithStock();
  const movements = useMovementRows();
  const holdings = useSalesmanStock();
  const month = presetRange('month');
  const monthText = periodText(month.from, month.to);

  const perSalesman = salesmen.map((s) => {
    const days = getStatement(s.id, month.from, month.to).days;
    const lines = days.flatMap((d) => d.lines);
    return {
      id: s.id,
      name: s.name,
      added: lines.reduce((n, l) => n + l.addMore, 0),
      holding: Object.values(holdings[s.id] ?? {}).reduce((n, v) => n + v, 0),
      sold: lines.reduce((n, l) => n + l.sold, 0),
      commission: lines.reduce((n, l) => n + l.totalCommission, 0),
    };
  });

  if (type === 'stock') {
    const color = (p: { stock: number; minimumStock?: number }) => {
      const s = productStatus(p);
      return s === 'healthy' ? t.success : s === 'low' ? t.warning : t.danger;
    };
    return (
      <Page title="Stock Report" subtitle="Current stock of every product." back={BACK}>
        <SimpleTable
          columns={[
            { label: 'Item', render: (p) => p.name, weight: '500' },
            { label: 'Current Stock', width: 150, align: 'right', weight: '600', render: (p) => num(p.stock) },
            {
              label: 'Status',
              width: 150,
              render: (p) => (
                <StatusDot color={color(p)}>
                  <T size={14} weight="500" muted>
                    {STATUS_LABEL[productStatus(p)]}
                  </T>
                </StatusDot>
              ),
            },
          ]}
          rows={stock}
          keyOf={(p) => p.id}
        />
        <TotalStrip items={[{ label: 'Total Stock', value: num(stock.reduce((n, p) => n + p.stock, 0)) }]} />
      </Page>
    );
  }

  if (type === 'salesmen') {
    return (
      <Page title="Salesman Report" subtitle={monthText} back={BACK}>
        <SimpleTable
          columns={[
            { label: 'Salesman', render: (s) => s.name, weight: '500' },
            { label: 'Add More', width: 110, align: 'right', render: (s) => num(s.added) },
            { label: 'Sold', width: 110, align: 'right', render: (s) => num(s.sold) },
            { label: 'Holding Now', width: 140, align: 'right', weight: '600', render: (s) => num(s.holding) },
          ]}
          rows={perSalesman}
          keyOf={(s) => s.id}
        />
      </Page>
    );
  }

  if (type === 'commission') {
    return (
      <Page title="Commission Report" subtitle={monthText} back={BACK}>
        <SimpleTable
          columns={[
            { label: 'Salesman', render: (s) => s.name, weight: '500' },
            { label: 'Sold', width: 110, align: 'right', render: (s) => num(s.sold) },
            { label: 'Commission', width: 160, align: 'right', weight: '600', render: (s) => rupees(s.commission) },
          ]}
          rows={perSalesman}
          keyOf={(s) => s.id}
        />
        <TotalStrip items={[{ label: 'Total Commission', value: rupees(perSalesman.reduce((n, s) => n + s.commission, 0)) }]} />
      </Page>
    );
  }

  return (
    <Page title="Stock History" subtitle="Warehouse stock in and out: receipts, private bills, and salesman sales once confirmed." back={BACK}>
      <SimpleTable
        minWidth={980}
        columns={[
          { label: 'Date', width: 190, render: (m) => formatStamp(m.at) },
          { label: 'Type', width: 130, render: (m) => m.type },
          { label: 'Item', render: (m) => m.product, weight: '500' },
          { label: 'In', width: 70, align: 'right', weight: '600', render: (m) => (m.in ? num(m.in) : '—') },
          { label: 'Out', width: 70, align: 'right', weight: '600', render: (m) => (m.out ? num(m.out) : '—') },
          { label: 'Reference', width: 190, render: (m) => m.ref },
          { label: 'Party / Customer / Salesman', width: 190, render: (m) => m.party || '—' },
          { label: 'By', width: 110, render: (m) => m.by },
        ]}
        rows={movements}
        keyOf={(m) => m.id}
        empty={{ title: 'No movement recorded.' }}
      />
    </Page>
  );
}
