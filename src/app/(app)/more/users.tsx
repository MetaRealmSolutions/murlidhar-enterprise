import { useState } from 'react';
import { Switch, View } from 'react-native';

import { Btn, T, TextAction, TextField, useTheme } from '../../../components/controls';
import { Page, SimpleTable, usePageMetrics } from '../../../components/page';
import { Sheet } from '../../../components/sheet';
import type { Permissions, UserProfile } from '../../../data/db/schema';
import { createEmployee, resetEmployeePassword, updateEmployee, useUsers } from '../../../data/repository';

const NONE: Permissions = { stockAccess: false, privateBillsAccess: false, salesmenAccess: false };
const PAGES: { key: keyof Permissions; label: string; note: string }[] = [
  { key: 'stockAccess', label: 'Stock', note: 'Warehouse stock, receiving stock, receipts and payment status. Never prices or commissions.' },
  { key: 'privateBillsAccess', label: 'Private Bills', note: 'Direct billing.' },
  { key: 'salesmenAccess', label: 'Salesmen', note: 'Stock given, returns, daily bills and statements.' },
];

type Form = { id: string | null; name: string; email: string; password: string; permissions: Permissions; active: boolean };

const summary = (u: UserProfile) =>
  u.role === 'owner' ? 'Full access' : PAGES.filter((p) => u.permissions?.[p.key]).map((p) => p.label).join(' · ') || 'No pages';

function EmployeeForm({ value, onCancel, onDone }: { value: Form; onCancel: () => void; onDone: () => void }) {
  const t = useTheme();
  const [f, setF] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const isNew = f.id === null;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = isNew ? await createEmployee({ name: f.name, email: f.email, password: f.password, permissions: f.permissions }) : await updateEmployee(f.id as string, { name: f.name, permissions: f.permissions, active: f.active });
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.error);
  };
  const reset = async () => {
    if (busy || !f.id) return;
    setBusy(true);
    setError(null);
    const r = await resetEmployeePassword(f.id);
    setBusy(false);
    if (r.ok) setNote(`A password-reset email was sent to ${f.email}.`);
    else setError(r.error);
  };
  const flag = (label: string, note2: string | undefined, on: boolean, set: (v: boolean) => void) => (
    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <T size={15} weight="500">
          {label}
        </T>
        {note2 ? (
          <T size={12} muted>
            {note2}
          </T>
        ) : null}
      </View>
      <Switch accessibilityLabel={label} value={on} onValueChange={set} trackColor={{ true: t.accent }} />
    </View>
  );

  return (
    <Sheet title={isNew ? 'Add Employee' : 'Edit Employee'} onClose={onCancel}>
      <View style={{ padding: 20, gap: 14 }}>
        <TextField label="Name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <TextField
          label="Login ID"
          value={f.email}
          onChangeText={(v) => setF({ ...f, email: v })}
          editable={isNew}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          hint={isNew ? 'Firebase sign-in uses an email address, so the login ID is an email, for example ramesh@murlidhar.com. A real inbox is needed to reset the password by email.' : 'The login ID cannot be changed.'}
        />
        {isNew ? <TextField label="Password" value={f.password} onChangeText={(v) => setF({ ...f, password: v })} secureTextEntry autoCapitalize="none" hint="At least 8 characters. It is sent to Firebase only and never stored or shown again." /> : null}
        <View style={{ gap: 10 }}>
          <T size={14} weight="600">
            Pages this employee can use
          </T>
          {PAGES.map((p) => flag(p.label, p.note, f.permissions[p.key], (v) => setF({ ...f, permissions: { ...f.permissions, [p.key]: v } })))}
          <T size={12} muted>
            Employees can never change Item Master prices or commissions, or open Users, Reports or Settings.
          </T>
        </View>
        {!isNew ? flag('Account active', 'An inactive employee cannot sign in.', f.active, (v) => setF({ ...f, active: v })) : null}
        {error ? (
          <T size={13} style={{ color: t.danger }}>
            {error}
          </T>
        ) : null}
        {note ? (
          <T size={13} style={{ color: t.success }}>
            {note}
          </T>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <View>{!isNew ? <Btn title="Reset Password" variant="secondary" disabled={busy} onPress={reset} /> : null}</View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn title="Cancel" variant="secondary" disabled={busy} onPress={onCancel} />
            <Btn title={busy ? 'Saving…' : isNew ? 'Add Employee' : 'Save'} disabled={busy} onPress={save} />
          </View>
        </View>
      </View>
    </Sheet>
  );
}

// The owner manages employee logins here. Owner accounts are shown but cannot be changed or disabled. (Business salesmen
// are not logins: they live in Salesman Master and are untouched.)
export default function UsersScreen() {
  const { phone } = usePageMetrics();
  const users = useUsers().filter((u) => u.role === 'owner' || u.role === 'employee');
  const [form, setForm] = useState<Form | null>(null);
  return (
    <Page title="Users" subtitle="Owner and employee logins for Murlidhar Enterprise." actions={<Btn title="Add Employee" fill={phone} onPress={() => setForm({ id: null, name: '', email: '', password: '', permissions: NONE, active: true })} />}>
      <SimpleTable
        minWidth={phone ? 720 : undefined}
        columns={[
          { label: 'Name', render: (u) => u.name, weight: '500' },
          { label: 'Login ID', render: (u) => u.email },
          { label: 'Role', width: 110, render: (u) => (u.role === 'owner' ? 'Owner' : 'Employee') },
          { label: 'Access', render: (u) => summary(u) },
          { label: 'Status', width: 100, render: (u) => (u.active ? 'Active' : 'Inactive') },
          {
            label: 'Actions',
            width: 90,
            align: 'right',
            render: (u) => (u.role === 'employee' ? <TextAction title="Edit" label={`Edit ${u.name}`} onPress={() => setForm({ id: u.id, name: u.name, email: u.email, password: '', permissions: u.permissions ?? NONE, active: u.active })} /> : ''),
          },
        ]}
        rows={users}
        keyOf={(u) => u.id}
        empty={{ title: 'No users found.' }}
      />
      {form ? <EmployeeForm key={form.id ?? 'new'} value={form} onCancel={() => setForm(null)} onDone={() => setForm(null)} /> : null}
    </Page>
  );
}
