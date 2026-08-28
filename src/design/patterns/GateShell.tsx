import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { AppIcon, type AppIconName } from '@/design/primitives/AppIcon';
import { colors, radius, spacing, typography } from '@/design/tokens';

/**
 * The shared frame for every screen that stands in front of private content: local storage unlock,
 * identity creation and pairing. Both gates look identical on purpose — a user cannot be expected to
 * tell "the database is locked" apart from "the relationship is not established" by layout, only by
 * the words on the card.
 */
export function GateShell({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: AppIconName;
  title: string;
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <AppIcon color={colors.accent} name={icon} size={30} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.actions}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

export function ProgressGate({
  description,
  title = 'M2Y',
}: {
  description: string;
  title?: string;
}) {
  return (
    <GateShell description={description} icon="lock" title={title}>
      <ActivityIndicator color={colors.accent} size="large" />
    </GateShell>
  );
}

export function PrimaryButton({
  danger = false,
  disabled = false,
  label,
  onPress,
}: {
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <MotionPressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.primaryButton,
        danger && styles.dangerButton,
        disabled && styles.disabledButton,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </MotionPressable>
  );
}

export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <MotionPressable accessibilityLabel={label} onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </MotionPressable>
  );
}

export function GateHint({ children }: { children: string }) {
  return <Text style={styles.hint}>{children}</Text>;
}

/**
 * Codes are shown, never hidden behind a support flow: they are the only handle a user has when a
 * gate refuses to open, and they are deliberately free of identifiers, keys and content.
 */
export function DiagnosticCode({ code }: { code: string }) {
  return <Text style={styles.reasonCode}>{`诊断代码：${code}`}</Text>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.canvas,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceRaised,
  },
  icon: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
  },
  title: { ...typography.heading, color: colors.ink },
  description: { ...typography.body, color: colors.inkMuted },
  actions: { gap: spacing.md },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  dangerButton: { backgroundColor: colors.danger },
  disabledButton: { opacity: 0.46 },
  primaryButtonText: { ...typography.title, color: colors.surfaceRaised },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  secondaryButtonText: { ...typography.title, color: colors.accent },
  hint: { ...typography.caption, color: colors.inkMuted },
  reasonCode: { ...typography.caption, color: colors.inkFaint, textAlign: 'center' },
});
