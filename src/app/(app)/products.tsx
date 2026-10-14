import { useMemo, useState } from 'react';
import { RequireAccess } from '../../components/require-access';
import { View } from 'react-native';

import { Btn, SearchIcon, T, TextAction, TextField, useTheme } from '../../components/controls';
import { Page, SimpleTable, usePageMetrics, type Col } from '../../components/page';
import { Sheet } from '../../components/sheet';
import { addProduct, deleteProduct, moveProduct, updateProduct, useProducts, type Product } from '../../data/repository';
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
    <Page title="Item Master" actions={<Btn title="+ Add Item" fill={phone} onPress={openAdd} />}>
      <View style={{ maxWidth: phone ? undefined : 480 }}>
        <TextField label="" accessibilityLabel="Search items" value={search} onChangeText={setSearch} placeholder="Search items..." leading={<SearchIcon />} autoCorrect={false} autoCapitalize="none" />
      </View>
      <SimpleTable
        columns={
          phone
            ? [
                { label: 'Sr.', width: 40, render: (p) => String(position.get(p.id)) },
                { label: 'Item', weight: '500', render: (p) => p.name, ...head('name') },
                { label: 'Amount', width: 78, align: 'right', render: (p) => rupees(p.amount), ...head('amount') },
                { label: 'Comm.', width: 80, align: 'right', render: (p) => rupees(p.commission), ...head('commission') },
                { label: 'Edit', width: 44, align: 'right', render: edit },
              ]
            : [
                { label: 'Sr. No.', width: 80, render: (p) => String(position.get(p.id)) },
                { label: 'Item', weight: '500', render: (p) => p.name, ...head('name') },
                { label: 'Amount', width: 140, align: 'right', render: (p) => rupees(p.amount), ...head('amount') },
                { label: 'Commission', width: 150, align: 'right', render: (p) => rupees(p.commission), ...head('commission') },
                { label: 'Edit', width: 80, align: 'right', render: edit },
              ]
        }
        rows={list}
        keyOf={(p) => p.id}
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
