import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ActivityLog } from '../../../components/activity-log';
import { Btn, T, TextAction, useTheme } from '../../../components/controls';
import { DateField } from '../../../components/date-field';
import { DayBill } from '../../../components/day-bill';
import { EditBill } from '../../../components/edit-bill';
import { Page, SimpleTable, usePageMetrics } from '../../../components/page';
import { SalesmanSelect } from '../../../components/salesman-select';
import { printStatement } from '../../../components/statement-print';
import { useDatabase } from '../../../data/db/database';
import { addDays, billListRows, formatLong, getStatement, todayISO } from '../../../data/statements';
import { rupees } from '../../../mock/data';

/**
 * List of Bill Entry: a date-wise statement of the saved (finalized) daily bills, one row per salesman and business date, all salesmen
 * unless a Party Name (salesman) is chosen. It reads the live salesmen/{id}/dailyBills data the app already listens to, so there is
 * nothing extra to load and no second source of truth. Dates are business dates (yyyy-mm-dd, Asia/Kolkata) compared as text, so month
 * and year boundaries and the browser's timezone make no difference. `?salesman=<id>` pre-selects a party.
 */
export default function ListOfBillEntryScreen() {
  const t = useTheme();
  const router = useRouter();
  const { phone } = usePageMetrics();
  const db = useDatabase();
  const params = useLocalSearchParams<{ salesman?: string; billSalesman?: string; billDate?: string }>();
  // Period: Today (default), This Week (Monday to today), This Month (1st to today) or a Custom Range (From / To Date, which start at today).
  // All dates are Asia/Kolkata business dates (todayISO — never the device's own date); Party Name starts at All parties.
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [from, setFrom] = useState(() => todayISO());
  const [to, setTo] = useState(() => todayISO());
  const [partyId, setPartyId] = useState<string | null>(params.salesman ?? null);
  const isDefault = period === 'today' && partyId === null;
  const reset = () => {
    setPeriod('today');
    setFrom(todayISO());
    setTo(todayISO());
    setPartyId(null);
  };
  // The open bill is part of the address (?billSalesman=<id>&billDate=<yyyy-mm-dd>), so it is a page of its own: browser back / forward and
  // links work, and going back returns to the list with its filters as they were.
  const open = params.billSalesman && params.billDate ? { salesmanId: params.billSalesman, date: params.billDate } : null;
  const [editing, setEditing] = useState(false);

  const bad = /^\d{4}-\d{2}-\d{2}$/;
  const realDay = (v: string) => bad.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  const now = todayISO();
  const weekday = new Date(`${now}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const customError = period !== 'custom' ? null : !realDay(from) || !realDay(to) ? 'Choose a valid From Date and To Date.' : from > to ? 'From Date cannot be after To Date.' : null;
  // The range applied (both ends included). An invalid custom range applies nothing: no rows, and the reason is shown.
  const range =
    period === 'today' ? { from: now, to: now }
    : period === 'week' ? { from: addDays(now, -((weekday + 6) % 7)), to: now }
    : period === 'month' ? { from: `${now.slice(0, 8)}01`, to: now }
    : customError ? null : { from, to };
  const names = useMemo(() => new Map(db.salesmen.map((s) => [s.id, s.name])), [db.salesmen]);
  const salesmen = useMemo(() => db.salesmen.filter((s) => s.active !== false), [db.salesmen]);

  // Saved (finalized) bills only: no rows are made up for missing dates or bills still open. Commission and Amount are the totals saved
  // with the bill (older bills without saved totals use the unit values copied onto their own lines, never today's Item Master prices).
  const rows = useMemo(() => (range ? billListRows(db.settlements, names, partyId, range.from, range.to) : []), [db.settlements, names, partyId, range?.from, range?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  // One bill's detail: the existing read-only bill with Print, the same-day correction (today's bill only) and the stock-given activity.
  if (open) {
    const day = getStatement(open.salesmanId, open.date, open.date, db).days[0];
    const who = db.salesmen.find((s) => s.id === open.salesmanId);
    return (
      <Page title="List of Bill Entry" wide>
        <View style={{ alignSelf: 'flex-start', marginLeft: -12 }}>
          <TextAction
            title="← List of Bill Entry"
            onPress={() => {
              setEditing(false);
              if (router.canGoBack()) router.back();
              else router.replace('/salesmen/previous' as never);
            }}
          />
        </View>
        {day ? (
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <View style={{ gap: 2 }}>
                <T size={17} weight="600">
                  {formatLong(day.date)}
                </T>
                <T size={14} muted>
                  Party: {names.get(open.salesmanId) ?? open.salesmanId}
                </T>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {/* Only today's bill can be corrected; older finalized bills stay read-only. */}
                {day.date === todayISO() ? <Btn title={editing ? 'Close Edit' : 'Edit Bill'} variant="secondary" onPress={() => setEditing((e) => !e)} /> : null}
                <Btn title="Print" variant="secondary" onPress={() => printStatement({ salesmanName: who?.name ?? '', phone: who?.phone ?? '', statement: getStatement(open.salesmanId, day.date, day.date, db) })} />
              </View>
            </View>
            {editing ? <EditBill salesmanId={open.salesmanId} date={day.date} onDone={() => setEditing(false)} /> : <DayBill day={day} />}
          </View>
        ) : (
          <T muted>This bill is no longer available.</T>
        )}
        <ActivityLog salesmanId={open.salesmanId} />
      </Page>
    );
  }

  return (
    <Page title="List of Bill Entry" subtitle={`Saved daily bills, date-wise. ${range ? `Showing ${period === 'today' ? "today's bills" : period === 'week' ? 'this week' : period === 'month' ? 'this month' : `${formatLong(range.from)} – ${formatLong(range.to)}`}.` : 'Choose a valid date range.'}`} wide>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
      <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'flex-end', flexWrap: 'wrap', gap: 14 }}>
        {period === 'custom' ? (
          <>
            <DateField label="From Date" value={from} onChange={setFrom} />
            <DateField label="To Date" value={to} onChange={setTo} />
          </>
        ) : null}
        <View style={{ minWidth: phone ? undefined : 300 }}>
          <SalesmanSelect label="Party Name" allLabel="All parties" salesmen={salesmen} value={partyId} onChange={setPartyId} onClear={() => setPartyId(null)} />
        </View>
        <Btn title="Reset Filters" variant="secondary" fill={phone} disabled={isDefault} onPress={reset} />
      </View>
      {customError ? (
        <T size={13} weight="500" style={{ color: t.danger }}>
          {customError}
        </T>
      ) : null}
      <SimpleTable
        minWidth={760}
        columns={[
          { label: 'Sr. No.', width: 72, render: (r) => String(rows.indexOf(r) + 1) },
          { label: 'Bill No.', render: (r) => r.id },
          { label: 'Date', width: 150, render: (r) => formatLong(r.date) },
          { label: 'Party Name', weight: '500', render: (r) => r.party },
          { label: 'Commission', width: 120, align: 'right', render: (r) => rupees(r.commission) },
          { label: 'Amount', width: 120, align: 'right', weight: '600', render: (r) => rupees(r.amount) },
        ]}
        rows={rows}
        keyOf={(r) => r.id}
        onRowPress={(r) => router.push({ pathname: '/salesmen/previous', params: { billSalesman: r.salesmanId, billDate: r.date } } as never)}
        empty={{ title: 'No bills found.', note: customError ? customError : isDefault ? 'No bill has been finalized today. Choose another period to see earlier bills.' : 'Change the period or the party, or use Reset Filters.' }}
      />
      {/* Totals of exactly the bills listed above (the filtered rows, each bill once); ₹0 when none match. */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', columnGap: phone ? 16 : 32, rowGap: 4, paddingHorizontal: phone ? 12 : 20 }}>
        {(
          [
            ['Total Commission', rows.reduce((n, r) => n + r.commission, 0)],
            ['Total Amount', rows.reduce((n, r) => n + r.amount, 0)],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <T size={14} muted>
              {label}:
            </T>
            <T size={17} weight="700" style={{ fontVariant: ['tabular-nums'] }}>
              {rupees(Math.round(value * 100) / 100)}
            </T>
          </View>
        ))}
      </View>
    </Page>
  );
}
