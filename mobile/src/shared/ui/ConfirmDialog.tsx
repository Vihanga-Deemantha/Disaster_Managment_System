import { Modal, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** The confirming action cannot be taken back (signing out): its button is drawn as a warning. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A yes-or-no question drawn by the app itself. It stands in for `Alert.alert`, which does nothing in a
 * browser (the web build runs this app on a laptop), so a button that depended on it would look dead there.
 * The back button on Android and the escape key on the web answer "no".
 */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal accessibilityLabel={title} style={styles.card}>
          <AppText variant="heading">{title}</AppText>
          <AppText variant="body">{body}</AppText>
          <Button
            title={confirmLabel}
            variant={destructive ? 'danger' : 'primary'}
            onPress={onConfirm}
          />
          <Button title={cancelLabel} variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(12, 26, 51, 0.55)',
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.xl,
    gap: spacing.lg,
  },
});
