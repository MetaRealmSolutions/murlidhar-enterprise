import { Redirect, type Href } from 'expo-router';

import { useSalesmanSession } from '../../auth/AuthContext';
import { T } from '../../components/controls';
import { Page, SimpleTable } from '../../components/page';
import { useHeldProducts } from '../../data/repository';
import { num } from '../../mock/data';

// The salesman's own holding only: what the Owner gave them, minus what they have sold.
// Warehouse stock is never read or shown here.
export default function SalesmanStock() {
  const session = useSalesmanSession();
  const rows = useHeldProducts(session?.salesmanId ?? '');
  if (!session) return <Redirect href={'/' as Href} />;

  return (
    <Page title="My Stock" subtitle="Goods you are carrying right now.">
      <SimpleTable
        columns={[
          {
            label: 'Item',
            weight: '500',
            render: (r) => (
              <T size={15} weight="500">
                {r.product.name}
              </T>
            ),
          },
          { label: 'Quantity', width: 120, align: 'right', weight: '600', render: (r) => num(r.qty) },
        ]}
        rows={rows}
        keyOf={(r) => r.product.id}
        empty={{ title: 'You have no stock right now.', note: 'Stock appears here once goods are given to you.' }}
      />
    </Page>
  );
}
