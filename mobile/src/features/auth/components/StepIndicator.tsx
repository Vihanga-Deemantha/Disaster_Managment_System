import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { STEPS, type Step } from '../domain/registrationSteps';

function Dot({ step, current }: { step: Step; current: Step }) {
  const reached = step <= current;
  return (
    <View
      style={[
        styles.dot,
        reached ? styles.reached : styles.upcoming,
        { borderColor: reached ? colors.accent600 : colors.lineStrong },
      ]}
    >
      <AppText
        variant="caption"
        color={reached ? colors.white : colors.inkSoft}
        style={styles.number}
      >
        {step < current ? '✓' : String(step)}
      </AppText>
    </View>
  );
}

/**
 * The three registration steps as numbered dots joined by a line. A finished step can be reopened to
 * change an answer; a step that has not been reached cannot be jumped to, so nothing is skipped
 * without being checked.
 */
export function StepIndicator({
  current,
  onSelect,
}: {
  current: Step;
  onSelect: (step: Step) => void;
}) {
  const t = useT();
  return (
    <View accessibilityLabel={t('auth.register.stepsLabel')} style={styles.row}>
      {STEPS.map((step) => {
        const name = t(`auth.register.step${step}.title`);
        const done = step < current;
        return (
          <View key={step} style={styles.item}>
            <Pressable
              accessibilityRole={done ? 'button' : 'text'}
              accessibilityLabel={done ? t('auth.register.goToStep', { number: step, name }) : name}
              accessibilityState={{ selected: step === current }}
              disabled={!done}
              onPress={() => onSelect(step)}
              hitSlop={10}
            >
              <Dot step={step} current={current} />
            </Pressable>
            <View
              style={[styles.line, { backgroundColor: done ? colors.accent600 : colors.line }]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  item: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reached: { backgroundColor: colors.accent600 },
  upcoming: { backgroundColor: colors.card },
  number: { fontWeight: '800' },
  line: { flex: 1, height: 3, borderRadius: radius.pill },
});
