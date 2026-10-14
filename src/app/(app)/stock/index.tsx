import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View, type TextInput } from 'react-native';

import { useAuth } from '../../../auth/AuthContext';
import { isOwner } from '../../../auth/access';
import { Btn, SearchIcon, T, TextAction, TextField, useTheme } from '../../../components/controls';
import { Page, SimpleTable, usePageMetrics } from '../../../components/page';
import { QtyControl } from '../../../components/quantity-control';
import { Sheet } from '../../../components/sheet';
import { PaymentBadge, remainingTone } from '../../../components/payment-status';
import { deleteProduct, newReceiptSubmissionId, paymentOf, receiveStock, updateProduct, useParties, useProductsWithStock, validMobile, type ProductWithStock } from '../../../data/repository';
import { num, rupees } from '../../../mock/data';
import { qtyOf, stepQty, typeQty, type Quantities } from '../../../mock/give';
import { STATUS_LABEL, productStatus, type StockStatus } from '../../../mock/stock-status';

const TNUM = { fontVariant: ['tabular-nums' as const] };
const NO_LIMIT = 9999999;
// Two side-by-side tables from this window width up; one table below it.
const SPLIT_WIDTH = 980;
const digits = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 7);
// Digits and one decimal point; a leading zero is dropped so typing over the default 0 gives 5, not 05.
const money = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').replace(/^0+(?=\d)/, '').slice(0, 9);

function useStatusColor() {
  const t = useTheme();
  return (s: StockStatus) => (s === 'healthy' ? t.success : s === 'low' ? t.warning : t.danger);
}

/** The product name with the stock-status dot beside it (green healthy, amber low, red out). */
function NameWithStatus({ p }: { p: ProductWithStock }) {
  const color = useStatusColor();
  const status = productStatus(p);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
      <View accessibilityLabel={STATUS_LABEL[status]} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color(status) }} />
      <T size={15} weight="500" numberOfLines={2} style={{ flexShrink: 1 }}>
        {p.name}
      </T>
    </View>
  );
}

type StockFilter = StockStatus | 'all';

/** All / Healthy / Low Stock / Out of Stock, counted from the real stock figures with the same productStatus the table uses. Each one filters the list. */
function Summary({ products, value, onChange }: { products: ProductWithStock[]; value: StockFilter; onChange: (f: StockFilter) => void }) {
  const t = useTheme();
  const color = useStatusColor();
  const counts = { healthy: 0, low: 0, out: 0 };
  products.forEach((p) => (counts[productStatus(p)] += 1));
  const items: { n: number; label: string; f: StockFilter; s?: StockStatus }[] = [
    { n: products.length, label: 'All', f: 'all' },
    { n: counts.healthy, label: STATUS_LABEL.healthy, f: 'healthy', s: 'healthy' },
    { n: counts.low, label: STATUS_LABEL.low, f: 'low', s: 'low' },
    { n: counts.out, label: STATUS_LABEL.out, f: 'out', s: 'out' },
  ];
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.border }}>
      {items.map((m) => {
        const active = value === m.f;
        return (
          <Pressable
            key={m.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${m.label}: ${m.n} ${m.n === 1 ? 'product' : 'products'}`}
            onPress={() => onChange(m.f)}
            style={(st: { pressed: boolean; hovered?: boolean }) => ({
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: active ? t.accent : 'transparent',
              backgroundColor: active ? t.accentSoft : st.pressed || st.hovered ? t.hover : 'transparent',
            })}>
            {m.s ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color(m.s), alignSelf: 'center' }} /> : null}
            <T size={18} weight="700" style={TNUM}>
              {m.n}
            </T>
            <T size={14} weight={active ? '600' : '400'} muted={!active}>
              {m.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

function DialogFooter({ left, children }: { left?: ReactNode; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.subtle, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>
      <View>{left}</View>
      <View style={{ flexDirection: 'row', gap: 8 }}>{children}</View>
    </View>
  );
}

/** Edit: product master only (name, price, commission, minimum stock) with Delete. Stock is changed in Add Stock mode. */
function EditDialog({ p, onClose }: { p: ProductWithStock; onClose: () => void }) {
  const t = useTheme();
  const [name, setName] = useState(p.name);
  const [amount, setAmount] = useState(String(p.amount));
  const [commission, setCommission] = useState(String(p.commission));
  const [minimumStock, setMinimumStock] = useState(String(p.minimumStock ?? 0));
  const [errors, setErrors] = useState<{ name?: string; amount?: string; commission?: string; minimumStock?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = 'Enter a product name';
    if (!amount) e.amount = 'Enter the price';
    if (!commission) e.commission = 'Enter the commission';
    if (!minimumStock) e.minimumStock = 'Enter the minimum stock (0 or more)';
    setErrors(e);
    if (Object.keys(e).length > 0 || saving) return;
    setSaving(true);
    setError(null);
    const r = await updateProduct(p.id, { name, amount: Number(amount), commission: Number(commission), minimumStock: Number(minimumStock) });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    onClose();
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    const r = await deleteProduct(p.id);
    setBusy(false);
    if (!r.ok) {
      setConfirming(false);
      return setError(r.error);
    }
    onClose();
  };

  if (confirming) {
    return (
      <Sheet title="Delete Item?" onClose={() => setConfirming(false)}>
        <View style={{ padding: 20 }}>
          <T size={15}>Are you sure you want to delete &quot;{p.name}&quot;?</T>
        </View>
        <DialogFooter>
          <Btn title="Cancel" variant="secondary" onPress={() => setConfirming(false)} />
          <Btn title={busy ? 'Deleting…' : 'Delete'} variant="danger" disabled={busy} onPress={remove} />
        </DialogFooter>
      </Sheet>
    );
  }

  return (
    <Sheet title="Edit Product" onClose={onClose}>
      <View style={{ padding: 20, gap: 16 }}>
        <TextField
          label="Item"
          value={name}
          onChangeText={(v) => {
            setName(v);
            setErrors({ ...errors, name: undefined });
          }}
          error={errors.name}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Amount"
              prefix="₹"
              value={amount}
              onChangeText={(v) => {
                setAmount(digits(v));
                setErrors({ ...errors, amount: undefined });
              }}
              keyboardType="number-pad"
              error={errors.amount}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Commission"
              prefix="₹"
              value={commission}
              onChangeText={(v) => {
                setCommission(digits(v));
                setErrors({ ...errors, commission: undefined });
              }}
              keyboardType="number-pad"
              error={errors.commission}
            />
          </View>
        </View>
        <TextField
          label="Minimum Stock"
          value={minimumStock}
          onChangeText={(v) => {
            setMinimumStock(digits(v));
            setErrors({ ...errors, minimumStock: undefined });
          }}
          keyboardType="number-pad"
          hint="At or below this, stock shows as Low."
          error={errors.minimumStock}
        />
        {error ? (
          <T size={13} style={{ color: t.danger }}>
            {error}
          </T>
        ) : null}
      </View>
      <DialogFooter left={<Btn title="Delete" variant="danger" onPress={() => setConfirming(true)} />}>
        <Btn title="Cancel" variant="secondary" onPress={onClose} />
        <Btn title={saving ? 'Saving…' : 'Save'} disabled={saving} onPress={save} />
      </DialogFooter>
    </Sheet>
  );
}

/** Add Stock mode stock cell: a - [new qty] + control with "Current x + New y = total" under it. */
function AddCell({
  p,
  value,
  phone,
  onStep,
  onType,
  onBlurEmpty,
  inputRef,
  onSubmit,
}: {
  p: ProductWithStock;
  value: string;
  phone: boolean;
  onStep: (id: string, delta: number) => void;
  onType: (id: string, text: string) => void;
  onBlurEmpty: (id: string) => void;
  inputRef: (el: TextInput | null) => void;
  onSubmit: () => void;
}) {
  const t = useTheme();
  const added = /^\d+$/.test(value) ? Number(value) : 0;
  return (
    <View style={{ alignItems: 'flex-end', gap: 3, paddingVertical: 6 }}>
      <QtyControl verb="Receive" id={p.id} name={p.name} value={value} max={NO_LIMIT} big={false} compact onStep={onStep} onType={onType} onBlurEmpty={onBlurEmpty} inputRef={inputRef} onSubmit={onSubmit} />
      <T size={12} muted style={TNUM}>
        Current {num(p.stock)} + New {num(added)} = <T size={12} weight="700" style={{ color: t.text }}>{num(p.stock + added)}</T>
      </T>
    </View>
  );
}

/** Step 2: only the products with new stock, Old Qty | New Qty | Total. Nothing is saved until Confirm. */
function ReviewDialog({
  party,
  pay,
  totalAmount,
  paidAmount,
  amountError,
  onTotal,
  onPaid,
  rows,
  saving,
  error,
  onBack,
  onConfirm,
}: {
  party: { name: string; phone: string };
  pay: ReturnType<typeof paymentOf>;
  totalAmount: string;
  paidAmount: string;
  amountError: string | null;
  onTotal: (v: string) => void;
  onPaid: (v: string) => void;
  rows: { p: ProductWithStock; add: number }[];
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const t = useTheme();
  const { phone } = usePageMetrics();
  const W = phone ? 56 : 90;
  const h = { size: 12, weight: '600' as const, muted: true };
  const hs = { textTransform: 'uppercase' as const, letterSpacing: 0.5, textAlign: 'right' as const, width: W };
  return (
    <Sheet title="Review Stock" onClose={onBack}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 2, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <T size={15} weight="600">
          {party.name}
        </T>
        <T size={14} muted>
          {party.phone}
        </T>
      </View>
      {/* Payment for this receipt: the Paid Amount becomes its first payment record when Confirm saves. */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TextField label="Total Purchase Amount" value={totalAmount} onChangeText={onTotal} keyboardType="decimal-pad" editable={!saving} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Paid Amount" value={paidAmount} onChangeText={onPaid} keyboardType="decimal-pad" editable={!saving} error={amountError ?? undefined} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T size={14} muted>
              Remaining
            </T>
            <T size={18} weight="700" style={{ color: remainingTone(pay.remaining, pay.paid).fg, fontVariant: ['tabular-nums'] }}>
              {rupees(pay.remaining)}
            </T>
          </View>
          <PaymentBadge status={pay.status} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 16, backgroundColor: t.subtle, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <T {...h} style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>Item</T>
        <T {...h} style={hs}>Old Qty</T>
        <T {...h} style={hs}>New Qty</T>
        <T {...h} style={hs}>Total</T>
      </View>
      <ScrollView style={{ maxHeight: 360 }}>
        {rows.map(({ p, add }) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.border }}>
            <T size={15} weight="500" style={{ flex: 1 }} numberOfLines={2}>
              {p.name}
            </T>
            <T size={15} style={[{ width: W, textAlign: 'right' }, TNUM]}>{num(p.stock)}</T>
            <T size={15} style={[{ width: W, textAlign: 'right' }, TNUM]}>{num(add)}</T>
            <T size={15} weight="700" style={[{ width: W, textAlign: 'right' }, TNUM]}>{num(p.stock + add)}</T>
          </View>
        ))}
      </ScrollView>
      {error ? (
        <T size={13} style={{ color: t.danger, paddingHorizontal: 20, paddingTop: 10 }}>
          {error}
        </T>
      ) : null}
      <DialogFooter>
        <Btn title="Back" variant="secondary" disabled={saving} onPress={onBack} />
        <Btn title={saving ? 'Saving…' : 'Confirm'} disabled={saving} onPress={onConfirm} />
      </DialogFooter>
    </Sheet>
  );
}

/** Stock: warehouse stock per product. "+ Add Stock" turns the list into a stock-entry sheet. */
export default function StockScreen() {
  const t = useTheme();
  const { phone } = usePageMetrics();
  // Width of the page column itself (not the screen): two tables whenever both fit, e.g. a browser window on half a monitor.
  const [boxWidth, setBoxWidth] = useState(0);
  const products = useProductsWithStock();
  // The product edit dialog changes the Item Master (name, price, commission, delete): the owner only.
  const ownerView = isOwner(useAuth().user);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [open, setOpen] = useState<ProductWithStock | null>(null);
  const [adding, setAdding] = useState(false);
  // Home's Receive Stock arrives as ?action=add&t=<token>: it opens this same Add Stock mode, once per token.
  const params = useLocalSearchParams<{ action?: string; t?: string }>();
  const [handled, setHandled] = useState<string | null>(null);
  if (params.t && params.t !== handled) {
    setHandled(params.t);
    if (params.action === 'add') setAdding(true);
  }
  const router = useRouter();
  const [added, setAdded] = useState<Quantities>({});
  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  // What this receipt cost and how much of it is paid now; Remaining and the status follow immediately.
  // They are typed in the Review Stock dialog and kept here, so Back and re-opening the review keep what was entered.
  const [totalAmount, setTotalAmount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('0');
  const totalNow = Number(totalAmount) || 0;
  const paidNow = Number(paidAmount) || 0;
  const amountError = paidNow > totalNow && totalNow >= 0 && paidAmount !== '' ? 'Paid Amount cannot be more than the Total Purchase Amount.' : null;
  const pay = paymentOf(totalNow, amountError ? 0 : paidNow);
  const parties = useParties();
  // A known mobile number belongs to one party: its saved name is kept (it can be corrected on Stock Received).
  const knownParty = parties.find((x) => x.id === partyPhone);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [showTop, setShowTop] = useState(false);
  const [showFab, setShowFab] = useState(false); // the header's Add Stock has scrolled out of view
  const addedRef = useRef(added);
  addedRef.current = added;

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => (filter === 'all' || productStatus(p) === filter) && p.name.toLowerCase().includes(q));
  }, [products, search, filter]);

  const onStep = useCallback((id: string, d: number) => setAdded(stepQty(addedRef.current, id, d, NO_LIMIT).q), []);
  const onType = useCallback((id: string, text: string) => setAdded(typeQty(addedRef.current, id, text, NO_LIMIT).q), []);
  const onBlurEmpty = useCallback((id: string) => setAdded((q) => ({ ...q, [id]: '' })), []);

  const items = products.filter((p) => qtyOf(added, p.id) > 0).map((p) => ({ id: p.id, qty: qtyOf(added, p.id) }));

  // Enter in a quantity box: focus the next VISIBLE product's box (the list as filtered and shown); after the last one, focus the Review
  // button when there is something to review. Focus only: nothing is reviewed, confirmed or saved by Enter.
  const qtyInputs = useRef<Record<string, TextInput | null>>({});
  const reviewButton = useRef<View | null>(null);
  const nextQty = (id: string) => {
    const next = list[list.findIndex((x) => x.id === id) + 1];
    if (next) return qtyInputs.current[next.id]?.focus();
    qtyInputs.current[id]?.blur();
    if (items.length > 0) (reviewButton.current as { focus?: () => void } | null)?.focus?.();
  };

  const finish = () => {
    setReviewing(false);
    setAdding(false);
    setAdded({});
    setPartyName('');
    setPartyPhone('');
    setTotalAmount('0');
    setPaidAmount('0');
    setError(null);
  };
  // One id per submission of THIS receipt: confirming again, or retrying after an error or a dropped connection, reuses it, so the stock
  // can only be added once. Changing the receipt makes it a different submission.
  const submission = useRef<{ key: string; id: string } | null>(null);
  const save = async () => {
    if (saving || items.length === 0) return;
    // Checked here, with the dialog still open and every value kept, so the owner can correct and confirm again.
    if (totalNow <= 0) return setError('Enter the Total Purchase Amount.');
    if (amountError) return setError(amountError);
    setSaving(true);
    const key = JSON.stringify({ partyName, partyPhone, totalNow, paidNow, items });
    if (submission.current?.key !== key) submission.current = { key, id: newReceiptSubmissionId() };
    const result = await receiveStock({ name: partyName, phone: partyPhone }, items, { total: totalNow, paid: paidNow }, submission.current.id);
    setSaving(false);
    if (!result.ok) return setError(result.error); // the receipt stays exactly as entered
    submission.current = null;
    finish();
  };

  const review = () => {
    if (!partyName.trim()) return setError('Enter the party name.');
    if (!validMobile(partyPhone)) return setError('Enter a 10-digit mobile number (digits only).');
    setError(null);
    setReviewing(true);
  };

  const emptyNote = filter === 'all' ? { title: 'No products found.', note: 'Try another product name.' } : { title: `No ${STATUS_LABEL[filter].toLowerCase()} products${search.trim() ? ' match your search' : ''}.`, note: 'Choose All to see every product.' };
  type Numbered = { p: ProductWithStock; n: number };
  /** One half of the wide layout: Sr. No. | Item | Stock | Edit (Edit for the owner only, as before). */
  const stockTable = (part: ProductWithStock[], offset = 0) => (
    <SimpleTable<Numbered>
      compact
      columns={[
        { label: 'Sr. No.', width: 56, render: (r) => String(r.n) },
        { label: 'Item', render: (r) => <NameWithStatus p={r.p} /> },
        { label: 'Stock', width: 64, align: 'right', weight: '600', render: (r) => num(r.p.stock) },
        ...(ownerView ? [{ label: 'Edit', width: 52, align: 'right' as const, render: (r: Numbered) => edit(r.p) }] : []),
      ]}
      rows={part.map((p, i) => ({ p, n: offset + i + 1 }))}
      keyOf={(r) => r.p.id}
      empty={emptyNote}
    />
  );

  const edit = (p: ProductWithStock) => <TextAction title="Edit" label={`Edit ${p.name}`} onPress={() => setOpen(p)} />;

  return (
    <View style={{ flex: 1 }}>
      <Page
        title="Stock"
        subtitle="Current warehouse stock."
        maxWidth={adding ? 1200 : 1800}
        scrollRef={scrollRef}
        onScrollY={(y) => {
          setShowTop(y > 400);
          setShowFab(y > 120);
        }}
        actions={
          adding ? undefined : (
            <View style={{ flexDirection: phone ? 'column' : 'row', gap: 10, alignItems: phone ? 'stretch' : 'center' }}>
              <Btn title="Statement" variant="secondary" fill={phone} onPress={() => router.push('/stock/received' as never)} />
              <Btn title="+ Add Stock" fill={phone} onPress={() => setAdding(true)} />
            </View>
          )
        }>
        <View style={{ gap: phone ? 18 : 24 }}>
        <Summary products={products} value={filter} onChange={setFilter} />
        {adding && (
          <View style={{ gap: 12 }}>
            <T size={13} weight="600" muted style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Stock received from
            </T>
            {/* One row on desktop (name and mobile share the width, Payment Status takes only what it needs); wraps on tablet, stacks on phones. */}
            <View style={{ flexDirection: phone ? 'column' : 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12, maxWidth: 900 }}>
              <View style={{ flex: 1, minWidth: phone ? undefined : 220, alignSelf: phone ? 'stretch' : undefined }}>
                <TextField label="Party Name" value={partyName} onChangeText={(v) => { setPartyName(v); setError(null); }} />
              </View>
              <View style={{ flex: 1, minWidth: phone ? undefined : 220, alignSelf: phone ? 'stretch' : undefined }}>
                <TextField label="Party Mobile No." value={partyPhone} onChangeText={(v) => { setPartyPhone(v); setError(null); }} keyboardType="number-pad" maxLength={10} hint={knownParty ? (knownParty.name.trim().toLowerCase() === partyName.trim().toLowerCase() ? undefined : `This number belongs to ${knownParty.name}. The receipt will be recorded under that party.`) : undefined} />
              </View>
            </View>
            {error && !reviewing ? (
              <T size={13} style={{ color: t.danger }}>
                {error}
              </T>
            ) : null}
          </View>
        )}
        {/* Sticky: stays under the app header while the list scrolls (position: sticky inside the page's ScrollView). */}
        <View style={[{ backgroundColor: t.bg, paddingVertical: 8, zIndex: 5, borderBottomWidth: 1, borderBottomColor: t.border }, { position: 'sticky', top: 0, boxShadow: '0 2px 6px rgba(17,24,39,0.05)' } as object]}>
          <View style={{ maxWidth: phone ? undefined : 360 }}>
            <TextField label="" accessibilityLabel="Search items" value={search} onChangeText={setSearch} placeholder="Search items..." leading={<SearchIcon />} autoCorrect={false} autoCapitalize="none" />
          </View>
        </View>
        <View onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}>
        {!adding && boxWidth >= SPLIT_WIDTH ? (
          // Wide screens: the filtered list (Item Master order) in two balanced tables; serial numbers run on from 1 across both.
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            {list.length === 0 ? (
              <View style={{ flex: 1 }}>{stockTable([])}</View>
            ) : (
              [list.slice(0, Math.ceil(list.length / 2)), list.slice(Math.ceil(list.length / 2))].map((part, i) => (
                <View key={i} style={{ flex: 1 }}>
                  {stockTable(part, i === 0 ? 0 : Math.ceil(list.length / 2))}
                </View>
              ))
            )}
          </View>
        ) : (
        <SimpleTable
          columns={
            adding
              ? [
                  { label: 'Item', render: (p) => <NameWithStatus p={p} /> },
                  { label: 'Stock', width: phone ? 176 : 230, align: 'right', render: (p) => <AddCell p={p} value={added[p.id] ?? ''} phone={phone} onStep={onStep} onType={onType} onBlurEmpty={onBlurEmpty} inputRef={(el) => { qtyInputs.current[p.id] = el; }} onSubmit={() => nextQty(p.id)} /> },
                ]
              : [
                  { label: 'Item', render: (p) => <NameWithStatus p={p} /> },
                  { label: 'Stock', width: phone ? 64 : 140, align: 'right', weight: '600', render: (p) => num(p.stock) },
                  ...(ownerView ? [{ label: 'Edit', width: phone ? 52 : 80, align: 'right' as const, render: edit }] : []),
                ]
          }
          rows={list}
          keyOf={(p) => p.id}
          empty={emptyNote}
        />
        )}
        </View>
        </View>
        {/* Room so the floating buttons never cover the last rows. */}
        <View style={{ height: adding ? 24 : 72 }} />
        {open && <EditDialog p={open} onClose={() => setOpen(null)} />}
      </Page>

      {/* Floating controls: Add Stock (primary, normal mode only) with a small back-to-top button above it. */}
      {((!adding && showFab) || showTop) && (
        <View pointerEvents="box-none" style={{ position: 'absolute', right: phone ? 16 : 32, bottom: adding ? 76 : 16, alignItems: 'flex-end', gap: 12 }}>
          {showTop && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to top"
              onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
              style={[{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface, borderWidth: 1, borderColor: t.borderStrong }, { boxShadow: '0 2px 8px rgba(17,24,39,0.15)' } as object]}>
              <T size={18} weight="600" style={{ color: t.muted }}>
                ↑
              </T>
            </Pressable>
          )}
          {!adding && showFab && (
            <View style={{ boxShadow: '0 4px 12px rgba(47,62,158,0.3)', borderRadius: 8 } as object}>
              <Btn title="+ Add Stock" onPress={() => setAdding(true)} />
            </View>
          )}
        </View>
      )}

      {reviewing && <ReviewDialog pay={pay} totalAmount={totalAmount} paidAmount={paidAmount} amountError={amountError} onTotal={(v) => { setTotalAmount(money(v)); setError(null); }} onPaid={(v) => { setPaidAmount(money(v)); setError(null); }} party={{ name: partyName.trim(), phone: partyPhone.trim() }} rows={products.filter((p) => qtyOf(added, p.id) > 0).map((p) => ({ p, add: qtyOf(added, p.id) }))} saving={saving} error={error} onBack={() => { setReviewing(false); setError(null); }} onConfirm={save} />}

      {adding && (
        <View style={[{ backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }, { boxShadow: '0 -2px 10px rgba(17,24,39,0.06)' } as object]}>
          <View style={{ width: '100%', maxWidth: 1400, alignSelf: 'center', paddingHorizontal: phone ? 16 : 32, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Btn title="Cancel" variant="secondary" onPress={finish} />
              <Btn title="Review" disabled={items.length === 0} onPress={review} buttonRef={(el) => { reviewButton.current = el; }} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
