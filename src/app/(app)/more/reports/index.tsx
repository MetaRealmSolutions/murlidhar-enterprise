import { useRouter } from 'expo-router';

import { Page, SimpleTable } from '../../../../components/page';

const REPORTS = [
  { id: 'stock', name: 'Stock', note: 'Current stock of every product' },
  { id: 'salesmen', name: 'Salesmen', note: 'Add More, sold and stock held per salesman this month' },
  { id: 'commission', name: 'Commission', note: 'Commission earned per salesman this month' },
  { id: 'movement', name: 'Stock History', note: 'Stock received and private bills' },
];

export default function ReportsScreen() {
  const router = useRouter();
  return (
    <Page title="Reports" subtitle="Simple summaries of stock and salesmen.">
      <SimpleTable
        columns={[
          { label: 'Report', width: 220, render: (r) => r.name, weight: '500' },
          { label: 'Description', render: (r) => r.note },
        ]}
        rows={REPORTS}
        keyOf={(r) => r.id}
        onRowPress={(r) => router.push(`/more/reports/${r.id}`)}
      />
    </Page>
  );
}
