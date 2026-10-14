import { useState } from 'react';
import { View } from 'react-native';

import { Btn, T, useTheme } from './controls';
import { DateField } from './date-field';
import { addDays, todayISO } from '../data/statements';

export type Period = 'today' | 'week' | 'month' | 'custom';

/**
 * Today (default) / This Week (Monday to today) / This Month (1st to today) / Custom Range, on Asia/Kolkata business dates (todayISO).
 * `range` is inclusive at both ends, or null for an invalid custom range (then `error` says why and nothing should be listed).
 */
export function usePeriodFilter() {
  const [period, setPeriod] = useState<Period>('today');
  const [from, setFrom] = useState(() => todayISO());
  const [to, setTo] = useState(() => todayISO());
  const real = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
  const now = todayISO();
  const weekday = new Date(`${now}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const error = period !== 'custom' ? null : !real(from) || !real(to) ? 'Choose a valid From Date and To Date.' : from > to ? 'From Date cannot be after To Date.' : null;
  const range =
    period === 'today' ? { from: now, to: now }
    : period === 'week' ? { from: addDays(now, -((weekday + 6) % 7)), to: now }
    : period === 'month' ? { from: `${now.slice(0, 8)}01`, to: now }
    : error ? null : { from, to };
  const reset = () => {
    setPeriod('today');
    setFrom(todayISO());
    setTo(todayISO());
  };
  return { period, setPeriod, from, setFrom, to, setTo, range, error, reset };
}

/** The period buttons, with the From / To Date pickers and the validation message for Custom Range. */
export function PeriodFilter({ f, phone }: { f: ReturnType<typeof usePeriodFilter>; phone?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(
          [
            ['today', 'Today'],
            ['week', 'This Week'],
            ['month', 'This Month'],
            ['custom', 'Custom Range'],
          ] as const
        ).map(([id, label]) => (
          <Btn key={id} title={label} variant={f.period === id ? 'primary' : 'secondary'} onPress={() => f.setPeriod(id)} />
        ))}
      </View>
      {f.period === 'custom' ? (
        <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'flex-end', gap: 14 }}>
          <DateField label="From Date" value={f.from} onChange={f.setFrom} />
          <DateField label="To Date" value={f.to} onChange={f.setTo} />
        </View>
      ) : null}
      {f.error ? (
        <T size={13} weight="500" style={{ color: t.danger }}>
          {f.error}
        </T>
      ) : null}
    </View>
  );
}
