import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { BillGrid } from '../../../components/bill-grid';
import { Btn, SearchIcon, T, TextAction, TextField, useTheme } from '../../../components/controls';
import { DateField } from '../../../components/date-field';
import { Page, usePageMetrics } from '../../../components/page';
import { MenuItem, Popover } from '../../../components/popover';
import { Sheet } from '../../../components/sheet';
import { FilterChip, PaymentBadge, remainingTone } from '../../../components/payment-status';
import type { PaymentStatus } from '../../../data/db/schema';
import { newReceiptPaymentSubmissionId, receiptPaymentHistory, recordReceiptPayment, renameParty, setReceiptPaid, useParties, useReceiptPaymentEntries, useReceipts, type Receipt } from '../../../data/repository';
import { formatLong, formatTime, localDate } from '../../../data/statements';
import { num, rupees } from '../../../mock/data';

const money = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 9);
const when = (at: string) => `${formatLong(localDate(at))}, ${formatTime(at)}`;

/**
 * `review`: the receipts have no reliable mobile number, so they are kept apart (never merged) for a manual check.
 * purchase / paid / outstanding add up each receipt's own payment summary (once per receipt, so no payment is counted twice) and
 * leave out older receipts that have no recorded purchase amount (`noAmount` counts them).
 */
type Party = { key: string; id: string | null; name: string; phone: string; review: boolean; receipts: Receipt[]; units: number; purchase: number; paid: number; outstanding: number; noAmount: number };

/** Details, Record Payment and the payment history of ONE receipt. */
function ReceiptPaymentsSheet({ receipt, partyName, onClose }: { receipt: Receipt; partyName: string; onClose: () => void }) {
  const t = useTheme();
  const history = receiptPaymentHistory(receipt, useReceiptPaymentEntries());
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One id per submission of THIS payment: pressing Record again, or retrying after an error, reuses it, so it is recorded once.
  const submission = useRef<{ key: string; id: string } | null>(null);
  const remaining = receipt.remainingAmount ?? 0;
  const entered = Math.round((Number(amount) || 0) * 100) / 100;
  const tooMuch = entered > remaining;
  const tone = remainingTone(remaining, receipt.paidAmount);

  const record = async () => {
    if (saving) return;
    if (entered <= 0) return setError('Enter a payment above 0.');
    if (tooMuch) return setError(`Payment cannot be more than the remaining balance of ${rupees(remaining)}.`);
    setSaving(true);
    const key = `${receipt.id}|${entered}`;
    if (submission.current?.key !== key) submission.current = { key, id: newReceiptPaymentSubmissionId() };
    const r = await recordReceiptPayment(receipt.id, entered, submission.current.id);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    submission.current = null;
    setAmount('');
    setError(null);
  };

  const row = (label: string, value: ReactNode) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <T size={14} muted>
        {label}
      </T>
      {value}
    </View>
  );
  return (
    <Sheet title="Payments" onClose={onClose}>
      <View style={{ padding: 20, gap: 12 }}>
        <T size={14} muted>
          {partyName} · {when(receipt.at)} · {num(receipt.units)} units
        </T>
        <View style={{ gap: 8, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: t.border }}>
          {row('Purchase Amount', <T size={15} weight="600">{rupees(receipt.totalAmount ?? 0)}</T>)}
          {row('Total Paid', <T size={15} weight="600">{rupees(receipt.paidAmount)}</T>)}
          {row('Remaining', <T size={17} weight="700" style={{ color: tone.fg }}>{rupees(remaining)}</T>)}
          {row('Status', <PaymentBadge status={receipt.status} />)}
        </View>

        {receipt.status === 'paid' ? (
          <T size={14} muted>
            This receipt is fully paid.
          </T>
        ) : (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 140 }}>
                <TextField label="Payment Amount" value={amount} onChangeText={(v) => (setAmount(money(v)), setError(null))} keyboardType="decimal-pad" />
              </View>
              <Btn title={saving ? 'Recording…' : 'Record Payment'} disabled={saving} onPress={record} />
            </View>
            {error || tooMuch ? (
              <T size={12} weight="500" style={{ color: t.danger }}>
                {error ?? `Payment cannot be more than the remaining balance of ${rupees(remaining)}.`}
              </T>
            ) : null}
          </View>
        )}

        <T size={16} weight="700" style={{ marginTop: 4 }}>
          Payment History
        </T>
        {history.length === 0 ? (
          <T size={14} muted>
            No payments yet.
          </T>
        ) : (
          <View style={{ borderWidth: 1, borderColor: t.border, borderRadius: 8, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, height: 36, alignItems: 'center', backgroundColor: t.subtle }}>
              {['Date & Time', 'Amount', 'Paid', 'Remaining'].map((h, i) => (
                <T key={h} size={11} weight="600" muted style={{ flex: i === 0 ? 1.6 : 1, textAlign: i === 0 ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {h}
                </T>
              ))}
            </View>
            {history.map((h) => (
              <View key={h.id} style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: t.border }}>
                <T size={13} style={{ flex: 1.6 }}>{when(h.at)}</T>
                <T size={13} weight="600" style={{ flex: 1, textAlign: 'right' }}>{rupees(h.amount)}</T>
                <T size={13} style={{ flex: 1, textAlign: 'right' }}>{rupees(h.paidAfter)}</T>
                <T size={13} weight="600" style={{ flex: 1, textAlign: 'right', color: remainingTone(h.remainingAfter, h.paidAfter).fg }}>{rupees(h.remainingAfter)}</T>
              </View>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Btn title="Close" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}

// Stock Receive statement: stock received, grouped by the party it came from.
export default function StockReceivedScreen() {
  const { phone } = usePageMetrics();
  const t = useTheme();
  const receipts = useReceipts();
  const saved = useParties();
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | PaymentStatus>('all');
  const [payFor, setPayFor] = useState<string | null>(null); // the receipt whose Payments dialog is open
  const [confirmPay, setConfirmPay] = useState<Receipt | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  // Date filter: what is typed in the pickers (draft) and what is applied. Receipts are matched on their business date (Asia/Kolkata).
  const [fromDraft, setFromDraft] = useState('');
  const [toDraft, setToDraft] = useState('');
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  // Groups receipts into parties, newest first. Used for the receipts inside the applied date range and for all of them (the selector).
  const group = (source: Receipt[]) => {
    const names = new Map(saved.map((x) => [x.id, x.name]));
    const map = new Map<string, Party>();
    for (const r of source) {
      // One party per mobile number. A receipt without a reliable number stays on its own row.
      const key = r.partyId ?? `review:${r.id}`;
      const p = map.get(key) ?? { key, id: r.partyId, name: (r.partyId && names.get(r.partyId)) || r.partyName || 'No party recorded', phone: r.partyId ?? r.partyPhone, review: !r.partyId, receipts: [], units: 0, purchase: 0, paid: 0, outstanding: 0, noAmount: 0 };
      p.receipts.push(r);
      p.units += r.units;
      if (r.totalAmount === null) p.noAmount += 1;
      else {
        p.purchase += r.totalAmount;
        p.paid += r.paidAmount;
        p.outstanding += r.remainingAmount ?? 0;
      }
      map.set(key, p);
    }
    // Newest first, by the stored time (not the displayed text); equal times fall back to the receipt id so the order never flips.
    const newest = (a: Receipt, b: Receipt) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id);
    const list = [...map.values()];
    for (const p of list) p.receipts.sort(newest);
    return list.sort((a, b) => newest(a.receipts[0], b.receipts[0]) || a.key.localeCompare(b.key));
  };
  const inRange = (r: Receipt) => {
    if (!range) return true;
    const day = localDate(r.at); // the stored time's business date, never its display text
    return day >= range.from && day <= range.to;
  };
  const allParties = useMemo(() => group(receipts), [receipts, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const parties = useMemo(() => group(receipts.filter(inRange)), [receipts, saved, range]); // eslint-disable-line react-hooks/exhaustive-deps

  // A selected party stays selected when the dates leave it with no receipts: it then shows an empty range instead of vanishing.
  const party = parties.find((p) => p.key === open) ?? (open ? allParties.find((p) => p.key === open) && { ...(allParties.find((p) => p.key === open) as Party), receipts: [], units: 0, purchase: 0, paid: 0, outstanding: 0, noAmount: 0 } : undefined);
  const q = search.trim().toLowerCase();
  // Figures of a set of receipts, taken from the receipts themselves (each receipt once, so no payment is counted twice): the same rule as a
  // party row. Purchase / Paid / Outstanding leave out older receipts with no recorded purchase amount.
  const totalsOf = (rs: Receipt[]) =>
    rs.reduce(
      (t, r) => ({
        receipts: t.receipts + 1,
        units: t.units + r.units,
        purchase: t.purchase + (r.totalAmount ?? 0),
        paid: t.paid + (r.totalAmount === null ? 0 : r.paidAmount),
        outstanding: t.outstanding + (r.totalAmount === null ? 0 : (r.remainingAmount ?? 0)),
      }),
      { receipts: 0, units: 0, purchase: 0, paid: 0, outstanding: 0 },
    );
  const cents = (n: number) => Math.round(n * 100) / 100;
  const list = parties.filter((p) => p.name.toLowerCase().includes(q) || p.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')));

  const validDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  const applyDates = () => {
    if (!fromDraft || !toDraft) return setDateError('Choose both a From Date and a To Date.');
    if (!validDay(fromDraft) || !validDay(toDraft)) return setDateError('Enter the dates as yyyy-mm-dd.');
    if (fromDraft > toDraft) return setDateError('From Date cannot be after To Date.');
    setDateError(null);
    setRange({ from: fromDraft, to: toDraft });
  };
  const clearDates = () => {
    setFromDraft('');
    setToDraft('');
    setDateError(null);
    setRange(null);
  };
  const rangeText = range ? (range.from === range.to ? formatLong(range.from) : `${formatLong(range.from)} to ${formatLong(range.to)}`) : '';

  const dateBar = (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'flex-end', gap: 12 }}>
        <DateField label="From Date" value={fromDraft} onChange={(v) => { setFromDraft(v); setDateError(null); }} />
        <DateField label="To Date" value={toDraft} onChange={(v) => { setToDraft(v); setDateError(null); }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn title="Apply" fill={phone} onPress={applyDates} />
          <Btn title="Clear Dates" variant="secondary" fill={phone} disabled={!range && !fromDraft && !toDraft} onPress={clearDates} />
        </View>
      </View>
      {dateError ? (
        <T size={13} style={{ color: t.danger }}>
          {dateError}
        </T>
      ) : range ? (
        <T size={13} muted>
          Showing receipts from {rangeText}.
        </T>
      ) : null}
    </View>
  );

  const payment = (p: Party) => {
    const paid = p.receipts.filter((r) => r.paid).length;
    return `${paid} Paid / ${p.receipts.length - paid} Unpaid`;
  };
  const changePaid = async (r: Receipt, paid: boolean) => {
    setPayBusy(true);
    setPayError(null);
    const res = await setReceiptPaid(r.id, paid);
    setPayBusy(false);
    if (res.ok) setConfirmPay(null);
    else setPayError(res.error);
  };
  const shown = party ? party.receipts.filter((r) => status === 'all' || r.status === status) : [];
  const payReceipt = payFor ? receipts.find((r) => r.id === payFor) : undefined;

  const controls = (
    <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'flex-end', gap: 10, flex: phone ? 1 : undefined }}>
      <View style={{ width: phone ? undefined : 300 }}>
        <TextField label="" accessibilityLabel="Search parties" value={search} onChangeText={(v) => {
          setSearch(v);
          setOpen(null); // searching goes back to the party list
        }} placeholder="Search by party or mobile no..." leading={<SearchIcon />} autoCorrect={false} />
      </View>
      <PartySelect parties={allParties} value={open} onChange={setOpen} />
    </View>
  );

  return (
    <Page title="Statement" subtitle="Purchase receipts and supplier payment status." actions={controls} back={{ label: 'Stock', href: '/stock' }}>
      {dateBar}
      {party ? null : list.length === 0 ? (
        <T muted>{receipts.length === 0 ? 'No stock received yet. Use Add Stock on the Stock page to record a receipt.' : parties.length === 0 ? `No receipts from ${rangeText}.` : 'No parties match your search.'}</T>
      ) : (
        <BillGrid
          minWidth={phone ? 1000 : undefined}
          columns={[
            { label: 'Party', flex: 2 },
            { label: 'Mobile No.', width: phone ? 120 : 140 },
            { label: 'Receipts', width: 80, align: 'right' },
            { label: 'Units', width: 80, align: 'right' },
            { label: 'Purchase', width: 110, align: 'right' },
            { label: 'Paid', width: 110, align: 'right' },
            { label: 'Outstanding', width: 120, align: 'right' },
            { label: 'Last Received', width: phone ? 150 : 170 },
            { label: 'Actions', width: 90, align: 'right' },
          ]}
          // TOTAL of exactly the parties listed (the date range and the search applied), from their receipts.
          foot={(() => {
            const g = totalsOf(list.flatMap((p) => p.receipts));
            return { key: 'total', cells: ['TOTAL', '', num(g.receipts), num(g.units), rupees(cents(g.purchase)), rupees(cents(g.paid)), rupees(cents(g.outstanding)), '', ''] };
          })()}
          rows={list.map((p) => ({
            key: p.key,
            cells: [
              <View key="n" style={{ gap: 2 }}>
                <T size={15} weight={p.key === open ? '700' : '500'}>
                  {p.name}
                </T>
                <T size={12} muted>
                  {payment(p)}
                </T>
              </View>,
              p.review ? (
                <T key="m" size={15} style={{ color: t.warning }}>
                  {p.phone ? `${p.phone} (check)` : 'Missing'}
                </T>
              ) : (
                p.phone
              ),
              num(p.receipts.length),
              <T key="u" size={15} weight="600">
                {num(p.units)}
              </T>,
              rupees(p.purchase),
              rupees(p.paid),
              <T key="o" size={15} weight="600" style={{ color: remainingTone(p.outstanding, p.paid).fg }}>
                {rupees(p.outstanding)}
              </T>,
              formatLong(localDate(p.receipts[0].at)),
              // Shows this party's receipts below, on this page.
              <TextAction key="v" title="View" label={`View receipts from ${p.name}`} onPress={() => setOpen(p.key)} />,
            ],
          }))}
        />
      )}
      {party ? (
        <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <T size={19} weight="600" style={{ letterSpacing: -0.2 }}>
            Receipts — {party.name}
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {party.id && saved.some((x) => x.id === party.id) && editing === null ? <TextAction title="Edit Name" onPress={() => { setEditing(party.name); setNameError(null); }} /> : null}
            <TextAction title="Clear Selection" onPress={() => setOpen(null)} />
          </View>
        </View>
        <T size={14} muted>
          Mobile No.: {party.phone || '—'}
        </T>
        {party.review ? (
          <T size={13} style={{ color: t.warning }}>
            No valid mobile number on this receipt: needs a manual check.
          </T>
        ) : null}
        {editing !== null && party.id ? (
          <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'flex-end', gap: 10, maxWidth: 640 }}>
            <View style={{ flex: 1 }}>
              <TextField label="Party Name" value={editing} onChangeText={(v) => { setEditing(v); setNameError(null); }} error={nameError ?? undefined} />
            </View>
            <Btn title="Cancel" variant="secondary" disabled={saving} onPress={() => setEditing(null)} />
            <Btn
              title={saving ? 'Saving…' : 'Save Name'}
              disabled={saving}
              onPress={async () => {
                setSaving(true);
                const r = await renameParty(party.id as string, editing);
                setSaving(false);
                if (r.ok) setEditing(null);
                else setNameError(r.error);
              }}
            />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 6 }}>
          {([
            ['Receipts', num(party.receipts.length)],
            ['Total Purchase', rupees(party.purchase)],
            ['Total Paid', rupees(party.paid)],
            ['Total Outstanding', rupees(party.outstanding)],
          ] as const).map(([label, value]) => (
            <View key={label} style={{ gap: 2 }}>
              <T size={12} weight="600" muted style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {label}
              </T>
              <T size={17} weight="700" style={label === 'Total Outstanding' ? { color: remainingTone(party.outstanding, party.paid).fg } : undefined}>
                {value}
              </T>
            </View>
          ))}
        </View>
        {party.noAmount > 0 ? (
          <T size={12} muted>
            {num(party.noAmount)} older {party.noAmount === 1 ? 'receipt has' : 'receipts have'} no recorded purchase amount and {party.noAmount === 1 ? 'is' : 'are'} left out of these totals.
          </T>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {([
            ['all', 'All'],
            ['unpaid', 'Unpaid'],
            ['partial', 'Partially Paid'],
            ['paid', 'Fully Paid'],
          ] as const).map(([k, label]) => (
            <FilterChip key={k} label={label} status={k === 'all' ? undefined : k} selected={status === k} onPress={() => setStatus(k)} />
          ))}
        </View>
        {payError && !confirmPay ? (
          <T size={13} style={{ color: t.danger }}>
            {payError}
          </T>
        ) : null}
        {shown.length === 0 ? (
          <T muted>{party.receipts.length === 0 ? (range ? `No receipts from this party from ${rangeText}.` : 'No stock receipts for this party.') : `No ${status === 'all' ? '' : status === 'partial' ? 'partially paid ' : `${status} `}receipts for this party${range ? ` from ${rangeText}` : ''}.`}</T>
        ) : (
          <BillGrid
            minWidth={phone ? 1060 : undefined}
            columns={[
              { label: 'Date & Time', width: phone ? 170 : 220 },
              { label: 'Items', flex: 1 },
              { label: 'Quantity', width: 80, align: 'right' },
              { label: 'Purchase Amount', width: 130, align: 'right' },
              { label: 'Paid', width: 100, align: 'right' },
              { label: 'Remaining', width: 110, align: 'right' },
              { label: 'Payment Status', width: 150, align: 'center' },
              { label: 'Actions', width: 130, align: 'right' },
            ]}
            // Total of the receipts listed above for this party (date range and payment filter applied).
            foot={(() => {
              const g = totalsOf(shown);
              return { key: 'total', cells: ['Total', '', num(g.units), rupees(cents(g.purchase)), rupees(cents(g.paid)), rupees(cents(g.outstanding)), '', ''] };
            })()}
            rows={shown.map((r) => ({
              key: r.id,
              cells: [
                `${formatLong(localDate(r.at))}, ${formatTime(r.at)}`,
                // One product per line, not one long sentence.
                <View key="i" style={{ gap: 2 }}>
                  {r.lines.map((l, i) => (
                    <T key={`${l.name}-${i}`} size={15}>
                      {l.name} × {num(l.qty)}
                    </T>
                  ))}
                </View>,
                <T key="q" size={15} weight="600">
                  {num(r.units)}
                </T>,
                // Older receipts have no recorded purchase amount: it is shown as — and never guessed.
                r.totalAmount === null ? '—' : rupees(r.totalAmount),
                r.totalAmount === null ? '—' : rupees(r.paidAmount),
                r.remainingAmount === null ? (
                  '—'
                ) : (
                  <T key="rm" size={15} weight="600" style={{ color: remainingTone(r.remainingAmount, r.paidAmount).fg }}>
                    {rupees(r.remainingAmount)}
                  </T>
                ),
                <PaymentBadge key="p" status={r.status} />,
                r.totalAmount === null ? (
                  // Older receipt: the original Paid / Unpaid switch. Unpaid → Paid asks first (an accidental click would hide an unpaid bill); Paid → Unpaid is a plain correction.
                  <TextAction
                    key="a"
                    title={r.paid ? 'Mark Unpaid' : 'Mark Paid'}
                    label={`${r.paid ? 'Mark unpaid' : 'Mark paid'}: receipt of ${formatLong(localDate(r.at))}`}
                    onPress={() => (r.paid ? changePaid(r, false) : (setPayError(null), setConfirmPay(r)))}
                  />
                ) : (
                  <TextAction key="a" title={r.status === 'paid' ? 'View Payments' : 'Payments'} label={`Payments: receipt of ${formatLong(localDate(r.at))}`} onPress={() => setPayFor(r.id)} />
                ),
              ],
            }))}
          />
        )}
        {payReceipt && payReceipt.totalAmount !== null ? <ReceiptPaymentsSheet receipt={payReceipt} partyName={party.name} onClose={() => setPayFor(null)} /> : null}
        {confirmPay ? (
          <Sheet title="Mark this bill as Paid?" onClose={() => setConfirmPay(null)}>
            <View style={{ padding: 20, gap: 10 }}>
              <T size={15}>
                {party.name}: {formatLong(localDate(confirmPay.at))}, {formatTime(confirmPay.at)}. {num(confirmPay.units)} units.
              </T>
              <T size={13} muted>
                Only this bill changes. Stock is not affected, and you can mark it Unpaid again.
              </T>
              {payError ? (
                <T size={13} style={{ color: t.danger }}>
                  {payError}
                </T>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <Btn title="Cancel" variant="secondary" disabled={payBusy} onPress={() => setConfirmPay(null)} />
                <Btn title={payBusy ? 'Saving…' : 'Mark Paid'} disabled={payBusy} onPress={() => changePaid(confirmPay, true)} />
              </View>
            </View>
          </Sheet>
        ) : null}
        </View>
      ) : null}
    </Page>
  );
}

/** "Select Party" dropdown: picks a party and shows its receipts under the summary table. */
function PartySelect({ parties, value, onChange }: { parties: Party[]; value: string | null; onChange: (key: string | null) => void }) {
  const t = useTheme();
  const { phone } = usePageMetrics();
  const current = parties.find((p) => p.key === value);
  return (
    <Popover
      width={phone ? 320 : 340}
      renderTrigger={(open, isOpen) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select Party"
          accessibilityState={{ expanded: isOpen }}
          onPress={open}
          style={{ height: 46, width: phone ? undefined : 260, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 6, borderColor: isOpen ? t.accent : t.borderStrong, backgroundColor: t.surface }}>
          <T size={16} numberOfLines={1} style={{ flex: 1, color: current ? t.text : t.muted }}>
            {current?.name ?? 'Select Party'}
          </T>
          <T size={10} muted>
            {isOpen ? '▲' : '▼'}
          </T>
        </Pressable>
      )}>
      {(close) => (
        <View accessibilityRole="menu" style={{ maxHeight: 320 }}>
          <MenuItem label="All parties" checked={value === null} onPress={() => { close(); onChange(null); }} />
          {parties.map((p) => (
            <MenuItem key={p.key} label={`${p.name}${p.phone ? ` · ${p.phone}` : ''}`} checked={p.key === value} onPress={() => { close(); onChange(p.key); }} />
          ))}
        </View>
      )}
    </Popover>
  );
}
