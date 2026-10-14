import { useRef, type ReactNode } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { T, useTheme } from './controls';

export type GridColumn = { label: string; flex?: number; width?: number; align?: 'left' | 'right' | 'center' };
export type GridRow = { key: string; cells: ReactNode[]; strong?: boolean };

/**
 * A paper-style bill table: every column and every row has a visible line, like the manual bill.
 * Cells are text or any node (inputs). Wide bills scroll sideways on a phone instead of squeezing.
 */
export function BillGrid({ columns, rows, foot, minWidth }: { columns: GridColumn[]; rows: GridRow[]; foot?: GridRow; minWidth?: number }) {
  const t = useTheme();
  const line = t.borderStrong;
  const cell = (c: GridColumn, node: ReactNode, i: number, header: boolean, strong?: boolean) => (
    <View
      key={i}
      style={[
        c.width ? { width: c.width } : { flex: c.flex ?? 1 },
        {
          minHeight: header ? 40 : 46,
          paddingHorizontal: 8,
          paddingVertical: 6,
          justifyContent: 'center',
          alignItems: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start',
          borderRightWidth: i < columns.length - 1 ? 1 : 0,
          borderRightColor: line,
          backgroundColor: header ? t.subtle : 'transparent',
        },
      ]}>
      {typeof node === 'string' || typeof node === 'number' ? (
        <T size={header ? 12 : 15} weight={header || strong ? '700' : '400'} muted={header} style={[{ fontVariant: ['tabular-nums'] }, header ? { textTransform: 'uppercase', letterSpacing: 0.4 } : null]}>
          {node}
        </T>
      ) : (
        node
      )}
    </View>
  );
  const row = (r: GridRow, header?: boolean) => (
    <View key={r.key} style={{ flexDirection: 'row', borderTopWidth: header ? 0 : 1, borderTopColor: line }}>
      {columns.map((c, i) => cell(c, header ? c.label : r.cells[i], i, !!header, r.strong))}
    </View>
  );
  const body = (
    <View style={{ flexGrow: 1, minWidth, borderWidth: 1, borderColor: line }}>
      {row({ key: 'head', cells: [] }, true)}
      {rows.map((r) => row(r))}
      {foot ? row({ ...foot, strong: true }) : null}
    </View>
  );
  return minWidth ? (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%' }}>
      {body}
    </ScrollView>
  ) : (
    body
  );
}

/** A small number box that sits inside a bill cell. */
export function CellInput({ value, onChangeText, onBlur, onFocus, onSubmit, inputRef, placeholder, label, width = 72, invalid }: { value: string; onChangeText: (v: string) => void; onBlur?: () => void; onFocus?: () => void; /** Enter / Next on the keyboard. */ onSubmit?: () => void; inputRef?: (el: TextInput | null) => void; placeholder?: string; label: string; width?: number; /** Red border: the value is refused (a warning is shown beside it). */ invalid?: boolean }) {
  const t = useTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      onBlur={onBlur}
      onFocus={onFocus}
      ref={inputRef}
      onSubmitEditing={onSubmit}
      blurOnSubmit={false}
      returnKeyType={onSubmit ? 'next' : undefined}
      placeholder={placeholder}
      placeholderTextColor={t.muted}
      keyboardType="number-pad"
      selectTextOnFocus
      style={[{ width, height: 36, borderWidth: 1, borderColor: invalid ? t.danger : t.borderStrong, borderRadius: 6, paddingHorizontal: 8, textAlign: 'right', fontSize: 15, color: t.text, backgroundColor: t.surface, fontVariant: ['tabular-nums'] }, { outlineStyle: 'none' } as object]}
    />
  );
}

/**
 * Enter-key navigation for the quantity boxes of a bill table. Each box registers under a stable key (`<productId>:<field>`, never its text);
 * `next(key, order)` focuses the next registered box in `order` (the caller lists keys product by product in table order, so the left table
 * is finished before the right one and a row runs Fillup, Add More, Return). Fields that are not boxes in the current mode are never
 * registered, so they are skipped. After the last box focus is simply released: nothing is submitted.
 */
export function useCellNav() {
  const boxes = useRef(new Map<string, TextInput>());
  return {
    ref: (key: string) => (el: TextInput | null) => {
      if (el) boxes.current.set(key, el);
      else boxes.current.delete(key);
    },
    next: (key: string, order: string[]) => {
      for (const k of order.slice(order.indexOf(key) + 1)) {
        const box = boxes.current.get(k);
        if (!box) continue;
        box.focus();
        // The browser scrolls a focused field into view; this also centres it clear of the fixed footer (a no-op where there is no DOM).
        (box as unknown as { scrollIntoView?: (o: object) => void }).scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        return;
      }
      boxes.current.get(key)?.blur();
    },
  };
}
