import { useState, type ReactNode } from 'react';
import {
  Pressable,
  Text as RNText,
  TextInput,
  View,
  type PressableStateCallbackType,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';

/** Design tokens. The application is light mode only: there is no dark theme. */
const LIGHT = {
  dark: false,
  bg: '#ffffff',
  surface: '#ffffff',
  subtle: '#f8fafc',
  hover: '#f1f5f9',
  text: '#111827',
  muted: '#64748b',
  border: '#e5e7eb',
  borderStrong: '#cbd5e1',
  accent: '#2f3e9e',
  accentHover: '#252f80',
  accentSoft: '#eef0fb',
  onAccent: '#ffffff',
  success: '#1a7f4b',
  warning: '#b45f06',
  danger: '#b42318',
  overlay: 'rgba(17,24,39,0.45)',
};

export function useTheme() {
  return LIGHT;
}

export type Theme = ReturnType<typeof useTheme>;

export function T({
  style,
  muted,
  size = 14,
  weight = '400',
  ...rest
}: TextProps & { muted?: boolean; size?: number; weight?: '400' | '500' | '600' | '700' }) {
  const t = useTheme();
  return <RNText {...rest} style={[{ fontSize: size, fontWeight: weight, color: muted ? t.muted : t.text }, style]} />;
}

type PState = PressableStateCallbackType & { hovered?: boolean };

/** Focus ring for keyboard users (web). */
export function ringStyle(t: Theme, focused: boolean): ViewStyle {
  return focused ? ({ boxShadow: `0 0 0 3px ${t.accent}40`, borderColor: t.accent } as ViewStyle) : {};
}

export function Btn({
  title,
  onPress,
  variant = 'primary',
  fill,
  disabled,
  large,
  buttonRef,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  fill?: boolean;
  disabled?: boolean;
  large?: boolean;
  /** Lets a screen move keyboard focus to this button. */
  buttonRef?: (el: View | null) => void;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const primary = variant === 'primary';
  // Destructive actions are red: Delete, and every Cancel (which throws away what was entered).
  const danger = variant === 'danger' || title === 'Cancel';
  return (
    <Pressable
      ref={buttonRef}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={(s: PState) => [
        {
          height: large ? 50 : 42,
          paddingHorizontal: 18,
          borderRadius: 6,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          flexGrow: fill ? 1 : 0,
          backgroundColor: primary
            ? s.pressed || s.hovered
              ? t.accentHover
              : t.accent
            : s.pressed
              ? t.border
              : s.hovered
                ? t.hover
                : t.surface,
          borderColor: primary ? t.accent : danger ? t.danger : t.borderStrong,
          opacity: disabled ? 0.45 : s.pressed ? 0.92 : 1,
        },
        ringStyle(t, focused),
      ]}>
      <T size={15} weight="600" style={{ color: primary ? t.onAccent : danger ? t.danger : t.text }}>
        {title}
      </T>
    </Pressable>
  );
}

/** Small inline text action, e.g. "Edit". */
export function TextAction({ title, onPress, label }: { title: string; onPress: () => void; label?: string }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hitSlop={6}
      style={(s: PState) => [
        {
          paddingHorizontal: 12,
          height: 36,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: 'transparent',
          justifyContent: 'center',
          backgroundColor: s.pressed ? t.accentSoft : s.hovered ? t.accentSoft : 'transparent',
        },
        ringStyle(t, focused),
      ]}>
      <T size={15} weight="600" style={{ color: t.accent }}>
        {title}
      </T>
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  prefix,
  leading,
  inputRef,
  hint,
  style,
  ...input
}: TextInputProps & { label: string; error?: string; prefix?: string; leading?: ReactNode; inputRef?: React.Ref<TextInput>; hint?: string }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <T size={14} weight="500">
          {label}
        </T>
      ) : null}
      <View
        style={[
          {
            height: 46,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1,
            borderRadius: 6,
            paddingHorizontal: 12,
            gap: 6,
            backgroundColor: t.surface,
            borderColor: error ? t.danger : t.borderStrong,
          },
          focused ? ringStyle(t, true) : null,
          error && focused ? ({ boxShadow: `0 0 0 3px ${t.danger}33`, borderColor: t.danger } as ViewStyle) : null,
        ]}>
        {leading}
        {prefix ? <T muted size={16}>{prefix}</T> : null}
        <TextInput
          placeholderTextColor={t.muted}
          ref={inputRef}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[{ flex: 1, fontSize: 16, color: t.text, height: '100%', outlineStyle: 'none' } as object, style]}
        />
      </View>
      {error ? (
        <T size={12} style={{ color: t.danger }}>
          {error}
        </T>
      ) : hint ? (
        <T size={12} muted>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

/** Small coloured dot + text. */
export function StatusDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      {children}
    </View>
  );
}

/** Small magnifier for search fields. */
export function SearchIcon() {
  const t = useTheme();
  return (
    <View style={{ width: 16, height: 16 }}>
      <View style={{ width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: t.muted }} />
      <View
        style={{
          position: 'absolute',
          left: 9,
          top: 11,
          width: 6,
          height: 1.5,
          backgroundColor: t.muted,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}
