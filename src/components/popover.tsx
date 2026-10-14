import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { T, useTheme } from './controls';

type Rect = { x: number; y: number; w: number; h: number };

const MARGIN = 12;

/**
 * Dropdown anchored to its trigger. Opens below the trigger (above it when the trigger is in the
 * lower half of the screen) and closes on outside click, Escape/back, or when an item calls `close`.
 */
export function Popover({
  renderTrigger,
  children,
  width = 240,
  align = 'left',
  style,
}: {
  renderTrigger: (open: () => void, isOpen: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  width?: number;
  align?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const win = useWindowDimensions();

  const open = () => ref.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  const close = () => setAnchor(null);

  let pos: ViewStyle = {};
  if (anchor) {
    const w = Math.min(width, win.width - MARGIN * 2);
    const left = Math.max(MARGIN, Math.min(align === 'right' ? anchor.x + anchor.w - w : anchor.x, win.width - w - MARGIN));
    const up = anchor.y > win.height * 0.55;
    pos = { left, width: w, ...(up ? { bottom: win.height - anchor.y + 6 } : { top: anchor.y + anchor.h + 6 }) };
  }

  return (
    <>
      <View ref={ref} collapsable={false} style={style}>
        {renderTrigger(open, anchor !== null)}
      </View>
      {anchor && (
        <Modal transparent animationType="none" onRequestClose={close}>
          <Pressable
            accessibilityLabel="Close menu"
            onPress={close}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View
            style={[
              {
                position: 'absolute',
                backgroundColor: t.surface,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: t.border,
                paddingVertical: 6,
                boxShadow: '0 8px 24px rgba(16,24,40,0.12), 0 2px 6px rgba(16,24,40,0.06)',
              } as ViewStyle,
              pos,
            ]}>
            {children(close)}
          </View>
        </Modal>
      )}
    </>
  );
}

/** A single dropdown row. */
export function MenuItem({
  label,
  onPress,
  checked,
  danger,
}: {
  label: string;
  onPress: () => void;
  checked?: boolean;
  danger?: boolean;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={(s: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 42,
        paddingHorizontal: 14,
        marginHorizontal: 6,
        borderRadius: 6,
        backgroundColor: s.pressed ? t.border : s.hovered || focused ? t.hover : 'transparent',
      })}>
      <T size={15} weight={checked ? '600' : '400'} style={{ color: danger ? t.danger : t.text }}>
        {label}
      </T>
      {checked ? (
        <T size={13} weight="700" style={{ color: t.accent }}>
          ✓
        </T>
      ) : null}
    </Pressable>
  );
}

export function MenuDivider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border, marginVertical: 6 }} />;
}

/** Touch-friendly bottom sheet for phones. */
export function BottomSheet({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const t = useTheme();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: t.overlay }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
        <View
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            maxHeight: '88%',
          }}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.borderStrong }} />
          </View>
          <View style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
            <T size={17} weight="600">
              {title}
            </T>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: t.border }}>{children}</View>
          {footer ? (
            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: t.border,
              }}>
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
