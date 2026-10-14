import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { BillGrid } from '../../../components/bill-grid';
import { Btn, T, useTheme } from '../../../components/controls';
import { DateField } from '../../../components/date-field';
import { Page, usePageMetrics } from '../../../components/page';
import { SalesmanSelect } from '../../../components/salesman-select';
import { printStatement } from '../../../components/statement-print';
import { friendlyError } from '../../../data/firebase/errors';
import { loadStatement, useSalesmen } from '../../../data/repository';
import { formatLong, todayISO, type Statement, type StatementDay } from '../../../data/statements';
import { num, rupees } from '../../../mock/data';

type Applied = { salesmanId: string; from: string; to: string };

/** The current calendar month, first to last day (yyyy-mm-dd). */
function thisMonth() {
  const today = todayISO();
  const [y, m] = today.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/** One finalized daily bill: product-wise table with a Total row, and its own Print. */
function DayStatement({ day, salesmanName, phone, onPrint }: { day: StatementDay; salesmanName: string; phone: boolean; onPrint: () => void }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <View style={{ gap: 2 }}>
          <T size={17} weight="600">
            {formatLong(day.date)}
          </T>
          <T size={14} muted>
            Salesman: {salesmanName}
          </T>
        </View>
        <Btn title="Print" variant="secondary" onPress={onPrint} />
      </View>
      <BillGrid
        minWidth={phone ? 720 : undefined}
        columns={[
          { label: 'Sr. No.', width: 64, align: 'center' },
          { label: 'Product', flex: 2.4 },
          { label: 'Fillup', flex: 1, align: 'right' },
          { label: 'Return', flex: 1, align: 'right' },
          { label: 'Sold', flex: 1, align: 'right' },
          { label: 'Amount', flex: 1.3, align: 'right' },
          { label: 'Commission', flex: 1.3, align: 'right' },
        ]}
        rows={day.lines.map((l, i) => ({ key: `${i}-${l.product}`, cells: [String(i + 1), l.product, num(l.total), num(l.returned), num(l.sold), rupees(l.totalAmount), rupees(l.totalCommission)] }))}
        foot={{ key: 'total', cells: ['', 'Total', num(day.lines.reduce((s, l) => s + l.total, 0)), num(day.lines.reduce((s, l) => s + l.returned, 0)), num(day.totals.sold), rupees(day.totals.amount), rupees(day.totals.commission)] }}
      />
    </View>
  );
}

export default function SalesmanStatementsScreen() {
  const { phone } = usePageMetrics();
  const t = useTheme();
  const { salesman } = useLocalSearchParams<{ salesman?: string }>();
  const salesmen = useSalesmen();
  const month = thisMonth();
  const [salesmanId, setSalesmanId] = useState<string | null>(salesman ?? null);
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  // Opened for a salesman (from Salesman Master): show this month at once. Otherwise wait for Show Statements.
  const [applied, setApplied] = useState<Applied | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The saved finalized bills for `applied`, read from salesmen/{id}/dailyBills for that range only.
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0); // only the latest request may fill the screen

  const fetchBills = async (a: Applied) => {
    const mine = ++request.current;
    setApplied(a);
    setStatement(null); // never leave the previous salesman's statements on screen while loading
    setLoading(true);
    try {
      const result = await loadStatement(a.salesmanId, a.from, a.to);
      if (mine !== request.current) return;
      setStatement(result);
    } catch (e) {
      if (mine !== request.current) return;
      setError(friendlyError(e, 'Unable to load the statements.'));
    } finally {
      if (mine === request.current) setLoading(false);
    }
  };
  const load = (id: string | null) => {
    if (!id) return setError('Select a salesman.');
    if (!from || !to) return setError('Choose both dates.');
    if (from > to) return setError('From Date cannot be after To Date.');
    setError(null);
    void fetchBills({ salesmanId: id, from, to });
  };
  const show = () => load(salesmanId);
  const pickSalesman = (id: string) => {
    setSalesmanId(id);
    request.current++; // drop anything still loading for the previous salesman
    setApplied(null);
    setStatement(null);
    setLoading(false);
    load(id);
  };
  // Opened for a salesman (from Salesman Master): show this month at once.
  useEffect(() => {
    if (salesman) void fetchBills({ salesmanId: salesman, ...month });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const who = salesmen.find((s) => s.id === applied?.salesmanId);

  return (
    <Page title="Statements" back={{ label: 'List of Bill Entry', href: `/salesmen/previous${salesmanId ? `?salesman=${salesmanId}` : ''}` as never }}>
      <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'flex-end', flexWrap: 'wrap', gap: 14 }}>
        <View style={{ minWidth: phone ? undefined : 300 }}>
          <SalesmanSelect salesmen={salesmen} value={salesmanId} onChange={pickSalesman} />
        </View>
        <DateField label="From Date" value={from} onChange={setFrom} />
        <DateField label="To Date" value={to} onChange={setTo} />
        <Btn title="Show Statements" fill={phone} onPress={show} />
      </View>
      {error ? (
        <T size={13} weight="500" style={{ color: t.danger }}>
          {error}
        </T>
      ) : null}

      {loading ? <T muted>Loading statements…</T> : null}
      {statement && who ? (
        statement.days.length === 0 ? (
          <T muted>No statements found for this date range.</T>
        ) : (
          <View style={{ gap: 28 }}>
            {statement.days.map((day) => (
              <DayStatement
                key={day.date}
                day={day}
                salesmanName={who.name}
                phone={phone}
                onPrint={() => printStatement({ salesmanName: who.name, phone: who.phone, statement: { from: day.date, to: day.date, days: [day], totals: day.totals } })}
              />
            ))}
          </View>
        )
      ) : null}
    </Page>
  );
}
