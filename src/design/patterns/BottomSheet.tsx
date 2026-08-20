import type { PropsWithChildren, ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { AppIcon } from '@/design/primitives/AppIcon';
import { colors, radius, spacing, typography } from '@/design/tokens';

type BottomSheetProps = PropsWithChildren<{
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  title: string;
  visible: boolean;
}>;

export function BottomSheet({
  children,
  description,
  footer,
  onClose,
  title,
  visible,
}: BottomSheetProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="关闭浮层"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <KeyboardAvoidingView
          automaticOffset
          behavior="padding"
          style={styles.keyboardAvoider}
          testID="bottom-sheet-keyboard-avoiding-view"
        >
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>{title}</Text>
                {description ? <Text style={styles.description}>{description}</Text> : null}
              </View>
              <MotionPressable
                accessibilityLabel="关闭"
                onPress={onClose}
                style={styles.closeButton}
              >
                <AppIcon color={colors.inkMuted} name="close" size={20} />
              </MotionPressable>
            </View>
            <View style={styles.content}>{children}</View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  keyboardAvoider: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    paddingTop: spacing.sm,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surfaceRaised,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { ...typography.heading, color: colors.ink },
  description: { ...typography.caption, color: colors.inkMuted },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  content: { gap: spacing.lg, paddingHorizontal: spacing.xl },
  footer: { padding: spacing.xl },
});
