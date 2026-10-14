import { createElement } from 'react';
import { View } from 'react-native';

import { T, useTheme } from './controls';

/** The browser's date picker, styled like the app's text fields. */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T size={14} weight="500">
        {label}
      </T>
      {createElement('input', {
        type: 'date',
        value,
        'aria-label': label,
        onChange: (e: { target: { value: string } }) => onChange(e.target.value),
        style: { height: 46, boxSizing: 'border-box', padding: '0 12px', fontSize: 16, fontFamily: 'inherit', border: `1px solid ${t.borderStrong}`, borderRadius: 6, backgroundColor: t.surface, color: t.text, outline: 'none' },
      })}
    </View>
  );
}
