import { useState } from 'react';
import { usePathname } from 'expo-router';
import { Platform, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_BREAKPOINT } from './app-nav';
import { BillGrid, CellInput, useCellNav } from './bill-grid';
import { Btn, T, TextField, useTheme } from './controls';
import { FixedBar } from './fixed-bar';
import { StockLimitDialog } from './stock-limit-dialog';
import { SPLIT_TODAY_COLUMNS, TODAY_COLUMNS } from './open-bill';
import { TwoUp, useSplit } from './split-bill';
import { useDatabase } from '../data/db/database';
import { correctTodayBill, useStocks, type Shortage } from '../data/repository';
import { num, rupees } from '../mock/data';

const digits = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 7);
const n = (v: string) => (v && /^\d+$/.test(v) ? Number(v) : 0);

/**
 * Corrects TODAY's finalized bill in the same bill table, with EVERY Item Master product listed (in serial order, with the search box).
 * Fillup is what the bill carried; Add More and Return can be changed, and Sold, Amount and Commission are shown as they will be once the
 * changes are saved. Products that were not on the bill start at 0. Nothing is written until Save Changes; Cancel leaves the bill as it was.
 */
export function EditBill({ salesmanId, date, onDone }: { salesmanId: string; date: string; onDone: () => void }) {
  const t = useTheme();
  const phone = useWindowDimensions().width < NAV_BREAKPOINT;
  const split = useSplit();
  const insets = useSafeAreaInsets();
  const nav = useCellNav();
  // Like the bill-entry bar: drawn into <body>, so it is shown only while /salesmen is the open route (the tab navigator keeps it mounted).
  const onSalesmen = usePathname() === '/salesmen';
  const db = useDatabase();
  const stocks = useStocks(); // live warehouse stock, read-only
  const bill = db.settlements.find((s) => s.salesmanId === salesmanId && s.statementDay === date && s.finalized);
  // Active Item Master products in serial order.
  const products = db.products.filter((p) => p.active);
  const line = (id: string) => bill?.lines.find((l) => l.productId === id);
  const [fill, setFill] = useState<Record<string, string>>(() => Object.fromEntries(products.map((p) => [p.id, String(line(p.id)?.carriedOpeningQuantity ?? 0)])));
  const [add, setAdd] = useState<Record<string, string>>(() => Object.fromEntries(products.map((p) => [p.id, String(line(p.id)?.newFillupQuantity ?? 0)])));
  const [ret, setRet] = useState<Record<string, string>>(() => Object.fromEntries(products.map((p) => [p.id, String(line(p.id)?.returnQuantity ?? 0)])));
  // Per-product activation of the Sold / Amount / Commission preview (by product id): products already on the finalized bill show their saved
  // figures from the start (confirmed values); any other row stays blank until Enter is pressed in its Return box. Nothing here is saved, and
  // Cancel / leaving discards it.
  const [live, setLive] = useState<Record<string, boolean>>(() => Object.fromEntries(products.filter((p) => line(p.id)).map((p) => [p.id, true])));
  const activate = (id: string) => setLive((x) => (x[id] ? x : { ...x, [id]: true }));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Products whose raised Fillup / Add More does not fit the allocatable stock: one centred dialog, not the red error text.
  const [stockLimit, setStockLimit] = useState<Shortage[] | null>(null);
  if (!bill) return null;

  const calc = (productId: string) => {
    const total = n(fill[productId] ?? '') + n(add[productId] ?? '');
    const r = n(ret[productId] ?? '');
    return { total, r, over: r > total, sold: live[productId] ? total - r : 0 };
  };
  const invalid = products.some((p) => calc(p.id).over || (fill[p.id] ?? '') === '' || (ret[p.id] ?? '') === '' || (add[p.id] ?? '') === '');
  const query = search.trim().toLowerCase();
  const shown = products.map((p, i) => ({ p, serial: i + 1 })).filter(({ p }) => !query || p.name.toLowerCase().includes(query));
  // Enter moves down the SAME column (Fillup, Add More or Return) to the next product's box, in table order (left table, then right). After the
  // last box of the column it only loses focus: it never jumps to another column or saves anything.
  const navOrder = (field: string) => shown.map(({ p }) => `${p.id}:${field}`);

  const save = async () => {
    if (busy || invalid) return;
    setBusy(true);
    setError(null);
    const r = await correctTodayBill(
      salesmanId,
      Object.fromEntries(products.map((p) => [p.id, n(add[p.id] ?? '')])),
      Object.fromEntries(products.map((p) => [p.id, n(ret[p.id] ?? '')])),
      Object.fromEntries(products.map((p) => [p.id, n(fill[p.id] ?? '')])),
      date,
    );
    setBusy(false);
    if (r.ok) onDone();
    else if (r.shortages?.length) setStockLimit(r.shortages);
    else setError(r.error);
  };

  // Editable box for one number; a row can be changed freely, an emptied box counts as invalid until it has a number.
  const box = (state: Record<string, string>, set: (f: (x: Record<string, string>) => Record<string, string>) => void, label: string, id: string, name: string, width: number, field: string) => (
    <CellInput
      key={label}
      label={`${label} for ${name}`}
      value={state[id] ?? ''}
      placeholder="0"
      width={width}
      inputRef={nav.ref(`${id}:${field}`)}
      onSubmit={() => {
        if (field === 'ret') activate(id); // Enter shows this row's preview (an empty Return counts as 0); it saves nothing
        nav.next(`${id}:${field}`, navOrder(field));
      }}
      onChangeText={(v) => (set((x) => ({ ...x, [id]: digits(v).replace(/^0+(?=\d)/, '') })), setError(null))}
    />
  );

  return (
    <View style={{ gap: 12, paddingBottom: 80 }}>
      <T size={13} muted>
        Correct Fillup, Add More and Return for today's bill. Sold, Amount and Commission follow, and warehouse stock is adjusted by the change in Sold. Tomorrow's Fillup follows the corrected Return. Nothing is saved until you press Save Changes.
      </T>
      <TextField label="" value={search} onChangeText={setSearch} placeholder="Search product" accessibilityLabel="Search product" />
      {shown.length === 0 ? (
        <T muted>No matching product.</T>
      ) : (
        <TwoUp
          items={shown}
          render={(list) => (
            <BillGrid
              minWidth={split ? undefined : phone ? 940 : undefined}
              columns={split ? SPLIT_TODAY_COLUMNS : TODAY_COLUMNS}
              rows={list.map(({ p, serial }) => {
                const c = calc(p.id);
                return {
                  key: p.id,
                  cells: [
                    String(serial),
                    <T key="n" size={15} weight="500">
                      {p.name}
                    </T>,
                    num(stocks[p.id] ?? 0),
                    box(fill, setFill, 'Fillup', p.id, p.name, split ? 40 : 52, 'fill'),
                    box(add, setAdd, 'Add More', p.id, p.name, split ? 48 : 64, 'add'),
                    num(c.total),
                    box(ret, setRet, 'Return', p.id, p.name, split ? 48 : 64, 'ret'),
                    // Blank (not calculated) until Enter is pressed in this row's Return box (rows already on the saved bill show their saved figures).
                    !live[p.id] ? (
                      ''
                    ) : c.over ? (
                      <T key="s" size={11} style={{ color: t.danger }}>
                        Over
                      </T>
                    ) : (
                      num(c.sold)
                    ),
                    !live[p.id] ? '' : c.over ? '—' : rupees(c.sold * p.amount),
                    !live[p.id] ? '' : c.over ? '—' : rupees(c.sold * p.commission),
                  ],
                };
              })}
            />
          )}
        />
      )}
      {stockLimit ? <StockLimitDialog shortages={stockLimit} onClose={() => setStockLimit(null)} /> : null}
      {error ? (
        <T size={13} weight="500" style={{ color: t.danger }}>
          {error}
        </T>
      ) : null}
      {onSalesmen ? (
        <FixedBar bottom={phone ? 58 + insets.bottom : 0}>
          <View
            style={[
              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: phone ? 16 : 24, paddingVertical: 10, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border },
              Platform.OS === 'web' ? ({ boxShadow: '0 -2px 8px rgba(17,24,39,0.08)' } as object) : null,
            ]}>
            <Btn title="Cancel" variant="secondary" disabled={busy} onPress={onDone} />
            <Btn title={busy ? 'Saving…' : 'Save Changes'} disabled={busy || invalid} onPress={save} />
          </View>
        </FixedBar>
      ) : null}
    </View>
  );
}
