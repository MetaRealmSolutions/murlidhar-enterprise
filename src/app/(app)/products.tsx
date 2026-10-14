import { useMemo, useRef, useState } from 'react';
import { RequireAccess } from '../../components/require-access';
import { TextInput, View } from 'react-native';

import { Btn, SearchIcon, T, TextAction, TextField, useTheme } from '../../components/controls';
import { Page, SimpleTable, usePageMetrics, type Col } from '../../components/page';
import { Sheet } from '../../components/sheet';
import { addProduct, deleteProduct, initializeOpeningStock, moveProduct, newOpeningSubmissionId, updateProduct, useOutstandingByProduct, useProducts, type Product } from '../../data/repository';
import { focusAfterSave, openingRowView } from '../../data/opening-stock';
import { rupees } from '../../mock/data';

const digits = (s: string) => s.replace(/[^0-9]/g, '');

type FormState = { id: string | null; name: string; amount: string; commission: string; /** Minimum Stock: at or below it (and above 0) the product is Low Stock. */ minimumStock: string; /** Starting stock, only asked when adding. */ stock: string; /** Serial / position in the Item Master order (blank = last when adding). */ serial: string };
type SortKey = 'name' | 'amount' | 'commission';
type Errors = Partial<Record<'name' | 'amount' | 'commission' | 'minimumStock' | 'stock' | 'serial', string>>;

function ProductForm({
  value,
  onCancel,
  onSave,
  onDelete,
}: {
  value: FormState;
  onCancel: () => void;
  /** Resolves with an error message to show, or null once saved. */
  onSave: (v: FormState) => Promise<string | null>;
  onDelete: () => void;
}) {
  const t = useTheme();
  const [f, setF] = useState(value);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editing = f.id !== null;
  const set = (k: 'name' | 'amount' | 'commission' | 'minimumStock' | 'stock' | 'serial') => (v: string) => {
    setF({ ...f, [k]: k === 'name' ? v : digits(v) });
    if (k in errors) setErrors({ ...errors, [k]: undefined });
  };

  const save = () => {
    const e: Errors = {};
    if (!f.name.trim()) e.name = 'Enter a product name';
    if (!f.amount) e.amount = 'Enter the price';
    if (!f.commission) e.commission = 'Enter the commission';
    if (!f.minimumStock) e.minimumStock = 'Enter the minimum stock (0 or more)';
    if (editing && !f.serial) e.serial = 'Enter the serial number';
    if (!editing && !f.stock) e.stock = 'Enter the initial stock (0 or more)';
    setErrors(e);
    if (Object.keys(e).length > 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    onSave(f).then((message) => {
      setSaving(false);
      setSaveError(message);
    });
  };

  return (
    <>
      <View style={{ padding: 20, gap: 16 }}>
        <TextField label="Item" value={f.name} onChangeText={set('name')} placeholder="e.g. Item A" error={errors.name} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TextField label="Amount" prefix="₹" value={f.amount} onChangeText={set('amount')} keyboardType="number-pad" placeholder="500" error={errors.amount} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Commission" prefix="₹" value={f.commission} onChangeText={set('commission')} keyboardType="number-pad" placeholder="20" error={errors.commission} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TextField label="Minimum Stock" value={f.minimumStock} onChangeText={set('minimumStock')} keyboardType="number-pad" placeholder="0" error={errors.minimumStock} hint="At or below this, stock shows as Low." />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {!editing && (
            <View style={{ flex: 1 }}>
              <TextField label="Initial Stock" value={f.stock} onChangeText={set('stock')} keyboardType="number-pad" placeholder="0" error={errors.stock} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <TextField label="Serial / Position" value={f.serial} onChangeText={set('serial')} keyboardType="number-pad" placeholder="Last" error={errors.serial} hint="Items from here move down by one." />
          </View>
        </View>
      </View>
      {saveError ? (
        <T size={13} style={{ color: t.danger, paddingHorizontal: 20, paddingBottom: 12 }}>
          {saveError}
        </T>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderTopWidth: 1,
          borderTopColor: t.border,
          backgroundColor: t.subtle,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
        }}>
        <View>{editing ? <Btn title="Delete" variant="danger" onPress={onDelete} /> : null}</View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn title="Cancel" variant="secondary" onPress={onCancel} />
          <Btn title={saving ? 'Saving…' : editing ? 'Save' : 'Add Item'} disabled={saving} onPress={save} />
        </View>
      </View>
    </>
  );
}

/** Asks before anything is deleted. */
function ConfirmDelete({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => Promise<string | null> }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    const message = await onConfirm();
    setBusy(false);
    setError(message);
  };
  return (
    <Sheet title="Delete Item?" onClose={onCancel}>
      <View style={{ padding: 20, gap: 8 }}>
        <T size={15}>Are you sure you want to delete &quot;{name}&quot;?</T>
        {error ? (
          <T size={13} style={{ color: t.danger }}>
            {error}
          </T>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.subtle, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>
        <Btn title="Cancel" variant="secondary" onPress={onCancel} />
        <Btn title={busy ? 'Deleting…' : 'Delete'} variant="danger" disabled={busy} onPress={run} />
      </View>
    </Sheet>
  );
}

/** Products: the product master. Name, price and commission, with Add, Edit and Delete. Nothing about stock. */
function ProductsScreen() {
  const { phone } = usePageMetrics();
  const products = useProducts();
  const t = useTheme();
  const withSalesmen = useOutstandingByProduct();
  // Opening Stock: the typed count per product (kept until that product is saved), per-row and overall feedback, and which rows are saving.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rowMsg, setRowMsg] = useState<Record<string, { ok: boolean; text: string } | null>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  // One id per product's pending save, kept until it succeeds (see saveRows).
  const submissionIds = useRef<Record<string, { key: string; id: string }>>({});
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<FormState | null>(null);
  // Tap a header to sort by it (ascending first); tap it again to reverse. A new column starts ascending.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const sortBy = (key: SortKey) => setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  // Position in the saved Item Master order (useProducts is already in that order); search and header sorts never change it.
  const position = useMemo(() => new Map(products.map((p, i) => [p.id, i + 1])), [products]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = products.filter((p) => p.name.toLowerCase().includes(q));
    if (!sort) return out;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const byName = (a: Product, b: Product) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    const key = sort.key;
    return [...out].sort((a, b) => (key === 'name' ? dir * byName(a, b) : dir * (a[key] - b[key]) || byName(a, b)));
  }, [products, search, sort]);
  const head = (key: SortKey): Pick<Col<Product>, 'onHeaderPress' | 'sort'> => ({ onHeaderPress: () => sortBy(key), sort: sort?.key === key ? sort.dir : null });

  // Opening Stock (initial inventory). `stock` is the balance; the count the owner types and saves REPLACES it, whatever the product's history.
  const view = (p: Product) => openingRowView(p, drafts[p.id]);
  const pendingRows = products.filter((p) => view(p).pending);
  const busy = savingIds.size > 0;
  // Row inputs by stable product id (never by row index), and the rows as currently listed, for Enter-to-next (focus only, never a save).
  const inputs = useRef(new Map<string, TextInput>());
  const orderRef = useRef<string[]>([]);
  orderRef.current = list.map((p) => p.id);

  const edited = (p: Product, v: string) => {
    setDrafts((d) => ({ ...d, [p.id]: digits(v) }));
    setRowMsg((m) => (m[p.id] ? { ...m, [p.id]: null } : m));
    setNotice(null);
  };

  /**
   * Saves these rows now. Each is its own awaited transaction, so a row is reported saved only after it committed, one failure never blocks the
   * others, and the typed counts of every other row stay as they are. The submission id belongs to the exact count being saved and is kept until
   * it succeeds, so pressing Save again after a failure or a dropped connection can never apply the same count twice.
   * Returns each row's outcome (nothing while another save is running).
   */
  const saveRows = async (rows: Product[]): Promise<Record<string, boolean> | null> => {
    if (busy || rows.length === 0) return null;
    const outcome: Record<string, boolean> = {};
    const bad: Record<string, { ok: boolean; text: string }> = {};
    const valid = rows.filter((p) => {
      if (view(p).valid) return true;
      outcome[p.id] = false;
      bad[p.id] = { ok: false, text: 'Enter a whole number of 0 or more.' };
      return false;
    });
    setRowMsg((m) => ({ ...m, ...bad }));
    if (valid.length === 0) return outcome;
    setSavingIds(new Set(valid.map((p) => p.id)));
    setNotice(null);
    const results = await initializeOpeningStock(
      valid.map((p) => {
        const counted = Number(drafts[p.id]);
        const key = String(counted);
        const kept = submissionIds.current[p.id];
        const entry = kept && kept.key === key ? kept : { key, id: newOpeningSubmissionId() };
        submissionIds.current[p.id] = entry;
        return { id: p.id, counted, submissionId: entry.id };
      }),
    );
    const saved = valid.filter((p) => results[p.id]?.ok).map((p) => p.id);
    for (const id of saved) delete submissionIds.current[id];
    for (const p of valid) outcome[p.id] = results[p.id]?.ok === true;
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([id]) => !saved.includes(id))));
    setRowMsg((m) => ({
      ...m,
      ...Object.fromEntries(
        valid.map((p) => {
          const r = results[p.id];
          return [p.id, r?.ok ? { ok: true, text: 'Saved' } : { ok: false, text: r && !r.ok ? r.error : 'Unable to save.' }];
        }),
      ),
    }));
    setSavingIds(new Set());
    if (rows.length > 1) {
      const failed = valid.length - saved.length + Object.keys(bad).length;
      setNotice(failed === 0 ? { ok: true, text: `Opening stock saved for ${saved.length} items.` } : { ok: false, text: `${saved.length} saved, ${failed} not saved. See the highlighted rows.` });
    }
    return outcome;
  };

  /** Enter: only moves to the next row's input. It never saves; the typed value stays an unsaved change until Save or Save All is pressed. */
  const focusNextRow = (p: Product) => {
    const next = focusAfterSave(orderRef.current, p.id, true, (id) => inputs.current.has(id));
    const box = next ? inputs.current.get(next) : undefined;
    if (!box) return; // last input: nothing happens
    box.focus();
    // The browser scrolls a focused field into view; this also centres it (a no-op where there is no DOM).
    (box as unknown as { scrollIntoView?: (o: object) => void }).scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  const stockCell = (p: Product) => {
    const saving = savingIds.has(p.id);
    const msg = rowMsg[p.id];
    const v = view(p);
    return (
      <View style={{ gap: 3, paddingVertical: 4, alignItems: 'flex-end' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {saving ? (
            <T size={12} muted>
              Saving…
            </T>
          ) : v.pending ? (
            <TextAction title="Save" label={`Save opening stock for ${p.name}`} onPress={() => saveRows([p])} />
          ) : null}
          <TextInput
            ref={(el) => {
              if (el) inputs.current.set(p.id, el);
              else inputs.current.delete(p.id);
            }}
            value={v.value}
            onChangeText={(x) => edited(p, x)}
            editable={!saving}
            keyboardType="number-pad"
            inputMode="numeric"
            returnKeyType="next"
            blurOnSubmit={false}
            selectTextOnFocus
            accessibilityLabel={`Opening stock for ${p.name}`}
            onSubmitEditing={() => focusNextRow(p)}
            style={{ width: phone ? 60 : 84, height: 36, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, fontSize: 15, color: t.text, backgroundColor: v.pending ? t.subtle : t.surface, borderColor: msg && !msg.ok ? t.danger : v.pending ? t.accent : t.borderStrong, textAlign: 'right', outlineStyle: 'none' } as object}
          />
        </View>
        {msg ? (
          <T size={11} style={{ color: msg.ok ? t.success : t.danger }}>
            {msg.text}
            {msg.ok ? ` · stock now ${p.stock}` : ''}
          </T>
        ) : (
          <T size={11} muted>
            {v.pending ? 'Unsaved · ' : v.saved ? `Saved ${p.openingStock} · ` : 'Not entered · '}Stock now {p.stock}
            {(withSalesmen[p.id] ?? 0) > 0 ? ` · ${withSalesmen[p.id]} with salesmen (part of this stock)` : ''}
          </T>
        )}
      </View>
    );
  };

  const openAdd = () => setForm({ id: null, name: '', amount: '', commission: '', minimumStock: '0', stock: '', serial: '' });
  const openEdit = (p: Product) => setForm({ id: p.id, name: p.name, amount: String(p.amount), commission: String(p.commission), minimumStock: String(p.minimumStock ?? 0), stock: '', serial: String(position.get(p.id) ?? '') });

  const save = async (f: FormState): Promise<string | null> => {
    const amount = Number(f.amount);
    const commission = Number(f.commission);
    let result;
    if (f.id) {
      result = await updateProduct(f.id, { name: f.name, amount, commission, minimumStock: Number(f.minimumStock) });
      if (result.ok && Number(f.serial) !== position.get(f.id)) result = await moveProduct(f.id, Number(f.serial));
    } else {
      result = await addProduct({ name: f.name, amount, commission, minimumStock: Number(f.minimumStock), openingStock: Number(f.stock), position: f.serial ? Number(f.serial) : undefined });
    }
    if (!result.ok) return result.error;
    setForm(null);
    return null;
  };

  const remove = async (): Promise<string | null> => {
    if (!deleting?.id) return null;
    const result = await deleteProduct(deleting.id);
    if (!result.ok) return result.error;
    setDeleting(null);
    setForm(null);
    return null;
  };

  const edit = (p: Product) => <TextAction title="Edit" label={`Edit ${p.name}`} onPress={() => openEdit(p)} />;

  return (
    <Page
      title="Item Master"
      actions={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn title={busy ? 'Saving…' : pendingRows.length > 0 ? `Save All (${pendingRows.length})` : 'Save All'} variant="secondary" disabled={busy || pendingRows.length === 0} onPress={() => saveRows(pendingRows)} />
          <Btn title="+ Add Item" fill={phone} onPress={openAdd} />
        </View>
      }>
      <View style={{ maxWidth: phone ? undefined : 480 }}>
        <TextField label="" accessibilityLabel="Search items" value={search} onChangeText={setSearch} placeholder="Search items..." leading={<SearchIcon />} autoCorrect={false} autoCapitalize="none" />
      </View>
      {notice ? (
        <T size={13} style={{ color: notice.ok ? t.success : t.danger }}>
          {notice.text}
        </T>
      ) : null}
      <SimpleTable
        columns={
          phone
            ? [
                { label: 'Sr.', width: 52, render: (p) => String(position.get(p.id)) },
                { label: 'Item', weight: '500', render: (p) => p.name, ...head('name') },
                { label: 'Opening Stock', width: 132, align: 'right', action: true, render: stockCell },
                { label: 'Amount', width: 78, align: 'right', render: (p) => rupees(p.amount), ...head('amount') },
                { label: 'Comm.', width: 80, align: 'right', render: (p) => rupees(p.commission), ...head('commission') },
                { label: 'Edit', width: 64, align: 'right', render: edit },
              ]
            : [
                { label: 'Sr. No.', width: 80, render: (p) => String(position.get(p.id)) },
                { label: 'Item', weight: '500', render: (p) => p.name, ...head('name') },
                { label: 'Opening Stock', width: 200, align: 'right', action: true, render: stockCell },
                { label: 'Amount', width: 140, align: 'right', render: (p) => rupees(p.amount), ...head('amount') },
                { label: 'Commission', width: 150, align: 'right', render: (p) => rupees(p.commission), ...head('commission') },
                { label: 'Edit', width: 80, align: 'right', render: edit },
              ]
        }
        rows={list}
        keyOf={(p) => p.id}
        minWidth={phone ? 540 : undefined}
        grid
        empty={{ title: 'No products found.', note: 'Try another product name, or add a product.' }}
      />
      {form && (
        <Sheet title={form.id ? 'Edit Item' : 'Add Item'} onClose={() => setForm(null)}>
          <ProductForm value={form} onCancel={() => setForm(null)} onSave={save} onDelete={() => setDeleting(form)} />
        </Sheet>
      )}
      {deleting && <ConfirmDelete name={deleting.name} onCancel={() => setDeleting(null)} onConfirm={remove} />}
    </Page>
  );
}

export default function GuardedProductsScreen() {
  return (
    <RequireAccess area="owner">
      <ProductsScreen />
    </RequireAccess>
  );
}
