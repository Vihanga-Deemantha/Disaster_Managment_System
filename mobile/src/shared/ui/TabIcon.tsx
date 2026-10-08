import { StyleSheet, Text } from 'react-native';

/**
 * A tab's icon, as a single symbol. The tab's name already says what it is, so the symbol is hidden
 * from screen readers; the focused tab is drawn solid and the others softer.
 */
export function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text
      accessible={false}
      importantForAccessibility="no"
      style={[styles.glyph, { opacity: focused ? 1 : 0.55 }]}
    >
      {glyph}
    </Text>
  );
}

const styles = StyleSheet.create({
  // With the label under it this must fit a 48 point bar, whose tabs have 5 points of padding.
  glyph: { fontSize: 18, lineHeight: 20, textAlign: 'center' },
});
