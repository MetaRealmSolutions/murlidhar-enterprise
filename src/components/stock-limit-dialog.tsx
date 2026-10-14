import { View } from 'react-native';

import { Btn, T, useTheme } from './controls';
import { Sheet } from './sheet';
import type { Shortage } from '../data/repository';

/**
 * The dialog for "not enough allocatable stock": one centred modal (drawn above the page and the fixed footer) that lists EVERY product that
 * does not fit, each on its own line with its warehouse stock, what salesmen already hold and the most that can still be given.
 * The caller opens it from the structured `shortages` of a failed save (never from the message text) and keeps the typed quantities.
 */
export function StockLimitDialog({ shortages, onClose }: { shortages: Shortage[]; onClose: () => void }) {
  const t = useTheme();
  return (
    <Sheet title="Not enough stock" onClose={onClose}>
      <View style={{ padding: 20, gap: 12 }}>
        {shortages.map((s) => (
          <View key={s.productId} style={{ gap: 2 }}>
            <T size={15} weight="600">
              {s.name}
            </T>
            <T size={14} style={{ color: t.danger }}>
              Warehouse: {s.stock} · Already allocated: {s.allocated} · Maximum additional quantity: {s.max}
            </T>
          </View>
        ))}
        <T size={13} muted>
          Nothing was saved. Lower the quantities above and try again.
        </T>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Btn title="OK" onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}
