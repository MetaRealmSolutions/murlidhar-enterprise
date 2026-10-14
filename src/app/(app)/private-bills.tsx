import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RequireAccess } from '../../components/require-access';
import { Pressable, View, useWindowDimensions, type TextInput } from 'react-native';

import { NAV_BREAKPOINT } from '../../components/app-nav';
import { BillGrid, CellInput } from '../../components/bill-grid';
import { Btn, SearchIcon, T, TextAction, TextField, useTheme } from '../../components/controls';
import { Page, SimpleTable, usePageMetrics } from '../../components/page';
import { PeriodFilter, usePeriodFilter } from '../../components/period-filter';
import { printPrivateBill } from '../../components/statement-print';
import { FilterChip, PaymentBadge, remainingTone } from '../../components/payment-status';
import type { PaymentStatus } from '../../data/db/schema';
import { billPayment, customerLastRates, customerSuggestions, editDirectBill, newBillSubmissionId, newPaymentSubmissionId, paymentHistory, paymentOf, recordDirectBillPayment, saveDirectBill, useDirectBillPayments, useDirectBills, useProductsWithStock, type DirectBill } from '../../data/repository';
import { formatLong, formatTime, localDate } from '../../data/statements';
import { num, rupees } from '../../mock/data';

const digits = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 7);
const cents = (n: number) => Math.round(n * 100) / 100;
const money = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 9);

// Two item tables side by side from this width up; one table below it.
const TWO_COLUMNS = 980;

const COLUMNS = [
  { label: 'Sr. No.', width: 70, align: 'center' as const },
  { label: 'Product Name', flex: 3 },
  { label: 'Qty', flex: 1, align: 'right' as const },
  { label: 'Rate', flex: 1.2, align: 'right' as const },
  { label: 'Total', flex: 1.4, align: 'right' as const },
];

/** Customer, date and time of a bill, laid out like the manual bill. */
function BillHead({ name, phone, at }: { name: string; phone: string; at: string }) {
  const item = (label: string, value: string) => (
    <View style={{ minWidth: 160, gap: 2 }}>
      <T size={12} weight="600" muted style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </T>
      <T size={16} weight="500">
        {value}
      </T>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 32, rowGap: 12 }}>
      {item('Customer Name', name || '—')}
      {item('Customer Mobile', phone || '—')}
      {item('Date', formatLong(localDate(at)))}
      {item('Time', formatTime(at))}
    </View>
  );
}

const when = (at: string) => `${formatLong(localDate(at))}, ${formatTime(at)}`;

/** Payments of one saved bill: where it stands, Record Payment (until fully paid), and every payment received, newest first. */
function PaymentPanel({ bill, pay, phone }: { bill: DirectBill; pay: ReturnType<typeof billPayment>; phone: boolean }) {
  const t = useTheme();
  const history = paymentHistory(bill, useDirectBillPayments());
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One id per submission of THIS payment: pressing Record again, or retrying after an error, reuses it, so it is recorded once.
  const submission = useRef<{ key: string; id: string } | null>(null);

  const entered = Math.round((Number(amount) || 0) * 100) / 100;
  const tooMuch = entered > pay.remaining;
  const record = async () => {
    if (saving) return;
    if (entered <= 0) return setError('Enter a payment above 0.');
    if (tooMuch) return setError(`Payment cannot be more than the remaining balance of ${rupees(pay.remaining)}.`);
    setSaving(true);
    const key = `${bill.id}|${entered}`;
    if (submission.current?.key !== key) submission.current = { key, id: newPaymentSubmissionId() };
    const r = await recordDirectBillPayment(bill.id, entered, submission.current.id);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    submission.current = null;
    setAmount('');
    setError(null);
  };

  // Four equal cards: one row on desktop, a 2 x 2 grid on a phone. Remaining carries the payment colour.
  const tone = remainingTone(pay.remaining, pay.paid);
  const card = (label: string, content: ReactNode, accent?: boolean) => (
    <View
      key={label}
      style={{
        flexGrow: 1,
        flexBasis: phone ? '46%' : 0,
        minWidth: phone ? 0 : 150,
        gap: 6,
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: accent ? tone.border : t.border,
        backgroundColor: accent ? tone.bg : t.surface,
      }}>
      <T size={12} weight="600" muted style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </T>
      {content}
    </View>
  );
  const figure = (value: string, color?: string) => (
    <T size={phone ? 18 : 22} weight="700" style={[{ fontVariant: ['tabular-nums'] }, color ? { color } : null]}>
      {value}
    </T>
  );
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {card('Bill Total', figure(rupees(bill.total)))}
        {card('Total Paid', figure(rupees(pay.paid)))}
        {card('Remaining', figure(rupees(pay.remaining), tone.fg), true)}
        {card('Payment Status', <View style={{ minHeight: phone ? 27 : 33, justifyContent: 'center' }}><PaymentBadge status={pay.status} /></View>)}
      </View>

      {pay.status === 'paid' ? (
        <T size={14} muted>
          This bill is fully paid.
        </T>
      ) : (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <T size={14} muted>
              Payment Amount
            </T>
            <CellInput label="Payment Amount" value={amount} onChangeText={(v) => (setAmount(money(v)), setError(null))} onSubmit={record} width={110} />
            <Btn title={saving ? 'Recording…' : 'Record Payment'} disabled={saving} onPress={record} />
          </View>
          {error || tooMuch ? (
            <T size={12} weight="500" style={{ color: t.danger }}>
              {error ?? `Payment cannot be more than the remaining balance of ${rupees(pay.remaining)}.`}
            </T>
          ) : null}
        </View>
      )}

      <View style={{ gap: 2, marginTop: 8 }}>
        <T size={18} weight="700">
          Payment History
        </T>
        <T size={13} muted>
          Every payment received, newest first.
        </T>
      </View>
      <SimpleTable
        minWidth={phone ? 560 : undefined}
        columns={[
          { label: 'Date & Time', width: phone ? 170 : 240, render: (p) => when(p.at) },
          { label: 'Amount', align: 'right', weight: '600', render: (p) => rupees(p.amount) },
          { label: 'Total Paid', align: 'right', render: (p) => rupees(p.paidAfter) },
          {
            label: 'Remaining',
            align: 'right',
            render: (p) => (
              <T size={15} weight="600" style={{ color: remainingTone(p.remainingAfter, p.paidAfter).fg, fontVariant: ['tabular-nums'] }}>
                {rupees(p.remainingAfter)}
              </T>
            ),
          },
        ]}
        rows={history}
        keyOf={(p) => p.id}
        empty={{ title: 'No payments yet.', note: 'Use Record Payment when money is received.' }}
      />
    </View>
  );
}

/** One saved bill, in the same ruled table it was written in. */
function BillView({ bill }: { bill: DirectBill }) {
  const phone = useWindowDimensions().width < NAV_BREAKPOINT;
  const pay = billPayment(bill);
  return (
    <View style={{ gap: 20 }}>
      <BillHead name={bill.customerName} phone={bill.customerPhone} at={bill.at} />
      <BillGrid
        minWidth={phone ? 520 : undefined}
        columns={COLUMNS}
        rows={bill.lines.map((l, i) => ({ key: `${l.productId}-${i}`, cells: [String(i + 1), l.name, num(l.qty), rupees(l.rate), rupees(l.total)] }))}
        foot={{ key: 'total', cells: ['', 'Total', num(bill.lines.reduce((s, l) => s + l.qty, 0)), '', rupees(bill.total)] }}
      />
      <PaymentPanel bill={bill} pay={pay} phone={phone} />
    </View>
  );
}

/** Add New Bill: customer, then every Item Master item in ruled tables. Qty and Rate are typed; Rate defaults to the Item Master Amount once a Qty is entered and can be edited. */
function NewBill({ onDone, tabs, editing }: { onDone: () => void; tabs: ReactNode; /** A saved bill being edited: the same form, filled from the bill, saved as an edit (stock changes only by the difference). */ editing?: DirectBill }) {
  const t = useTheme();
  const width = useWindowDimensions().width;
  const phone = width < NAV_BREAKPOINT;
  const split = width >= TWO_COLUMNS;
  const products = useProductsWithStock();
  const savedBills = useDirectBills();
  const [name, setName] = useState(editing?.customerName ?? '');
  const [mobile, setMobile] = useState(editing?.customerPhone ?? '');
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries((editing?.lines ?? []).map((l) => [l.productId, String(l.qty)])));
  const [rate, setRate] = useState<Record<string, string>>(() => Object.fromEntries((editing?.lines ?? []).map((l) => [l.productId, String(l.rate)])));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submission = useRef<{ key: string; id: string } | null>(null);
  const opened = useMemo(() => editing?.at ?? new Date().toISOString(), [editing]);
  // Rates the owner typed or cleared by hand: quantity changes never overwrite these with the Item Master default.
  const manualRate = useRef<Set<string>>(new Set((editing?.lines ?? []).map((l) => l.productId))); // saved rates are kept as billed
  const qtyInputs = useRef<Record<string, TextInput | null>>({});
  const rateInputs = useRef<Record<string, TextInput | null>>({});
  const saveButton = useRef<View | null>(null);

  // Enter in Qty -> same row's Rate; Enter in Rate -> next row's Qty; after the last Rate -> the Save Bill button (focus only, never saves).
  const afterQty = (id: string) => rateInputs.current[id]?.focus();
  const afterRate = (id: string) => {
    const next = products[products.findIndex((x) => x.id === id) + 1];
    if (next) return qtyInputs.current[next.id]?.focus();
    rateInputs.current[id]?.blur();
    (saveButton.current as { focus?: () => void } | null)?.focus?.();
  };

  // Default Rate per product: this customer's rate on their newest saved bill that has the product, else the Item Master Amount. Only the
  // same customer's own saved bills are used (see customerLastRates); a rate typed on this bill applies at once and counts for next time only once the bill saves.
  const lastRates = useMemo(() => customerLastRates(savedBills, name, mobile), [savedBills, name, mobile]);
  const defaultRate = (p: { id: string; amount: number }) => String(lastRates[p.id] ?? p.amount);
  // Choosing or changing the customer re-defaults the rows still on a default rate (typed rates are kept).
  useEffect(() => {
    setRate((x) => {
      const next = { ...x };
      for (const p of products) if (!manualRate.current.has(p.id) && (Number(qty[p.id]) || 0) > 0) next[p.id] = defaultRate(p);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRates]);
  const suggestions = useMemo(() => customerSuggestions(savedBills, name, mobile).filter((c) => !(c.name === name.trim() && c.phone === mobile.trim())), [savedBills, name, mobile]);

  const qtyOf = (id: string) => Number(qty[id]) || 0;
  const totalOf = (id: string) => qtyOf(id) * (Number(rate[id]) || 0);
  const sold = products.filter((p) => qtyOf(p.id) > 0);
  // Lines of a bill being edited whose product is no longer in the Item Master list stay exactly as billed.
  const extra = editing ? editing.lines.filter((l) => !products.some((p) => p.id === l.productId)) : [];
  const grand = sold.reduce((sum, p) => sum + totalOf(p.id), 0) + extra.reduce((sum, l) => sum + l.total, 0);
  const units = sold.reduce((sum, p) => sum + qtyOf(p.id), 0) + extra.reduce((sum, l) => sum + l.qty, 0);
  // Payment: recomputed on every render, so it follows quantities, rates and the typed Paid Amount immediately.
  const [paid, setPaid] = useState(editing ? String(billPayment(editing).paid) : '0'); // an edit keeps the payments already received
  const total = Math.round(grand * 100) / 100;
  const paidNow = Number(paid) || 0;
  const paidError = Math.round(paidNow * 100) / 100 > total ? (editing ? `The total cannot be less than the ${rupees(paidNow)} already paid on this bill.` : 'Paid Amount cannot be more than the Total Amount.') : null;
  const pay = paymentOf(total, paidError ? 0 : paidNow);

  const save = async () => {
    if (saving) return;
    if (paidError) return setError(paidError); // never record a payment above the current bill total
    if (editing) {
      setSaving(true);
      const edit = {
        customerName: name,
        customerPhone: mobile,
        lines: [
          ...sold.map((p) => ({ productId: p.id, qty: qtyOf(p.id), rate: !rate[p.id] ? NaN : Number(rate[p.id]) })),
          ...extra.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.rate })),
        ],
      };
      // One id per submission of THIS edit: Save again or a retry reuses it, so the stock change is applied once.
      const editKey = JSON.stringify(edit);
      if (submission.current?.key !== editKey) submission.current = { key: editKey, id: newBillSubmissionId() };
      const done = await editDirectBill(editing.id, { ...edit, submissionId: submission.current.id });
      setSaving(false);
      if (!done.ok) return setError(done.error); // the bill and the stock stay as they were
      submission.current = null;
      return onDone();
    }
    setSaving(true);
    const input = {
      customerName: name,
      customerPhone: mobile,
      paidAmount: paidNow,
      lines: sold.map((p) => ({ productId: p.id, qty: qtyOf(p.id), rate: !rate[p.id] ? NaN : Number(rate[p.id]) })),
    };
    // One id per submission of THIS bill: pressing Save again, or retrying after an error, reuses it, so the bill cannot be saved
    // or deducted twice. Changing the bill makes it a different submission.
    const key = JSON.stringify(input);
    if (submission.current?.key !== key) submission.current = { key, id: newBillSubmissionId() };
    const r = await saveDirectBill({ ...input, submissionId: submission.current.id });
    setSaving(false);
    if (!r.ok) return setError(r.error); // the bill stays as entered
    submission.current = null;
    onDone();
  };

  const table = (list: typeof products, offset: number) => (
    <BillGrid
      minWidth={phone ? 560 : undefined}
      columns={[
        { label: 'Sr. No.', width: 64, align: 'center' },
        { label: 'Product Name', flex: 3 },
        { label: 'Qty', width: split ? 92 : 96, align: 'right' },
        { label: 'Rate', width: split ? 108 : 108, align: 'right' },
        { label: 'Total', flex: 1.2, align: 'right' },
      ]}
      rows={list.map((p, i) => ({
        key: p.id,
        cells: [
          String(offset + i + 1),
          <View key="n" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }}>
            <T size={15} weight="500">
              {p.name}
            </T>
            <T size={11} muted>
              Stock {num(p.stock)}
            </T>
          </View>,
          <CellInput
            key="q"
            label={`Qty for ${p.name}`}
            value={qty[p.id] ?? ''}
            onChangeText={(v) => {
              const q = digits(v);
              setQty((x) => ({ ...x, [p.id]: q }));
              // Default Rate (customer's last rate, else Item Master Amount), filled in only while the owner has not touched this rate.
              if (!manualRate.current.has(p.id)) setRate((x) => ({ ...x, [p.id]: Number(q) > 0 ? defaultRate(p) : '' }));
              setError(null);
            }}
            inputRef={(el) => {
              qtyInputs.current[p.id] = el;
            }}
            onSubmit={() => afterQty(p.id)}
            width={split ? 76 : 80}
          />,
          <CellInput
            key="r"
            label={`Rate for ${p.name}`}
            value={rate[p.id] ?? ''}
            onChangeText={(v) => {
              manualRate.current.add(p.id);
              setRate((x) => ({ ...x, [p.id]: money(v) }));
              setError(null);
            }}
            inputRef={(el) => {
              rateInputs.current[p.id] = el;
            }}
            onSubmit={() => afterRate(p.id)}
            width={split ? 92 : 92}
          />,
          qtyOf(p.id) > 0 ? rupees(totalOf(p.id)) : '',
        ],
      }))}
    />
  );

  const half = Math.ceil(products.length / 2);

  const summary = (label: string, value: string, strong?: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <T size={phone ? 13 : 14} muted>
        {label}
      </T>
      <T size={strong ? (phone ? 18 : 22) : phone ? 15 : 18} weight={strong ? '700' : '600'} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
    </View>
  );
  const divider = <View style={{ width: 1, height: 22, backgroundColor: t.borderStrong }} />;

  return (
    <View style={{ flex: 1 }}>
      <Page title="Private Bill" subtitle={editing ? `Editing this bill · ${formatLong(editing.date)}` : 'Goods sold directly from the godown.'} actions={tabs} wide>
        <View style={{ gap: 20 }}>
          <View style={{ flexDirection: phone ? 'column' : 'row', gap: 16, maxWidth: 760 }}>
            <View style={{ flex: 1 }}>
              <TextField
                label="Customer Name"
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setError(null);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label="Customer Mobile"
                value={mobile}
                onChangeText={(v) => {
                  setMobile(v);
                  setError(null);
                }}
                keyboardType="phone-pad"
              />
            </View>
          </View>
          {suggestions.length > 0 ? (
            <View style={{ maxWidth: 760, borderWidth: 1, borderColor: t.border, borderRadius: 8, overflow: 'hidden' }}>
              {suggestions.map((c, i) => (
                <Pressable
                  key={`${c.phone}|${c.name}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Use customer ${c.name || c.phone}`}
                  onPress={() => {
                    setName(c.name);
                    setMobile(c.phone);
                    setError(null);
                  }}
                  style={(st: { pressed: boolean; hovered?: boolean }) => ({ paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.border, backgroundColor: st.pressed || st.hovered ? t.hover : t.surface })}>
                  <T size={14} weight="500">
                    {c.name || '—'} <T size={13} muted>{c.phone}</T>
                  </T>
                </Pressable>
              ))}
            </View>
          ) : null}
          <T size={14} muted>
            Date {formatLong(localDate(opened))} · Time {formatTime(opened)} {editing ? '(unchanged)' : '(saved with the bill)'}
          </T>

          {products.length === 0 ? (
            <T muted>No items in the Item Master yet.</T>
          ) : split ? (
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>{table(products.slice(0, half), 0)}</View>
              <View style={{ flex: 1 }}>{table(products.slice(half), half)}</View>
            </View>
          ) : (
            table(products, 0)
          )}

          <T size={13} muted>
            {editing ? 'Only items with a Qty are on the bill. Saving changes the warehouse stock only by the difference from the saved bill. Payments already received are kept.' : 'Only items with a Qty are on the bill. Saving takes these quantities off the warehouse stock.'}
            {extra.length > 0 ? ` ${extra.length} item(s) no longer in the Item Master stay as billed.` : ''}
          </T>
          {/* Room so the action bar never covers the last rows. */}
          <View style={{ height: 16 }} />
        </View>
      </Page>

      {/* Compact action bar pinned under the scrolling bill. */}
      <View style={[{ backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }, { boxShadow: '0 -2px 8px rgba(17,24,39,0.06)' } as object]}>
        <View style={{ paddingHorizontal: phone ? 16 : 32, paddingVertical: 8, minHeight: 60, justifyContent: 'center', gap: 4 }}>
          {error ? (
            <T size={12} weight="500" style={{ color: t.danger }} numberOfLines={2}>
              {error}
            </T>
          ) : null}
          {paidError ? (
            <T size={12} weight="500" style={{ color: t.danger }}>
              {paidError}
            </T>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: phone ? 10 : 16, rowGap: 6 }}>
            {summary('Total Amount', rupees(total))}
            {divider}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T size={phone ? 13 : 14} muted>
                Paid Amount
              </T>
              {editing ? (
                <T size={phone ? 15 : 18} weight="600" style={{ fontVariant: ['tabular-nums'] }}>
                  {rupees(paidNow)}
                </T>
              ) : (
                <CellInput label="Paid Amount" value={paid} onChangeText={(v) => (setPaid(money(v)), setError(null))} width={96} />
              )}
            </View>
            {divider}
            {summary('Remaining', rupees(pay.remaining))}
            <PaymentBadge status={pay.status} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 16, rowGap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: phone ? 10 : 16 }}>
              {summary('Items', num(sold.length))}
              {divider}
              {summary('Qty', num(units))}
              {divider}
              {summary('Total', rupees(grand), true)}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn title="Cancel" variant="secondary" disabled={saving} onPress={onDone} />
              <Btn title={saving ? 'Saving…' : editing ? 'Save Changes' : 'Save Bill'} disabled={saving} onPress={save} buttonRef={(el) => (saveButton.current = el)} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// Private Bill: goods sold straight from the godown to a customer. Not a salesman sale.
function PrivateBillsScreen() {
  const { phone } = usePageMetrics();
  const bills = useDirectBills();
  const [mode, setMode] = useState<'new' | 'statement'>('new');
  const [open, setOpen] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const period = usePeriodFilter();
  const { range } = period;

  const [filter, setFilter] = useState<'all' | PaymentStatus>('all');
  const [sort, setSort] = useState<{ key: 'at' | 'total' | 'remaining'; dir: 'asc' | 'desc' }>({ key: 'at', dir: 'desc' });
  // Header tap: the same column flips direction; another column starts highest/newest first.
  const sortBy = (key: 'at' | 'total' | 'remaining') => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
  const sortOf = (key: 'at' | 'total' | 'remaining') => (sort.key === key ? sort.dir : null);

  // Search and the payment-status filter apply together; sorting uses the stored timestamp and numbers, never the formatted text.
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Date period (inclusive, Asia/Kolkata business date of the bill); an invalid custom range lists nothing.
    const shown = bills.filter(
      (b) =>
        !!range && b.date >= range.from && b.date <= range.to &&
        (filter === 'all' || billPayment(b).status === filter) &&
        ((b.customerName ?? '').toLowerCase().includes(q) || (b.customerPhone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, ''))),
    );
    const value = (b: DirectBill) => (sort.key === 'at' ? Date.parse(b.at) || 0 : sort.key === 'total' ? b.total : billPayment(b).remaining);
    return shown.sort((a, b) => (sort.dir === 'asc' ? value(a) - value(b) : value(b) - value(a)));
  }, [bills, search, filter, sort, range?.from, range?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const bill = bills.find((b) => b.id === open);

  const tabs = (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Btn
        title="Add New Bill"
        variant={mode === 'new' ? 'primary' : 'secondary'}
        onPress={() => {
          setMode('new');
          setOpen(null);
          setEditId(null);
        }}
      />
      <Btn
        title="Statement"
        variant={mode === 'statement' ? 'primary' : 'secondary'}
        onPress={() => {
          setMode('statement');
          setOpen(null);
          setEditId(null);
        }}
      />
    </View>
  );

  // Edit Bill: the same form, filled from the saved bill; Cancel or a successful save returns to the Statement.
  const editBill = editId ? bills.find((b) => b.id === editId) : undefined;
  if (editBill) return <NewBill key={`edit-${editBill.id}`} editing={editBill} onDone={() => setEditId(null)} tabs={tabs} />;

  if (mode === 'new') {
    return (
      <NewBill key={bills.length} onDone={() => setMode('statement')} tabs={tabs} />
    );
  }

  if (bill) {
    const print = () => printPrivateBill({ bill });
    const billTabs = (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tabs}
        <Btn title="Edit" variant="secondary" onPress={() => setEditId(bill.id)} />
        <Btn title="Print" variant="secondary" onPress={print} />
      </View>
    );
    return (
      <Page title="Private Bill" subtitle={`${bill.customerName || '—'} · ${formatLong(bill.date)}`} actions={billTabs}>
        <View style={{ alignSelf: 'flex-start', marginLeft: -12 }}>
          <TextAction title="← Statement" onPress={() => setOpen(null)} />
        </View>
        <BillView bill={bill} />
      </Page>
    );
  }

  return (
    <Page title="Private Bill" subtitle="Statement of saved bills." actions={tabs}>
      <PeriodFilter f={period} phone={phone} />
      <View style={{ maxWidth: phone ? undefined : 480 }}>
        <TextField label="" accessibilityLabel="Search bills" value={search} onChangeText={setSearch} placeholder="Search by customer or mobile no..." leading={<SearchIcon />} autoCorrect={false} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {(
          [
            ['all', 'All'],
            ['unpaid', 'Unpaid'],
            ['partial', 'Partially Paid'],
            ['paid', 'Fully Paid'],
          ] as const
        ).map(([key, label]) => (
          <FilterChip key={key} label={label} status={key === 'all' ? undefined : key} selected={filter === key} onPress={() => setFilter(key)} />
        ))}
        <Btn
          title="Reset Filters"
          variant="secondary"
          disabled={period.period === 'today' && filter === 'all' && search === ''}
          onPress={() => {
            period.reset();
            setFilter('all');
            setSearch('');
          }}
        />
      </View>
      <SimpleTable
        grid
        minWidth={1110}
        columns={[
          { label: 'Date & Time', width: 230, render: (b) => `${formatLong(b.date)}, ${formatTime(b.at)}`, onHeaderPress: () => sortBy('at'), sort: sortOf('at') },
          { label: 'Customer', weight: '500', render: (b) => b.customerName || '—' },
          { label: 'Mobile No.', width: 130, render: (b) => b.customerPhone || '—' },
          { label: 'Total', width: 110, align: 'right', weight: '600', render: (b) => rupees(b.total), onHeaderPress: () => sortBy('total'), sort: sortOf('total') },
          { label: 'Paid', width: 110, align: 'right', render: (b) => rupees(billPayment(b).paid) },
          {
            label: 'Remaining',
            width: 130,
            align: 'right',
            render: (b) => {
              const p = billPayment(b);
              return (
                <T size={15} weight="600" style={{ color: remainingTone(p.remaining, p.paid).fg, fontVariant: ['tabular-nums'] }}>
                  {rupees(p.remaining)}
                </T>
              );
            },
            onHeaderPress: () => sortBy('remaining'),
            sort: sortOf('remaining'),
          },
          { label: 'Status', width: 170, render: (b) => <PaymentBadge status={billPayment(b).status} /> },
          { label: 'Edit', width: 70, align: 'right', action: true, render: (b) => <TextAction title="Edit" label={`Edit bill of ${b.customerName || 'customer'}`} onPress={() => setEditId(b.id)} /> },
        ]}
        rows={list}
        keyOf={(b) => b.id}
        onRowPress={(b) => setOpen(b.id)}
        // Totals of exactly the bills listed (each bill once; Paid and Remaining are each bill's own saved figures, so payment entries are never added twice).
        foot={{
          'Date & Time': 'Total',
          Total: rupees(cents(list.reduce((n, b) => n + b.total, 0))),
          Paid: rupees(cents(list.reduce((n, b) => n + billPayment(b).paid, 0))),
          Remaining: rupees(cents(list.reduce((n, b) => n + billPayment(b).remaining, 0))),
        }}
        empty={{ title: 'No private bills found.', note: period.error ?? 'Change the period or filters, or use Add New Bill to make one.' }}
      />
    </Page>
  );
}

export default function GuardedPrivateBillsScreen() {
  return (
    <RequireAccess area="privateBills">
      <PrivateBillsScreen />
    </RequireAccess>
  );
}
