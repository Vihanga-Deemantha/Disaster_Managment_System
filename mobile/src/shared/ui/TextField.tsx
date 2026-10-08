import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, MIN_TOUCH, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from './AppText';

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  error?: string;
  /** Text shown in front of the typed value, such as "+94". */
  prefix?: string;
  /** A small control after the input (the password's Show / Hide). */
  trailing?: { label: string; onPress: () => void };
}

/**
 * A labelled input. The label is also the accessibility label, an error is announced when it
 * appears, and the input is at least 48 points tall.
 */
export const TextField = forwardRef<TextInput, FieldProps>(function TextField(
  { label, hint, error, prefix, trailing, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger600 : focused ? colors.accent600 : colors.lineStrong;
  return (
    <View style={styles.wrapper}>
      <AppText variant="label">{label}</AppText>
      <View style={[styles.box, { borderColor }]}>
        {prefix ? (
          <AppText variant="body" color={colors.inkSoft} style={styles.prefix}>
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.inkSoft}
          {...input}
          onFocus={(event) => {
            setFocused(true);
            input.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            input.onBlur?.(event);
          }}
          style={styles.input}
        />
        {trailing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={trailing.label}
            onPress={trailing.onPress}
            hitSlop={8}
            style={styles.trailing}
          >
            <AppText variant="label" color={colors.accent600}>
              {trailing.label}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {hint && !error ? <AppText variant="caption">{hint}</AppText> : null}
      {error ? (
        <AppText
          variant="caption"
          color={colors.danger600}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.error}
        >
          {`! ${error}`}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH + 4,
    borderWidth: 1.5,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  prefix: { marginRight: spacing.sm, fontWeight: '600' },
  input: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: spacing.sm },
  trailing: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingLeft: spacing.sm },
  error: { fontWeight: '600' },
});
