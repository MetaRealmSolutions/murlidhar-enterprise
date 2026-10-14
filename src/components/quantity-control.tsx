import { useState } from 'react';
import { Pressable, TextInput, View, type PressableStateCallbackType } from 'react-native';

import { T, ringStyle, useTheme } from './controls';

type PState = PressableStateCallbackType & { hovered?: boolean };

function StepButton({
  symbol,
  label,
  disabled,
  size,
  onPress,
}: {
  symbol: string;
  label: string;
  disabled?: boolean;
  size: number;
  onPress: () => void;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={(s: PState) => [
        {
          width: size,
          height: size,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: t.borderStrong,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: s.pressed ? t.border : s.hovered && !disabled ? t.hover : t.surface,
          opacity: disabled ? 0.4 : 1,
        },
        ringStyle(t, focused),
      ]}>
      <T size={size > 40 ? 24 : 22} weight="500" style={{ lineHeight: size > 40 ? 26 : 24 }}>
        {symbol}
      </T>
    </Pressable>
  );
}

/**
 * The shared  −  [ number ]  +  control used by Add Stock.
 * `verb` only labels it for screen readers; `max` disables + once the limit is reached.
 */
export function QtyControl({
  id,
  name,
  verb,
  value,
  max = Infinity,
  min = 0,
  big,
  compact,
  onStep,
  onType,
  onBlurEmpty,
  inputRef,
  onSubmit,
}: {
  /** Lets a screen move focus into this field. */
  inputRef?: (el: TextInput | null) => void;
  /** Enter / Next on the keyboard: only moves focus, nothing is saved by the field itself. */
  onSubmit?: () => void;
  id: string;
  name: string;
  verb: 'Receive' | 'Give' | 'Count' | 'Return' | 'Sell';
  value: string;
  max?: number;
  /** The − button is disabled at this value (default 0). */
  min?: number;
  big: boolean;
  /** Smaller buttons and field (dense tables). */
  compact?: boolean;
  onStep: (id: string, delta: number) => void;
  onType: (id: string, text: string) => void;
  onBlurEmpty: (id: string) => void;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const n = Number(value) || 0;
  const active = n > 0;
  const size = compact ? 32 : big ? 46 : 40;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 6 : 8 }}>
      <StepButton symbol="−" label={`Decrease ${name}`} size={size} disabled={n <= min} onPress={() => onStep(id, -1)} />
      <TextInput
        accessibilityLabel={`${verb} quantity for ${name}`}
        value={value}
        onChangeText={(v) => onType(id, v)}
        ref={inputRef}
        onSubmitEditing={onSubmit}
        blurOnSubmit={false}
        returnKeyType={onSubmit ? 'next' : undefined}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder="0"
        placeholderTextColor={t.muted}
        selectTextOnFocus
        maxLength={7}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (value === '') onBlurEmpty(id);
        }}
        style={
          [
            {
              width: compact ? 64 : big ? 92 : 84,
              height: size,
              fontSize: compact ? 15 : 17,
              fontWeight: '600',
              textAlign: 'center',
              borderRadius: 6,
              borderWidth: 1,
              color: active ? t.accent : t.text,
              backgroundColor: t.surface,
              borderColor: active ? t.accent : t.borderStrong,
              outlineStyle: 'none',
              fontVariant: ['tabular-nums'],
            },
            focused ? ringStyle(t, true) : null,
          ] as object
        }
      />
      <StepButton symbol="+" label={`Increase ${name}`} size={size} disabled={n >= max} onPress={() => onStep(id, 1)} />
    </View>
  );
}
