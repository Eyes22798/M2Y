import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { MotionPressable } from '@/design/motion/MotionPressable';
import { PrimaryButton, SecondaryButton } from '@/design/patterns/GateShell';
import { AppIcon, type AppIconName } from '@/design/primitives/AppIcon';
import { colors, radius, spacing, typography } from '@/design/tokens';
import type { IdentitySummary } from '@/domain/identity/types';

export type PairingSetupStep = 'identity-ready' | 'method-picker' | 'm2y-id';

export function IdentityReadyStep({
  identity,
  onContinue,
}: {
  identity: IdentitySummary;
  onContinue: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyM2yId = async () => {
    try {
      await Clipboard.setStringAsync(identity.m2yId);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  return (
    <View style={styles.step}>
      <View style={styles.identityCard}>
        <Text style={styles.identityLabel}>你的 M2Y-ID</Text>
        <Text selectable style={styles.identityValue}>
          {identity.m2yId}
        </Text>
        <Text style={styles.body}>它只用于让另一台设备找到你，不包含手机号或邮箱。</Text>
        <SecondaryButton
          label={copyStatus === 'copied' ? '已复制 M2Y-ID' : '复制 M2Y-ID'}
          onPress={() => void copyM2yId()}
        />
        {copyStatus === 'failed' ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            复制失败，请长按上方 ID 手动复制。
          </Text>
        ) : null}
      </View>
      <PrimaryButton label="继续设置配对方式" onPress={onContinue} />
    </View>
  );
}

export function PairingMethodStep({
  onBack,
  onChooseM2yId,
}: {
  onBack: () => void;
  onChooseM2yId: () => void;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.methodList}>
        <MethodRow disabled icon="qrCode" label="扫描二维码" subtitle="面对面扫码，最快" />
        <MethodRow
          icon="keyboard"
          label="输入 M2Y-ID"
          onPress={onChooseM2yId}
          subtitle="让 TA 把 ID 发给你"
        />
        <MethodRow
          disabled
          icon="handshake"
          label="一次性握手码"
          subtitle="10 分钟内有效，更安全"
        />
      </View>
      <Text style={styles.hint}>二维码和一次性握手码将在后续原型切片中开放。</Text>
      <SecondaryButton label="返回身份信息" onPress={onBack} />
    </View>
  );
}

export function M2yIdInputStep({
  error,
  onBack,
  onChange,
  onSubmit,
  submitting,
  value,
}: {
  error: string | null;
  onBack: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  value: string;
}) {
  return (
    <View style={styles.form}>
      <TextInput
        accessibilityLabel="对方的 M2Y-ID"
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!submitting}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="M2Y-XXXX-XXXX-XXXX-XXXX"
        placeholderTextColor={colors.inkFaint}
        returnKeyType="send"
        spellCheck={false}
        style={styles.input}
        value={value}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        disabled={submitting}
        label={submitting ? '正在发送…' : '发送配对请求'}
        onPress={onSubmit}
      />
      <SecondaryButton label="返回配对方式" onPress={onBack} />
    </View>
  );
}

function MethodRow({
  disabled = false,
  icon,
  label,
  onPress,
  subtitle,
}: {
  disabled?: boolean;
  icon: AppIconName;
  label: string;
  onPress?: () => void;
  subtitle: string;
}) {
  const accessibilityLabel = disabled ? `${label}，暂未开放` : `${label}，${subtitle}`;

  return (
    <MotionPressable
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      {...(onPress ? { onPress } : {})}
      style={[styles.methodRow, disabled && styles.methodRowDisabled]}
    >
      <View style={styles.methodIcon}>
        <AppIcon color={disabled ? colors.inkFaint : colors.accent} name={icon} size={24} />
      </View>
      <View style={styles.methodCopy}>
        <Text style={[styles.methodLabel, disabled && styles.disabledText]}>{label}</Text>
        <Text style={styles.methodSubtitle}>{subtitle}</Text>
      </View>
      {disabled ? (
        <Text style={styles.unavailable}>暂未开放</Text>
      ) : (
        <AppIcon color={colors.inkMuted} name="chevronRight" size={20} />
      )}
    </MotionPressable>
  );
}

const styles = StyleSheet.create({
  step: { gap: spacing.lg },
  identityCard: {
    gap: spacing.md,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  identityLabel: { ...typography.label, color: colors.inkMuted },
  identityValue: { ...typography.heading, color: colors.ink },
  body: { ...typography.body, color: colors.inkMuted },
  hint: { ...typography.caption, color: colors.inkMuted },
  error: { ...typography.caption, color: colors.danger },
  methodList: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  methodRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  methodRowDisabled: { backgroundColor: colors.surfaceMuted },
  methodIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  methodCopy: { flex: 1, gap: spacing.xs },
  methodLabel: { ...typography.title, color: colors.ink },
  methodSubtitle: { ...typography.caption, color: colors.inkMuted },
  disabledText: { color: colors.inkMuted },
  unavailable: { ...typography.caption, color: colors.inkFaint },
  form: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  input: {
    minHeight: 54,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    ...typography.body,
  },
});
