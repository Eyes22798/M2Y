import { Modal, StyleSheet, Text, View } from 'react-native';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { AppIcon } from '@/design/primitives/AppIcon';
import { colors, radius, spacing, typography } from '@/design/tokens';

export function ConfirmDialog({
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  title,
  visible,
}: {
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <View style={styles.iconWrap}>
            <AppIcon color={colors.danger} name="delete" size={24} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.actions}>
            <MotionPressable
              accessibilityLabel="取消"
              onPress={onCancel}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>取消</Text>
            </MotionPressable>
            <MotionPressable
              accessibilityLabel={confirmLabel}
              onPress={onConfirm}
              style={styles.confirmButton}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </MotionPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.overlay,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceRaised,
  },
  iconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
  },
  title: { ...typography.title, color: colors.ink, textAlign: 'center' },
  description: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  confirmButton: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
  },
  cancelText: { ...typography.label, color: colors.ink },
  confirmText: { ...typography.label, color: colors.surfaceRaised },
});
