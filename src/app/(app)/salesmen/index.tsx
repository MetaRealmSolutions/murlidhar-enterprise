import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { MenuItem, Popover } from '../../../components/popover';

import { useBillDateStatus } from '../../../components/bill-entry';
import { Btn, T, TextField, useTheme } from '../../../components/controls';
import { DateField } from '../../../components/date-field';
import { Page, usePageMetrics } from '../../../components/page';
import { SalesmanBills } from '../../../components/salesman-bills';
import { Sheet } from '../../../components/sheet';
import { deleteSalesman, saveSalesman, useBills, useSalesmen, type Salesman } from '../../../data/repository';
import { formatLong, todayISO } from '../../../data/statements';

type FormState = { id: string | null; name: string; phone: string };

function SalesmanForm({ value, onCancel, onSave, onDelete }: { value: FormState; onCancel: () => void; onSave: (v: FormState) => Promise<string | null>; onDelete: () => void }) {
  const t = useTheme();
  const [f, setF] = useState(value);
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editing = f.id !== null;

  const save = () => {
    if (!f.name.trim()) return setNameError('Enter the salesman name');
    if (saving) return;
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
        <TextField
          label="Name"
          value={f.name}
          onChangeText={(v) => {
            setF({ ...f, name: v });
            setNameError('');
          }}
          placeholder="e.g. Raj"
          error={nameError}
        />
        <TextField label="Mobile No." value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" placeholder="98250 11223" />
      </View>
      {saveError ? (
        <T size={13} style={{ color: t.danger, paddingHorizontal: 20, paddingBottom: 12 }}>
          {saveError}
        </T>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.subtle, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }}>
        <View>{editing ? <Btn title="Delete" variant="danger" onPress={onDelete} /> : null}</View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn title="Cancel" variant="secondary" onPress={onCancel} />
          <Btn title={saving ? 'Saving…' : editing ? 'Save' : 'Add Salesman'} disabled={saving} onPress={save} />
        </View>
      </View>
    </>
  );
}

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
    <Sheet title="Delete Salesman?" onClose={onCancel}>
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

/** "Select Salesman" dropdown: chooses whose Bill Entry is shown below. */
function SalesmanSelect({ salesmen, value, onChange }: { salesmen: Salesman[]; value: string | null; onChange: (id: string) => void }) {
  const t = useTheme();
  const { phone } = usePageMetrics();
  const current = salesmen.find((s) => s.id === value);
  return (
    <View style={{ gap: 6, maxWidth: phone ? undefined : 360 }}>
      <T size={14} weight="500">
        Select Salesman
      </T>
      <Popover
        width={phone ? 320 : 360}
        renderTrigger={(open, isOpen) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select Salesman"
            accessibilityState={{ expanded: isOpen }}
            onPress={open}
            style={{ height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 6, borderColor: isOpen ? t.accent : t.borderStrong, backgroundColor: t.surface }}>
            <T size={16} numberOfLines={1} style={{ flex: 1, color: current ? t.text : t.muted }}>
              {current?.name ?? 'Choose a salesman'}
            </T>
            <T size={10} muted>
              {isOpen ? '▲' : '▼'}
            </T>
          </Pressable>
        )}>
        {(close) => (
          <View accessibilityRole="menu" style={{ maxHeight: 320 }}>
            {salesmen.map((s) => (
              <MenuItem
                key={s.id}
                label={s.name}
                checked={s.id === value}
                onPress={() => {
                  close();
                  onChange(s.id);
                }}
              />
            ))}
          </View>
        )}
      </Popover>
    </View>
  );
}

/** The selected bill's date above its status badge, at the top right of the page on the title's row (stacked under the title on phones). */
function BillDateStatus({ salesman, date, editing }: { salesman: Salesman; date: string; editing: boolean }) {
  const t = useTheme();
  const { phone } = usePageMetrics();
  const status = useBillDateStatus(salesman.id, date);
  const tag = status === 'live' ? { text: 'OPEN', color: t.success } : status === 'finalized' ? (editing ? { text: 'EDIT', color: t.warning } : { text: 'FINALIZED', color: t.accent }) : { text: 'NO BILL', color: t.muted };
  return (
    <View style={{ alignItems: phone ? 'flex-start' : 'flex-end', gap: 6 }}>
      <T size={phone ? 18 : 22} weight="700" style={{ letterSpacing: -0.3 }}>
        {formatLong(date)}
      </T>
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: tag.color }}>
        <T size={12} weight="700" style={{ color: tag.color, letterSpacing: 0.6 }}>
          {tag.text}
        </T>
      </View>
    </View>
  );
}

/**
 * Salesmen: ONE page. Top: the only salesman selector (dropdown) with Add Salesman and Edit (the
 * selected salesman). Below: the selected salesman's header and Bill Entry. Changing the dropdown
 * only changes what is shown; the page (/salesmen) never changes. `?salesman=<id>` pre-selects one.
 */
export default function SalesmenScreen() {
  const { phone } = usePageMetrics();
  const t = useTheme();
  const salesmen = useSalesmen();
  const params = useLocalSearchParams<{ salesman?: string; t?: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(params.salesman ?? null);
  const [handled, setHandled] = useState(params.salesman ? `${params.salesman}|${params.t ?? ''}` : '');
  const link = params.salesman ? `${params.salesman}|${params.t ?? ''}` : '';
  if (link && link !== handled) {
    setHandled(link);
    setSelectedId(params.salesman ?? null);
  }
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<FormState | null>(null);

  // Bill Date: today's Asia/Kolkata business date until the owner picks another. `dateInput` is what the box shows while typing; `billDate`
  // is the date applied. A date is applied only when it is a real yyyy-mm-dd. If Add More / Return values are typed but unsaved, the owner
  // is asked first (the entry below reports that through dirtyRef), so nothing typed for one date can end up on another.
  const [billDate, setBillDate] = useState(() => todayISO());
  const [dateInput, setDateInput] = useState(() => todayISO());
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  // The same-day correction form is open (the header badge then reads EDIT). Leaving the date or the salesman closes it without saving.
  const [editing, setEditing] = useState(false);
  const realDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  const applyDate = (v: string) => {
    setEditing(false);
    setBillDate(v);
    setDateInput(v);
  };
  const pickDate = (v: string) => {
    setDateInput(v);
    if (!realDay(v) || v === billDate) return;
    if (dirtyRef.current) return setConfirmDate(v);
    applyDate(v);
  };
  // Nobody picked yet (or the picked one was deleted): the first salesman is shown.
  const selected = salesmen.find((s) => s.id === selectedId) ?? salesmen[0] ?? null;
  // The earliest bill of the selected salesman that still waits for its Return (the oldest unfinalized bill dated before the working day; see
  // salesmanBills). Any later date can be selected without hiding it: the notice below opens THAT date's Return, and confirming it brings the
  // owner back to the date they were on. The Return is saved against the pending bill's own date, never the selected one.
  const outstanding = useBills(selected?.id ?? '').pending;
  const [returnFlow, setReturnFlow] = useState<{ from: string; entering: string } | null>(null);
  if (returnFlow && outstanding?.date !== returnFlow.entering) {
    setReturnFlow(null);
    applyDate(returnFlow.from);
  }

  const save = async (f: FormState): Promise<string | null> => {
    const result = await saveSalesman({ id: f.id ?? undefined, name: f.name, phone: f.phone });
    if (!result.ok) return result.error;
    setForm(null);
    return null;
  };

  const remove = async (): Promise<string | null> => {
    if (!deleting?.id) return null;
    const result = await deleteSalesman(deleting.id);
    if (!result.ok) return result.error;
    if (deleting.id === selectedId) setSelectedId(null);
    setDeleting(null);
    setForm(null);
    return null;
  };

  return (
    <Page title="Add New Bill Entry" actions={selected ? <BillDateStatus salesman={selected} date={billDate} editing={editing} /> : undefined} wide>
      <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: phone ? undefined : 1, flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'flex-end', gap: 12 }}>
          <View style={{ flex: phone ? undefined : 1 }}>
            <SalesmanSelect salesmen={salesmen} value={selected?.id ?? null} onChange={(id) => (setEditing(false), setReturnFlow(null), setSelectedId(id))} />
          </View>
          <DateField label="Bill Date" value={dateInput} onChange={pickDate} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Btn title="+ Add Salesman" fill={phone} onPress={() => setForm({ id: null, name: '', phone: '' })} />
          {selected ? <Btn title="Edit" variant="secondary" fill={phone} onPress={() => setForm({ id: selected.id, name: selected.name, phone: selected.phone })} /> : null}
        </View>
      </View>

      {selected && outstanding && outstanding.date !== billDate ? (
        <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderWidth: 1, borderRadius: 6, borderColor: t.warning, backgroundColor: t.subtle }}>
          <T size={14} weight="600" style={{ flex: phone ? undefined : 1 }}>
            Return pending for {formatLong(outstanding.date)}. Enter it before relying on later dates&apos; Fillup.
          </T>
          <Btn
            title="Enter Pending Return"
            fill={phone}
            onPress={() => {
              setReturnFlow({ from: billDate, entering: outstanding.date });
              pickDate(outstanding.date);
            }}
          />
        </View>
      ) : null}

      {selected ? (
        <View style={{ gap: 20, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 20 }}>
          <SalesmanBills key={selected.id} salesman={selected} date={billDate} dirtyRef={dirtyRef} editing={editing} onEditing={setEditing} />
        </View>
      ) : (
        <T muted>No salesmen yet. Use Add Salesman to start.</T>
      )}

      {form && (
        <Sheet title={form.id ? 'Edit Salesman' : 'Add Salesman'} onClose={() => setForm(null)}>
          <SalesmanForm value={form} onCancel={() => setForm(null)} onSave={save} onDelete={() => setDeleting(form)} />
        </Sheet>
      )}
      {confirmDate ? (
        <Sheet
          title="Discard unsaved entries?"
          onClose={() => {
            setDateInput(billDate);
            setConfirmDate(null);
          }}>
          <View style={{ padding: 20, gap: 16 }}>
            <T size={15}>Add More or Return quantities have been entered but not saved. Changing the Bill Date to {formatLong(confirmDate)} will discard them.</T>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <Btn
                title="Keep Editing"
                variant="secondary"
                onPress={() => {
                  setDateInput(billDate);
                  setConfirmDate(null);
                }}
              />
              <Btn
                title="Discard and Change Date"
                onPress={() => {
                  dirtyRef.current = false;
                  applyDate(confirmDate);
                  setConfirmDate(null);
                }}
              />
            </View>
          </View>
        </Sheet>
      ) : null}
      {deleting && <ConfirmDelete name={deleting.name} onCancel={() => setDeleting(null)} onConfirm={remove} />}
    </Page>
  );
}
