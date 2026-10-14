import { useWindowDimensions } from 'react-native';

import { NAV_BREAKPOINT } from './app-nav';
import { BillGrid } from './bill-grid';
import { num, rupees } from '../mock/data';
import type { StatementDay } from '../data/statements';

/** A finalized salesman bill for one day, product by product. */
export function DayBill({ day }: { day: StatementDay }) {
  const phone = useWindowDimensions().width < NAV_BREAKPOINT;
  return (
    <BillGrid
      minWidth={phone ? 640 : undefined}
      columns={[
        { label: 'Product', flex: 2.4 },
        { label: 'Fillup', flex: 1, align: 'right' },
        { label: 'Return', flex: 1.3, align: 'right' },
        { label: 'Sold', flex: 1, align: 'right' },
        { label: 'Amount', flex: 1.3, align: 'right' },
        { label: 'Commission', flex: 1.4, align: 'right' },
      ]}
      // Fillup is what the salesman held that day: the carried Return plus the stock given and saved (so Fillup − Return = Sold).
      rows={day.lines.map((l) => ({ key: l.product, cells: [l.product, num(l.total), num(l.returned), num(l.sold), rupees(l.totalAmount), rupees(l.totalCommission)] }))}
      foot={{ key: 'total', cells: ['Total', num(day.lines.reduce((s, l) => s + l.total, 0)), num(day.lines.reduce((s, l) => s + l.returned, 0)), num(day.totals.sold), rupees(day.totals.amount), rupees(day.totals.commission)] }}
    />
  );
}
