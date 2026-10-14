import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { Btn, SearchIcon, T, TextAction, TextField, useTheme } from '../../../components/controls';
import { DateField } from '../../../components/date-field';
import { Page, SimpleTable, usePageMetrics } from '../../../components/page';
import { PeriodFilter, usePeriodFilter } from '../../../components/period-filter';
import { Sheet } from '../../../components/sheet';
import { useSyncState } from '../../../data/db/database';
import { deleteExpense, newExpenseSubmissionId, saveExpense, updateExpense, useExpenses, type Expense } from '../../../data/repository';
import { formatLong, periodText, todayISO } from '../../../data/statements';
import { rupees } from '../../../mock/data';

const money = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 9);
const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Expense: the owner records any business expense (petrol, tea, salary, ...). The page is behind the owner-only /more layout, and the
 * Firestore rules allow expenses to the owner alone. Expenses never touch stock, purchases or bills; the Home dashboard sums them by date.
 */
export default function ExpenseScreen() {
  const t = useTheme();
  const { phone } = usePageMetrics();
  const sync = useSyncState();
  const expenses = useExpenses();
  const period = usePeriodFilter();
  const { range } = period;
  const [search, setSearch] = useState('');

  // The form: adds an expense, or edits one (editing = its id).
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => todayISO());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One id per submission of THIS new expense: pressing Add again or retrying after an error reuses it, so it is recorded once.
  const submission = useRef<{ key: string; id: string } | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const list = useMemo(() => {
    if (!range) return [];
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => e.date >= range.from && e.date <= range.to && e.title.toLowerCase().includes(q));
  }, [expenses, range?.from, range?.to, search]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = cents(list.reduce((n, e) => n + e.amount, 0));

  const reset = () => {
    setEditing(null);
    setTitle('');
    setAmount('');
    setDate(todayISO());
    setNotes('');
    setError(null);
    submission.current = null;
  };
  const startEdit = (e: Expense) => {
    setEditing(e.id);
    setTitle(e.title);
    setAmount(String(e.amount));
    setDate(e.date);
    setNotes(e.notes);
    setError(null);
  };
  const save = async () => {
    if (saving) return;
    const input = { title, amount: Number(amount), date, notes };
    setSaving(true);
    setError(null);
    let r;
    if (editing) r = await updateExpense(editing, input);
    else {
      const key = JSON.stringify(input);
      if (submission.current?.key !== key) submission.current = { key, id: newExpenseSubmissionId() };
      r = await saveExpense(input, submission.current.id);
    }
    setSaving(false);
    if (!r.ok) return setError(r.error); // nothing is cleared: the form stays for correcting
    reset();
  };
  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    const r = await deleteExpense(deleting.id);
    setDeleteBusy(false);
    if (!r.ok) return setDeleteError(r.error);
    if (editing === deleting.id) reset();
    setDeleting(null);
  };

  if (sync.status === 'error') {
    return (
      <Page title="Expense" subtitle="Record business expenses.">
        <T style={{ color: t.danger }}>{sync.error ?? 'Unable to load your data.'}</T>
      </Page>
    );
  }
  if (sync.status !== 'ready') {
    return (
      <Page title="Expense" subtitle="Record business expenses.">
        <T muted>Loading expenses…</T>
      </Page>
    );
  }

  return (
    <Page title="Expense" subtitle={`Business expenses · ${range ? periodText(range.from, range.to) : 'choose a valid date range'}`} wide>
      <View style={{ gap: 12, maxWidth: 900 }}>
        <T size={18} weight="700">
          {editing ? 'Edit Expense' : 'Add Expense'}
        </T>
        <View style={{ flexDirection: phone ? 'column' : 'row', flexWrap: 'wrap', alignItems: phone ? 'stretch' : 'flex-start', gap: 12 }}>
          <View style={{ flex: 2, minWidth: phone ? undefined : 220 }}>
            <TextField label="Title" value={title} onChangeText={(v) => (setTitle(v), setError(null))} placeholder="e.g. Petrol" />
          </View>
          <View style={{ flex: 1, minWidth: phone ? undefined : 140 }}>
            <TextField label="Amount" prefix="₹" value={amount} onChangeText={(v) => (setAmount(money(v)), setError(null))} keyboardType="decimal-pad" />
          </View>
          <DateField label="Date" value={date} onChange={(v) => (setDate(v), setError(null))} />
        </View>
        <TextField label="Notes (optional)" value={notes} onChangeText={(v) => (setNotes(v), setError(null))} />
        {error ? (
          <T size={13} weight="500" style={{ color: t.danger }}>
            {error}
          </T>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn title={saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Expense'} disabled={saving} onPress={save} />
          {editing ? <Btn title="Cancel" variant="secondary" disabled={saving} onPress={reset} /> : null}
        </View>
      </View>

      <PeriodFilter f={period} phone={phone} />
      <View style={{ maxWidth: phone ? undefined : 360 }}>
        <TextField label="" accessibilityLabel="Search expenses" value={search} onChangeText={setSearch} placeholder="Search by title..." leading={<SearchIcon />} autoCorrect={false} />
      </View>

      <SimpleTable<Expense>
        compact
        minWidth={phone ? 640 : undefined}
        columns={[
          { label: 'Date', width: 150, render: (e) => formatLong(e.date) },
          { label: 'Title', weight: '500', render: (e) => e.title },
          { label: 'Notes', render: (e) => e.notes || '—' },
          { label: 'Amount', width: 120, align: 'right', weight: '600', render: (e) => rupees(e.amount) },
          {
            label: 'Actions',
            width: 150,
            align: 'right',
            render: (e) => (
              <View style={{ flexDirection: 'row' }}>
                <TextAction title="Edit" label={`Edit expense ${e.title}`} onPress={() => startEdit(e)} />
                <TextAction title="Delete" label={`Delete expense ${e.title}`} onPress={() => (setDeleteError(null), setDeleting(e))} />
              </View>
            ),
          },
        ]}
        rows={list}
        keyOf={(e) => e.id}
        foot={{ Date: 'Total', Amount: rupees(total) }}
        empty={{ title: period.error ?? 'No expenses found.', note: period.error ? undefined : 'Add an expense above, or change the period or search.' }}
      />

      {deleting ? (
        <Sheet title="Delete Expense?" onClose={() => (deleteBusy ? undefined : setDeleting(null))}>
          <View style={{ padding: 20, gap: 12 }}>
            <T size={15}>
              Delete &quot;{deleting.title}&quot; ({rupees(deleting.amount)}, {formatLong(deleting.date)})? This cannot be undone.
            </T>
            {deleteError ? (
              <T size={13} style={{ color: t.danger }}>
                {deleteError}
              </T>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Btn title="Cancel" variant="secondary" disabled={deleteBusy} onPress={() => setDeleting(null)} />
              <Btn title={deleteBusy ? 'Deleting…' : 'Delete'} variant="danger" disabled={deleteBusy} onPress={confirmDelete} />
            </View>
          </View>
        </Sheet>
      ) : null}
    </Page>
  );
}
