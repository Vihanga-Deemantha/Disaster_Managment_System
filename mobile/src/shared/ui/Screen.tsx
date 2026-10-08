import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '@/shared/theme/tokens';

/**
 * A screen on the warm paper background that keeps clear of the notch, the home bar and the keyboard.
 * `edges` says which sides need the safe-area gap: a screen under a navigation header only needs the
 * bottom, a full-screen one needs all four.
 */
export function Screen({
  children,
  edges = ['top', 'right', 'bottom', 'left'],
  background = colors.paper,
}: {
  children: ReactNode;
  edges?: readonly Edge[];
  background?: string;
}) {
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.lg },
});
