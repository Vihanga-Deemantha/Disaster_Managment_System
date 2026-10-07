import { StyleSheet, Text, View } from 'react-native';

/** Shown by a tab until its owner replaces it with the real screen. */
export function Placeholder({ title }: { title: string }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{title}</Text>
      <Text>This screen has not been built yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  title: { fontSize: 20, fontWeight: '700' },
});
