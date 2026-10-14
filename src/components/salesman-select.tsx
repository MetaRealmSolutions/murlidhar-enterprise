import { Pressable, View } from 'react-native';

import { T, useTheme } from './controls';
import { usePageMetrics } from './page';
import { MenuItem, Popover } from './popover';
import type { Salesman } from '../data/repository';

/**
 * "Select Salesman" dropdown: chooses whose Bill Entry is shown below. With `allLabel` and `onClear` it gets a first entry that clears the
 * choice (used by List of Bill Entry, where "no party" means every salesman); `label` renames the field.
 */
export function SalesmanSelect({
  salesmen,
  value,
  onChange,
  label = 'Select Salesman',
  allLabel,
  onClear,
}: {
  salesmen: Salesman[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
  allLabel?: string;
  onClear?: () => void;
}) {
  const t = useTheme();
  const { phone } = usePageMetrics();
  const current = salesmen.find((s) => s.id === value);
  return (
    <View style={{ gap: 6, maxWidth: phone ? undefined : 360 }}>
      <T size={14} weight="500">
        {label}
      </T>
      <Popover
        width={phone ? 320 : 360}
        renderTrigger={(open, isOpen) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ expanded: isOpen }}
            onPress={open}
            style={{ height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 6, borderColor: isOpen ? t.accent : t.borderStrong, backgroundColor: t.surface }}>
            <T size={16} numberOfLines={1} style={{ flex: 1, color: current || allLabel ? t.text : t.muted }}>
              {current?.name ?? allLabel ?? 'Choose a salesman'}
            </T>
            <T size={10} muted>
              {isOpen ? '▲' : '▼'}
            </T>
          </Pressable>
        )}>
        {(close) => (
          <View accessibilityRole="menu" style={{ maxHeight: 320 }}>
            {allLabel && onClear ? (
              <MenuItem
                label={allLabel}
                checked={value === null}
                onPress={() => {
                  close();
                  onClear();
                }}
              />
            ) : null}
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
