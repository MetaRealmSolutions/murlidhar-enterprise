import { useMemo, useState, type MutableRefObject } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { NAV_BREAKPOINT } from './app-nav';
import { BillGrid } from './bill-grid';
import { Btn, T, TextField } from './controls';
import { EditBill } from './edit-bill';
import { OpenBill, SPLIT_TODAY_COLUMNS, TODAY_COLUMNS } from './open-bill';
import { printStatement } from './statement-print';
import { TwoUp, useSplit } from './split-bill';
import { useDatabase } from '../data/db/database';
import { billPreview } from '../data/derive';
import { useBills, useProducts, useStocks } from '../data/repository';
import { formatLong, getStatement, todayISO } from '../data/statements';
import { num, rupees } from '../mock/data';

/** Whether the daily bill of `date` is one the app lets the owner work on (stock given, Return): the live bill, or the earlier one waiting for its Return. */
export function useBillDateStatus(salesmanId: string, date: string): 'live' | 'finalized' | 'future' | 'none' {
  const { current, pending } = useBills(salesmanId, date);
  const db = useDatabase();
  if (date === current.date || date === pending?.date) return 'live';
  if (db.settlements.some((s) => s.salesmanId === salesmanId && s.statementDay === date && s.finalized)) return 'finalized';
  return date > todayISO() ? 'future' : 'none';
}

/**
 * A finalized bill in the same table as the entry screen, read-only: EVERY Item Master product in serial order (with the search box), showing
 * what the bill saved. Fillup is the whole holding (carried Return + stock given), so Add More shows 0; a product that was not on the bill
 * shows 0 throughout. Nothing here can be edited; Edit Bill (today's bill only) opens the correction form instead.
 */
function SavedBillTable({ salesmanId, date }: { salesmanId: string; date: string }) {
  const db = useDatabase();
  const catalogue = useProducts();
  const stocks = useStocks();
  const windowWidth = useWindowDimensions().width;
  const split = useSplit();
  const [search, setSearch] = useState('');
  const bill = db.settlements.find((s) => s.salesmanId === salesmanId && s.statementDay === date && s.finalized);
  const query = search.trim().toLowerCase();
  const rows = catalogue.map((p, i) => ({ p, serial: i + 1 })).filter(({ p }) => !query || p.name.toLowerCase().includes(query));
  return (
    <View style={{ gap: 10 }}>
      <TextField label="" value={search} onChangeText={setSearch} placeholder="Search product" accessibilityLabel="Search product" />
      {rows.length === 0 ? (
        <T muted>No matching product.</T>
      ) : (
        <TwoUp
          items={rows}
          render={(list) => (
            <BillGrid
              minWidth={split ? undefined : windowWidth < NAV_BREAKPOINT ? 940 : undefined}
              columns={split ? SPLIT_TODAY_COLUMNS : TODAY_COLUMNS}
              rows={list.map(({ p, serial }) => {
                const l = bill?.lines.find((x) => x.productId === p.id);
                const total = l?.totalAvailableQuantity ?? 0;
                const sold = l?.soldQuantity ?? 0;
                return {
                  key: p.id,
                  cells: [
                    String(serial),
                    <T key="n" size={15} weight="500">
                      {p.name}
                    </T>,
                    num(stocks[p.id] ?? 0),
                    num(total),
                    num(0),
                    num(total),
                    num(l?.returnQuantity ?? 0),
                    num(sold),
                    rupees(sold * (l?.unitAmount ?? 0)),
                    rupees(sold * (l?.unitCommission ?? 0)),
                  ],
                };
              })}
            />
          )}
        />
      )}
    </View>
  );
}

/**
 * Every Item Master product for a date that has no open bill, read-only and computed on the fly (nothing is written, no stock is touched):
 * Fillup carried from the last confirmed Return, Add More 0, Total = Fillup + Add More, Return 0, Sold / Amount / Commission open (—).
 */
function PreviewTable({ salesmanId, date }: { salesmanId: string; date: string }) {
  const db = useDatabase();
  const catalogue = useProducts();
  const stocks = useStocks();
  const windowWidth = useWindowDimensions().width;
  const split = useSplit();
  const [search, setSearch] = useState('');
  const preview = useMemo(() => billPreview(db, salesmanId, date), [db, salesmanId, date]);
  const query = search.trim().toLowerCase();
  const rows = catalogue.map((p, i) => ({ p, serial: i + 1 })).filter(({ p }) => !query || p.name.toLowerCase().includes(query));
  const dash = (k: string) => (
    <T key={k} size={15} muted>
      —
    </T>
  );
  return (
    <View style={{ gap: 10 }}>
      <TextField label="" value={search} onChangeText={setSearch} placeholder="Search product" accessibilityLabel="Search product" />
      {catalogue.length === 0 ? (
        <T muted>No items in the Item Master yet.</T>
      ) : rows.length === 0 ? (
        <T muted>No matching product.</T>
      ) : (
        <TwoUp
          items={rows}
          render={(list) => (
            <BillGrid
              minWidth={split ? undefined : windowWidth < NAV_BREAKPOINT ? 940 : undefined}
              columns={split ? SPLIT_TODAY_COLUMNS : TODAY_COLUMNS}
              rows={list.map(({ p, serial }) => {
                const r = preview[p.id];
                const fillup = r?.fillup ?? 0;
                const add = r?.addMore ?? 0;
                return {
                  key: p.id,
                  cells: [
                    String(serial),
                    <T key="n" size={15} weight="500">
                      {p.name}
                    </T>,
                    num(stocks[p.id] ?? 0),
                    num(fillup),
                    num(add),
                    num(fillup + add),
                    num(0),
                    dash('s'),
                    dash('m'),
                    dash('c'),
                  ],
                };
              })}
            />
          )}
        />
      )}
    </View>
  );
}

/**
 * Bill Entry for the chosen Bill Date. The accounting rules decide what a date allows, so choosing a date never makes a new bill:
 *   - the live bill (or the earlier one waiting for its Return): the normal entry, with Fillup read from the saved bill or, if none is saved yet,
 *     from the previous confirmed Return;
 *   - a finalized bill: every product, read-only, with Edit Bill (correction) while no later bill depends on it;
 *   - any other past date: there is no bill and none can be made;
 *   - any date after the last finalized bill, past or future, is open for stock given and Return.
 */
export function BillEntry({
  salesmanId,
  salesmanName,
  salesmanPhone,
  date,
  dirtyRef,
  editing,
  onEditing,
}: {
  salesmanId: string;
  salesmanName: string;
  salesmanPhone: string;
  date: string;
  dirtyRef: MutableRefObject<boolean>;
  /** Whether the correction form is open. Kept by the page, so the status badge in its header can read EDIT. */
  editing: boolean;
  onEditing: (on: boolean) => void;
}) {
  const status = useBillDateStatus(salesmanId, date);
  const db = useDatabase();

  if (status === 'live') return <OpenBill key={date} salesmanId={salesmanId} salesmanName={salesmanName} date={date} dirtyRef={dirtyRef} />;

  const note = (text: string) => (
    <T muted size={14}>
      {text}
    </T>
  );
  if (status === 'finalized') {
    // Correctable only while nothing later depends on it: no later finalized bill, and no stock given on a later open one.
    const canCorrect = !db.settlements.some((s) => s.salesmanId === salesmanId && s.statementDay > date && (s.finalized || s.lines.some((l) => l.newFillupQuantity > 0)));
    return (
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <T size={17} weight="600">
            Bill Details
          </T>
          {/* Only a bill nothing later depends on can be corrected; others stay read-only. Nothing is editable until this is pressed. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {canCorrect ? <Btn title={editing ? 'Close Edit' : 'Edit Bill'} variant="secondary" onPress={() => onEditing(!editing)} /> : null}
            {/* The saved (finalized) bill only: the same statement print as the Statements page, from the saved figures. */}
            <Btn title="Print" variant="secondary" onPress={() => printStatement({ salesmanName, phone: salesmanPhone, statement: getStatement(salesmanId, date, date, db) })} />
          </View>
        </View>
        {note(editing ? 'Change the quantities below and press Save Changes. Close Edit or Cancel leaves the bill as it was.' : canCorrect ? 'This bill is finalized and read-only. Press Edit Bill to correct it. The corrected Return becomes the next Fillup.' : 'This bill is finalized and read-only. A later bill depends on it, so it can no longer be corrected.')}
        {editing ? <EditBill salesmanId={salesmanId} date={date} onDone={() => onEditing(false)} /> : <SavedBillTable salesmanId={salesmanId} date={date} />}
      </View>
    );
  }

  // No bill is open on this date (on or before the last finalized bill): the full product table is still shown, read-only, so the date never hides it.
  return (
    <View style={{ gap: 12 }}>
      {note('No bill can be started on this date because a bill on or after it is already finalized. The table shows the carried-forward Fillup.')}
      <PreviewTable salesmanId={salesmanId} date={date} />
    </View>
  );
}
