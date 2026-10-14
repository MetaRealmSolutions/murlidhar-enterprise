import { useState } from 'react';

import { StatusDot, T, useTheme } from '../../../components/controls';
import { Page, SimpleTable } from '../../../components/page';
import { businesses } from '../../../mock/data';

// Visual switch only: the data shown elsewhere does not change per business.
export default function BusinessesScreen() {
  const t = useTheme();
  const [currentId, setCurrentId] = useState(businesses[0].id);
  return (
    <Page title="Businesses" subtitle="Select a business to switch to it (preview only).">
      <SimpleTable
        columns={[
          { label: 'Business', render: (b) => b.name, weight: '500' },
          { label: 'Place', width: 200, render: (b) => b.place },
          {
            label: 'Status',
            width: 140,
            render: (b) =>
              b.id === currentId ? (
                <StatusDot color={t.success}>
                  <T size={14} weight="500" muted>
                    Current
                  </T>
                </StatusDot>
              ) : (
                ''
              ),
          },
        ]}
        rows={businesses}
        keyOf={(b) => b.id}
        onRowPress={(b) => setCurrentId(b.id)}
        empty={{ title: 'No businesses found.' }}
      />
    </Page>
  );
}
