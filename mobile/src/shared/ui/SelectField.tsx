import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '@/shared/i18n/I18nProvider';
import { colors, MIN_TOUCH, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from './AppText';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string> {
  label: string;
  placeholder: string;
  value: T | '';
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  error?: string;
}

/**
 * A picker for a long list (the 25 districts). Tapping it opens a full-screen list; a phone has no
 * dropdown, and a native wheel hides most of the choices.
 */
export function SelectField<T extends string>({
  label,
  placeholder,
  value,
  options,
  onChange,
  error,
}: SelectFieldProps<T>) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);
  const choose = (next: T) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <View style={styles.wrapper}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen?.label ?? placeholder}`}
        onPress={() => setOpen(true)}
        style={[styles.box, { borderColor: error ? colors.danger600 : colors.lineStrong }]}
      >
        <AppText variant="body" color={chosen ? colors.ink : colors.inkSoft} style={styles.value}>
          {chosen?.label ?? placeholder}
        </AppText>
        <AppText variant="label" color={colors.accent600}>
          ▾
        </AppText>
      </Pressable>
      {error ? (
        <AppText
          variant="caption"
          color={colors.danger600}
          accessibilityRole="alert"
          style={styles.error}
        >
          {`! ${error}`}
        </AppText>
      ) : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <AppText variant="heading">{label}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => setOpen(false)}
              hitSlop={8}
              style={styles.close}
            >
              <AppText variant="label" color={colors.accent600}>
                {t('common.close')}
              </AppText>
            </Pressable>
          </View>
          <FlatList
            data={options}
            // A short list (the 25 districts): draw it whole, so every choice exists from the first frame.
            initialNumToRender={options.length}
            keyExtractor={(option) => option.value}
            renderItem={({ item }) => {
              const selected = item.value === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => choose(item.value)}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <AppText variant="body" style={selected ? styles.selectedText : undefined}>
                    {item.label}
                  </AppText>
                  {selected ? (
                    <AppText variant="label" color={colors.accent600}>
                      ✓
                    </AppText>
                  ) : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

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
  value: { flex: 1 },
  error: { fontWeight: '600' },
  sheet: { flex: 1, backgroundColor: colors.paper },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  close: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  option: {
    minHeight: MIN_TOUCH + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    backgroundColor: colors.card,
  },
  optionSelected: { backgroundColor: colors.accent50 },
  selectedText: { fontWeight: '700' },
});
