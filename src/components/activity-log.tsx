import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { NAV_BREAKPOINT } from './app-nav';
import { BillGrid } from './bill-grid';
import { Btn, T, useTheme } from './controls';
import { DateField } from './date-field';
import { useDatabase } from '../data/db/database';
import { friendlyError } from '../data/firebase/errors';
import { loadActivities, type Activity } from '../data/repository';
import { addDays, formatLong, formatTime, todayISO } from '../data/statements';
import { num } from '../mock/data';

/**
 * A salesman's stock-given activity: every Save Stock Given, one row per product, newest first. Loaded only when the
 * section is opened (salesmen/{id}/activities, just the chosen dates) and again whenever a new stock-given is saved.
 */
export function ActivityLog({ salesmanId }: { salesmanId: string }) {
  const t = useTheme();
  const phone = useWindowDimensions().width < NAV_BREAKPOINT;
  const db = useDatabase();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => addDays(todayISO(), -29));
  const [to, setTo] = useState(() => todayISO());
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  // Changes whenever a stock-given is saved for this salesman, so an open list refreshes itself.
  const saves = db.settlements.filter((s) => s.salesmanId === salesmanId).reduce((n, s) => n + (s.stockGiven?.length ?? 0), 0);

  const load = async () => {
    if (!from || !to) return setError('Choose both dates.');
    if (from > to) return setError('From Date cannot be after To Date.');
    setError(null);
    const mine = ++request.current;
    setLoading(true);
    try {
      const list = await loadActivities(salesmanId, from, to);
      if (mine === request.current) setRows(list);
    } catch (e) {
      if (mine === request.current) setError(friendlyError(e, 'Unable to load the activity.'));
    } finally {
      if (mine === request.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saves]);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <T size={19} weight="600" style={{ letterSpacing: -0.2 }}>
          Activity
        </T>
        <Btn title={open ? 'Hide Activity' : 'Show Activity'} variant="secondary" onPress={() => setOpen((o) => !o)} />
      </View>
      {open ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'flex-end', gap: 12 }}>
            <DateField label="From Date" value={from} onChange={setFrom} />
            <DateField label="To Date" value={to} onChange={setTo} />
            <Btn title="Show" fill={phone} onPress={load} />
          </View>
          {error ? (
            <T size={13} style={{ color: t.danger }}>
              {error}
            </T>
          ) : null}
          {loading && !rows ? <T muted>Loading activity…</T> : null}
          {rows && rows.length === 0 ? <T muted>No stock given in this date range.</T> : null}
          {rows && rows.length > 0 ? (
            <BillGrid
              minWidth={phone ? 560 : undefined}
              columns={[
                { label: 'Date & Time', width: phone ? 200 : 260 },
                { label: 'Product', flex: 1 },
                { label: 'Quantity Given', width: 150, align: 'right' },
              ]}
              rows={rows.map((a) => ({ key: a.activityId, cells: [`${formatLong(a.businessDate)}, ${formatTime(a.at)}`, a.productName, num(a.quantity)] }))}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
