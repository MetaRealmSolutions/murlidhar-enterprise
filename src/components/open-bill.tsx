import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { usePathname } from 'expo-router';
import { Platform, View, useWindowDimensions } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_BREAKPOINT } from './app-nav';
import { FixedBar } from './fixed-bar';
import { TwoUp, useSplit } from './split-bill';
import { BillGrid, CellInput, useCellNav } from './bill-grid';
import { Btn, T, TextField, useTheme } from './controls';
import { Sheet } from './sheet';
import { StockLimitDialog } from './stock-limit-dialog';
import { type Shortage, finalizeBill, finalizeCurrentBill, giveStock, newOperationId, saveOpenBill, savePendingReturns, useBills, useProducts, useStocks, type Product } from '../data/repository';
import { formatLong, todayISO } from '../data/statements';
import { num, rupees } from '../mock/data';

const digits = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 7);
const n = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : 0);

// Two tables side by side from SPLIT_AT up (see split-bill.tsx); below it one wide table, scrolling sideways on phones. Beside each other
// every table is only about half the window, so the SPLIT_* column sets are tighter (same columns, same order) and need no sideways scrolling.
/** Today's bill table: the same columns plus Stock (warehouse stock) right before Fillup. The other bill tables keep COLUMNS. */
export const TODAY_COLUMNS = [
  { label: 'Sr. No.', width: 52, align: 'center' as const },
  { label: 'Product Name', flex: 2.2 },
  { label: 'Stock', width: 62, align: 'right' as const },
  { label: 'Fillup', width: 58, align: 'right' as const },
  { label: 'Add More', width: 80, align: 'right' as const },
  { label: 'Total', width: 58, align: 'right' as const },
  { label: 'Return', width: 80, align: 'right' as const },
  { label: 'Sold', width: 56, align: 'right' as const },
  { label: 'Amount', flex: 1, align: 'right' as const },
  { label: 'Commission', flex: 1, align: 'right' as const },
];

/** The two-table version of TODAY_COLUMNS: the same ten columns, narrower. */
export const SPLIT_TODAY_COLUMNS = [
  { label: 'Sr. No.', width: 40, align: 'center' as const },
  { label: 'Product Name', flex: 1 },
  { label: 'Stock', width: 50, align: 'right' as const },
  { label: 'Fillup', width: 50, align: 'right' as const },
  { label: 'Add More', width: 64, align: 'right' as const },
  { label: 'Total', width: 48, align: 'right' as const },
  { label: 'Return', width: 64, align: 'right' as const },
  { label: 'Sold', width: 46, align: 'right' as const },
  { label: 'Amount', width: 80, align: 'right' as const },
  { label: 'Commission', width: 98, align: 'right' as const },
];

/** The two-table version of COLUMNS (the correction form has no Stock column). */
export const SPLIT_COLUMNS = [
  { label: 'Sr. No.', width: 40, align: 'center' as const },
  { label: 'Product Name', flex: 1 },
  { label: 'Fillup', width: 56, align: 'right' as const },
  { label: 'Add More', width: 64, align: 'right' as const },
  { label: 'Total', width: 48, align: 'right' as const },
  { label: 'Return', width: 64, align: 'right' as const },
  { label: 'Sold', width: 46, align: 'right' as const },
  { label: 'Amount', width: 80, align: 'right' as const },
  { label: 'Commission', width: 98, align: 'right' as const },
];

export const COLUMNS = [
  { label: 'Sr. No.', width: 52, align: 'center' as const },
  { label: 'Product Name', flex: 2.2 },
  { label: 'Fillup', width: 58, align: 'right' as const },
  { label: 'Add More', width: 80, align: 'right' as const },
  { label: 'Total', width: 58, align: 'right' as const },
  { label: 'Return', width: 80, align: 'right' as const },
  { label: 'Sold', width: 56, align: 'right' as const },
  { label: 'Amount', flex: 1, align: 'right' as const },
  { label: 'Commission', flex: 1, align: 'right' as const },
];

/**
 * Bill Entry for one salesman. Two bills are live:
 *
 *  1. The earlier bill WAITING FOR ITS RETURN (if any). The goods came back today, so the owner enters
 *     the Return here; Sold = Total − Return, Amount and Commission follow, and Finalize Bill closes it.
 *  2. TODAY'S bill. Fillup (the previous finalized Return) and Add More make the Total. The Return of the
 *     SAME day is entered when the salesman is back; Sold = Total − Return, then Finalize Bill. That Return
 *     is the next day's Fillup. A bill dated after today has no Return yet.
 */
export function OpenBill({ salesmanId, salesmanName, date, dirtyRef }: { salesmanId: string; salesmanName: string; /** The Bill Date being worked on (see salesmanBills). */ date?: string; /** Kept true while Add More or Return values are typed but not saved (the page asks before changing the Bill Date). */ dirtyRef?: MutableRefObject<boolean> }) {
  const { current, pending } = useBills(salesmanId, date);
  // Remount when the days move on so nothing typed carries over.
  return <Bills key={`${salesmanId}|${current.date}|${pending?.date ?? ''}`} salesmanId={salesmanId} salesmanName={salesmanName} day={date} dirtyRef={dirtyRef} />;
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: color }}>
      <T size={12} weight="700" style={{ color, letterSpacing: 0.6 }}>
        {text}
      </T>
    </View>
  );
}

function Bills({ salesmanId, salesmanName, day, dirtyRef }: { salesmanId: string; salesmanName: string; day?: string; dirtyRef?: MutableRefObject<boolean> }) {
  const t = useTheme();
  const width = useWindowDimensions().width;
  const phone = width < NAV_BREAKPOINT;
  const insets = useSafeAreaInsets();
  const split = useSplit();
  const { current, pending } = useBills(salesmanId, day);
  const catalogue = useProducts(); // already in Item Master order
  const stocks = useStocks();
  const [add, setAdd] = useState<Record<string, string>>({});
  // Returns already saved on the waiting bill come back after a reload.
  const [ret, setRet] = useState<Record<string, string>>(() => Object.fromEntries((pending?.rows ?? []).filter((r) => r.returned !== undefined).map((r) => [r.productId, String(r.returned)])));
  // Today's own Return, typed when the salesman is back (saved drafts come back after a reload).
  const [curRet, setCurRet] = useState<Record<string, string>>(() => Object.fromEntries(current.rows.filter((r) => r.returned !== undefined).map((r) => [r.productId, String(r.returned)])));
  const [error, setError] = useState<string | null>(null);
  const [stockFailed, setStockFailed] = useState(false); // the error belongs to Save Stock Given (for the alert's heading)
  // Save errors open an alert in the middle of the screen so they are seen at once, wherever the page is scrolled.
  const fail = (message: string, stock = false) => {
    setStockFailed(stock);
    setError(message);
  };
  const [busy, setBusy] = useState(false);
  const [stockBusy, setStockBusy] = useState(false);
  const [stockNote, setStockNote] = useState<string | null>(null);
  // Products refused by Save Stock Given for want of allocatable stock: shown in one centred dialog (not in the error state below).
  const [stockLimit, setStockLimit] = useState<Shortage[] | null>(null);
  const [search, setSearch] = useState('');

  // ── Today's bill ──
  const saved = new Map(current.rows.map((r) => [r.productId, r]));
  // Fillup = the Return carried from the previous finalized bill + all the stock given and saved today. Add More is only
  // what is typed for the next save: after a successful Save Stock Given it moves into Fillup and the box is empty again.
  // The bill stores the carried Return and the saved stock given separately, so a refresh restores Fillup without adding anything twice.
  // `current` comes back from Firestore a moment after a save. Until it shows the new amount, `expected` keeps it, so Fillup, Add More
  // and Total change together in the same render instead of Total briefly dropping back to the old Fillup.
  const [expected, setExpected] = useState<Record<string, number>>({});
  const savedAdd = (id: string) => Math.max(saved.get(id)?.addMore ?? 0, expected[id] ?? 0);
  const carriedOf = (id: string) => saved.get(id)?.fillup ?? 0;
  // One table serves both bills. While an earlier bill is waiting for its Return, the table shows THAT bill (Fillup and Add More as saved,
  // only the Return is typed); otherwise it shows the chosen day's bill, where Add More is typed too.
  const pendRows = new Map((pending?.rows ?? []).map((r) => [r.productId, r]));
  const fillupOf = (id: string) => (pending ? (pendRows.get(id)?.fillup ?? 0) : carriedOf(id) + savedAdd(id));
  const typedAdd = (id: string) => n(add[id]);
  const addOf = (id: string) => (pending ? (pendRows.get(id)?.addMore ?? 0) : typedAdd(id));
  const totalOf = (id: string) => fillupOf(id) + addOf(id);
  // What the bill already holds as stock given, per item (used when only a Return draft is saved).
  const addMap = () => Object.fromEntries(catalogue.filter((p) => saved.has(p.id)).map((p) => [p.id, savedAdd(p.id)]));
  // The Return of any open bill can be entered and confirmed, whatever its date (the books only allow it where they stay in order, see
  // salesmanBills), past or future.
  const returnsDue = true;
  // The Return column is typed directly in the table whenever the bill is open and due; nothing has to be opened first. An untouched box is 0.
  const returnsOpen = returnsDue;
  const retMap = pending ? ret : curRet;
  const setRetMap = pending ? setRet : setCurRet;
  const curEntered = (id: string) => retMap[id] !== undefined && retMap[id] !== '';
  // Per-product activation of the Sold / Amount / Commission preview (by product id), kept apart from the typed Return itself. A row's preview
  // stays blank until Enter is pressed in ITS Return box (focusing or typing alone does not show it), then follows the quantities. It is
  // temporary screen state only: leaving the bill or the date discards it, and nothing here is saved.
  const [live, setLive] = useState<Record<string, boolean>>({});
  const activeOf = (id: string) => !!live[id];
  const activate = (id: string) => setLive((x) => (x[id] ? x : { ...x, [id]: true }));
  // Sold of a row as the preview shows it: Total − Return once active (an empty Return counts as 0), otherwise 0.
  const soldOf = (id: string) => (activeOf(id) ? Math.max(0, totalOf(id) - retOf(id)) : 0);
  const retOf = (id: string) => n(retMap[id]);
  const curDraft = () => Object.fromEntries(catalogue.filter((p) => returnsOpen && totalOf(p.id) > 0 && curEntered(p.id) && retOf(p.id) <= totalOf(p.id)).map((p) => [p.id, retOf(p.id)]));
  // Saves the bill's Return drafts (stock given is saved by giveStockNow, never here).
  const persistToday = async () => {
    const r = pending ? await savePendingReturns(salesmanId, curDraft(), day) : await saveOpenBill(salesmanId, addMap(), curDraft(), day);
    if (!r.ok) fail(r.error);
    return r.ok;
  };
  // One stock-given operation = one unique id. A retry of the same quantities (after a dropped connection or a double click)
  // reuses the id, so the server adds them only once.
  // Forget an expected amount once the bill from Firestore has caught up with it.
  useEffect(() => {
    setExpected((e) => {
      const left = Object.entries(e).filter(([id, v]) => (saved.get(id)?.addMore ?? 0) < v);
      return left.length === Object.keys(e).length ? e : Object.fromEntries(left);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
  const operation = useRef<{ key: string; id: string } | null>(null);
  const giveStockNow = async (ids: string[]) => {
    const items = Object.fromEntries(ids.map((id) => [id, typedAdd(id)]));
    const key = JSON.stringify(items);
    if (operation.current?.key !== key) operation.current = { key, id: newOperationId() };
    const r = await giveStock(salesmanId, items, operation.current.id, day);
    if (!r.ok) {
      // Not enough allocatable stock: giveStock turns the NotEnoughStock class of giveStockTransaction into structured `shortages`. They open the
      // dialog and never the error state, so the error is shown once. Nothing was saved and the typed quantities stay for correcting.
      if (r.shortages?.length) setStockLimit(r.shortages);
      else fail(r.error, true);
      return false;
    }
    operation.current = null;
    // Fillup (saved amount) and Add More (typed) change in this one update.
    setExpected((e) => ({ ...e, ...Object.fromEntries(ids.map((id) => [id, savedAdd(id) + items[id]])) }));
    setAdd((a) => Object.fromEntries(Object.entries(a).filter(([id]) => !ids.includes(id))));
    return true;
  };
  // Add More inputs by product, so Enter can move to the next one.
  const nav = useCellNav();
  const typed = () => catalogue.filter((p) => typedAdd(p.id) > 0).map((p) => p.id);
  // Something to save: at least one Add More above zero (Fillup alone is not stock given).
  const hasStock = catalogue.some((p) => typedAdd(p.id) > 0);
  const onBill = catalogue.filter((p) => totalOf(p.id) > 0);
  // Unsaved work = Add More typed but not saved, or a Return typed that differs from the saved draft. Reported so the page can ask before the Bill Date changes.
  const unsaved =
    hasStock ||
    Object.entries(retMap).some(([id, v]) => v !== '' && (pending ? pendRows : saved).get(id)?.returned !== n(v));
  useEffect(() => {
    if (dirtyRef) dirtyRef.current = unsaved;
  }, [dirtyRef, unsaved]);
  useEffect(
    () => () => {
      if (dirtyRef) dirtyRef.current = false;
    },
    [dirtyRef],
  );
  // Return boxes by product, so Enter can move down the column. A row with nothing held has no box, so it is skipped by itself.
  // Enter moves down the SAME column: Add More to the next product's Add More, Return to the next product's Return, in Item Master order
  // (left table, then right). A row without a box for that column is skipped; after the last one the box just loses focus.
  const navOrder = (field: 'add' | 'ret') => matches.map((x) => `${x.id}:${field}`);
  // Every Return is a whole number from 0 up to that product's Total (digits only are accepted while typing).
  const overItems = onBill.filter((p) => retOf(p.id) > totalOf(p.id));
  const returnValid = returnsOpen && onBill.length > 0 && overItems.length === 0;
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  // Confirms every Add More typed so far in one go. Only the stock given is saved: no Return, Sold or Amount, and no warehouse change.
  const saveStockGiven = async () => {
    if (stockBusy || !hasStock) return;
    setStockBusy(true);
    setError(null);
    setStockNote(null);
    const ok = await giveStockNow(typed());
    setStockBusy(false);
    if (ok) setStockNote('Stock given saved.');
  };
  // Save Return step 1: check everything and, if it is fine, show what Sold / Amount / Commission will be before confirming.
  const saveReturn = () => {
    if (busy || !returnsOpen) return;
    // Stock typed in Add More but not saved would make the Total stale: it has to be saved first (its own safe, retry-proof operation).
    if (hasStock) return fail('Save Stock Given before saving the Return.');
    if (onBill.length === 0) return fail('There is nothing on this bill to return.');
    const bad = overItems[0];
    if (bad) return fail(`The Return for ${bad.name} (${retOf(bad.id)}) is more than its Total (${totalOf(bad.id)}). Enter 0 up to ${totalOf(bad.id)}.`);
    setError(null);
    setConfirmingReturn(true);
  };
  // Step 2: confirm. The existing transaction finalizes the bill once: Sold = Total − Return, Amount and Commission, warehouse stock and allocation.
  const finalizeToday = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // An earlier bill is confirmed for every row it holds (also a product since removed from the Item Master); today's for the products on it.
    const returns = Object.fromEntries((pending ? pending.rows.map((r) => r.productId) : onBill.map((p) => p.id)).map((id) => [id, retOf(id)]));
    const r = pending ? await finalizeBill(salesmanId, returns, day) : await finalizeCurrentBill(salesmanId, addMap(), returns, day);
    setBusy(false);
    setConfirmingReturn(false);
    if (!r.ok) fail(r.error);
  };
  // What the confirmation will work out (shown before it is saved; the saved figures are computed by the transaction): every row, since an untouched
  // Return is saved as 0. A row whose Return is over its Total has no valid Sold and is left out (the table flags it) until corrected.
  const sumOf = (sold: (id: string) => number) => onBill.filter((p) => retOf(p.id) <= totalOf(p.id)).reduce((s, p) => ({ sold: s.sold + sold(p.id), amount: s.amount + sold(p.id) * p.amount, commission: s.commission + sold(p.id) * p.commission }), { sold: 0, amount: 0, commission: 0 });
  const preview = sumOf((id) => totalOf(id) - retOf(id));
  // The footer follows the table: only rows whose Return has been touched count.
  const liveTotals = sumOf(soldOf);

  const position = new Map(catalogue.map((p, i) => [p.id, i + 1]));

  // Current Holding: every Item Master product (catalogue order = serial order), narrowed only by the search box.
  const query = search.trim().toLowerCase();
  const matches = catalogue.filter((p) => !query || p.name.toLowerCase().includes(query));

  // Return, Sold, Amount and Commission of one row of the bill of the day. Locked (—) until its Return is due and entered.
  const returnCells = (p: Product) => {
    const total = totalOf(p.id);
    const dash = (k: string) => (
      <T key={k} size={15} muted>
        —
      </T>
    );
    // Not open for a Return (not used while every date is open).
    if (!returnsOpen) return [dash('r'), dash('s'), dash('m'), dash('c')];
    // Nothing held: the Return is 0 and cannot be anything else.
    if (total <= 0) return [<T key="r0" size={15}>{num(0)}</T>, '', '', ''];
    const tooMuch = retOf(p.id) > total;
    return [
      <CellInput
        key="r"
        label={`Return for ${p.name}`}
        value={retMap[p.id] ?? '0'}
        placeholder="0"
        width={split ? 48 : 64}
        onChangeText={(v) => {
          // Digits only, no leading zero (typing over the 0 gives 5, not 05).
          setRetMap((x) => ({ ...x, [p.id]: digits(v).replace(/^0+(?=\d)/, '') }));
          setError(null);
        }}
        inputRef={nav.ref(`${p.id}:ret`)}
        // Enter only moves to the next editable Return (Item Master order, as listed). It never saves, confirms or submits anything.
        onSubmit={() => {
          activate(p.id); // Enter shows this row's preview (an empty Return counts as 0); it saves nothing
          nav.next(`${p.id}:ret`, navOrder('ret'));
        }}
        onBlur={() => {
          // Left empty: back to 0. A typed Return is kept on the bill as a draft (no Sold yet), so a reload brings it back.
          if (retMap[p.id] === '') setRetMap((x) => ({ ...x, [p.id]: '0' }));
          if (retMap[p.id] !== undefined) persistToday();
        }}
      />,
      // Live preview while typing (Sold = Total − Return, Amount and Commission from the Item Master). Nothing is saved by this; the
      // confirmed figures are computed by the Confirm Return transaction. Over the Total there is no valid Sold.
      // Blank (not calculated) until Enter is pressed in this row's Return box.
      !activeOf(p.id) ? (
        ''
      ) : tooMuch ? (
        <T key="s" size={11} style={{ color: t.danger }}>
          Over
        </T>
      ) : (
        num(soldOf(p.id))
      ),
      !activeOf(p.id) ? '' : tooMuch ? dash('m') : rupees(soldOf(p.id) * p.amount),
      !activeOf(p.id) ? '' : tooMuch ? dash('c') : rupees(soldOf(p.id) * p.commission),
    ];
  };

  // The bill of the day: Fillup + Add More = Total; its Return is entered when the salesman is back.
  const todayTable = (list: Product[]) => (
    <BillGrid
      minWidth={split ? undefined : 940}
      columns={split ? SPLIT_TODAY_COLUMNS : TODAY_COLUMNS}
      rows={list.map((p) => ({
        key: p.id,
        cells: [
          String(position.get(p.id) ?? ''),
          <T key="n" size={15} weight="500">
            {p.name}
          </T>,
          // Live warehouse stock (the same figure as the Stock page). Giving stock does not lower it.
          num(stocks[p.id] ?? 0),
          num(fillupOf(p.id)),
          pending ? (
            num(addOf(p.id))
          ) : (
            <CellInput
              key="a"
              label={`Add More for ${p.name}`}
              // Every Add More starts at 0 (a product with no typed value shows 0, also after a successful save, a reload or another salesman).
              value={add[p.id] ?? '0'}
              placeholder="0"
              width={split ? 48 : 64}
              // Emptied and left: back to 0, so the box is never blank. A leading zero is dropped, so typing over the 0 gives 5, not 05.
              onBlur={() => {
                if ((add[p.id] ?? '0') === '') setAdd((a) => ({ ...a, [p.id]: '0' }));
              }}
              onChangeText={(v) => {
                setAdd((a) => ({ ...a, [p.id]: digits(v).replace(/^0+(?=\d)/, '') }));
                setStockNote(null);
                setError(null);
              }}
              inputRef={nav.ref(`${p.id}:add`)}
              // Enter only moves focus on; nothing is saved until Save Stock Given.
              onSubmit={() => nav.next(`${p.id}:add`, navOrder('add'))}
            />
          ),
          num(totalOf(p.id)),
          ...returnCells(p),
        ],
      }))}
    />
  );
  // One layout for Current Holding and the full product list: two balanced tables side by side from SPLIT_AT up, one below it.
  const laidOut = (list: Product[]) => <TwoUp items={list} render={todayTable} />;


  const footStat = (label: string, value: string) => (
    <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <T size={phone ? 13 : 14} muted>
        {label}:
      </T>
      <T size={phone ? 15 : 17} weight="700" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
    </View>
  );

  const stat = (label: string, value: string, strong?: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <T size={14} muted>
        {label}
      </T>
      <T size={strong ? 22 : 18} weight={strong ? '700' : '600'} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
    </View>
  );

  // The sticky Save Return / Save Stock Given bar, shown while the bill of the day has goods on it and its Return is due, or Add More is typed.
  // It is drawn into <body> (see FixedBar), so it would outlive this screen: the tab navigator keeps /salesmen mounted while another page is open.
  // Showing it only while the current route is exactly /salesmen keeps it off Private Bill, Stock, Statements and every other page, also on back / forward.
  const onSalesmen = usePathname() === '/salesmen';
  const actionBar = onSalesmen && ((returnsDue && onBill.length > 0) || hasStock);

  return (
    <View style={{ gap: 28, paddingBottom: actionBar ? 80 : 0 }}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 6 }}>
          <T size={17} weight="600">
            Current Holding
          </T>
          {pending ? (
            <>
              <T size={14} muted>
                {formatLong(pending.date)}
              </T>
              <Tag text="WAITING FOR RETURN" color={t.warning} />
            </>
          ) : null}
        </View>
        {catalogue.length === 0 ? (
          <T muted>No items in the Item Master yet.</T>
        ) : (
          // Every Item Master product, in serial order, with its Fillup (0 when nothing is carried): nothing to open or pick first.
          <View style={{ gap: 10 }}>
            <TextField label="" value={search} onChangeText={setSearch} placeholder="Search product" accessibilityLabel="Search product" />
            {overItems.length > 0 ? (
              <T size={13} weight="500" style={{ color: t.danger }}>
                Return cannot be more than Total: {overItems.map((p) => `${p.name} (Return ${retOf(p.id)}, Total ${totalOf(p.id)})`).join('; ')}. This bill cannot be saved until it is corrected.
              </T>
            ) : null}
            {matches.length === 0 ? <T muted>No matching product.</T> : laidOut(matches)}
          </View>
        )}
      </View>

      {confirmingReturn ? (
        <Sheet title="Save Return?" onClose={() => (busy ? undefined : setConfirmingReturn(false))}>
          <View style={{ padding: 20, gap: 12 }}>
            <T size={15}>This confirms the Return and finalizes the bill for {formatLong((pending ?? current).date)}. It cannot be undone here (only a correction is available afterwards, while no later bill depends on it).</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 6 }}>
              {stat('Total Sold', num(preview.sold))}
              {stat('Amount', rupees(preview.amount))}
              {stat('Commission', rupees(preview.commission))}
            </View>
            <T size={13} muted>
              Sold = Total − Return for each item. The Return becomes the next Fillup, and warehouse stock and the salesman allocation are updated once.
            </T>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Btn title="Back" variant="secondary" disabled={busy} onPress={() => setConfirmingReturn(false)} />
              <Btn title={busy ? 'Saving…' : 'Confirm Return'} disabled={busy} onPress={finalizeToday} />
            </View>
          </View>
        </Sheet>
      ) : null}

      {stockLimit ? <StockLimitDialog shortages={stockLimit} onClose={() => setStockLimit(null)} /> : null}

      {error ? (
        <Sheet title={stockFailed ? 'Cannot Save Stock' : 'Cannot Save'} onClose={() => setError(null)}>
          <View style={{ padding: 20, gap: 16 }}>
            <T size={15}>{error}</T>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Btn title="OK" onPress={() => setError(null)} />
            </View>
          </View>
        </Sheet>
      ) : null}

      {actionBar ? (
        <FixedBar bottom={phone ? 58 + insets.bottom : 0}>
        <View
          style={[
            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingHorizontal: phone ? 16 : 24, paddingVertical: 10, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border },
            Platform.OS === 'web' ? ({ boxShadow: '0 -2px 8px rgba(17,24,39,0.08)' } as object) : null,
          ]}>
          {returnsDue && onBill.length > 0 ? <Btn title={busy ? 'Saving…' : 'Save Return'} variant="secondary" disabled={busy || !returnValid} onPress={saveReturn} /> : <View />}
          {/* Live preview of the bill as typed (same figures as the table); nothing here is saved. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'center', columnGap: phone ? 12 : 24, rowGap: 2, flexShrink: 1 }}>
            {footStat('Total Commission', rupees(liveTotals.commission))}
            {footStat('Total Amount', rupees(liveTotals.amount))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
            {stockNote ? (
              <T size={13} weight="500" style={{ color: t.success }}>
                {stockNote}
              </T>
            ) : null}
            <Btn title={stockBusy ? 'Saving…' : 'Save Stock Given'} disabled={stockBusy || !hasStock} onPress={saveStockGiven} />
          </View>
        </View>
        </FixedBar>
      ) : null}
    </View>
  );
}
