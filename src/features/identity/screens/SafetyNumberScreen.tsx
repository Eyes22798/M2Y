import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/design/patterns/GateShell';
import { ScreenScaffold } from '@/design/primitives/ScreenScaffold';
import { colors, radius, spacing, typography } from '@/design/tokens';
import { useIdentityRelationship } from '@/stores/identity/IdentityRelationshipProvider';

/** 展示 native 已持久化的 libsignal 安全码；页面不自行计算或保存身份指纹。 */
export function SafetyNumberScreen() {
  const { state } = useIdentityRelationship();
  const [copied, setCopied] = useState(false);

  if (state.status !== 'awaitingSafetyVerification') return null;

  const copySafetyNumber = async () => {
    try {
      await Clipboard.setStringAsync(state.safetyNumber.groups.join(' '));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <ScreenScaffold
      description={`请和 ${state.request.peer.m2yId} 通过线下或可信渠道逐组核对。号码完全一致，才能确认是对方的设备。`}
      eyebrow="安全建立 · 03"
      title="配对你们的设备"
    >
      <View style={styles.card}>
        <Text style={styles.label}>安全号码</Text>
        <View accessibilityLabel="安全号码" style={styles.numberGrid}>
          {state.safetyNumber.groups.map((group, index) => (
            <Text key={`${index}-${group}`} selectable style={styles.numberGroup}>
              {group}
            </Text>
          ))}
        </View>
        <Text style={styles.hint}>
          这组号码由两台设备的身份密钥生成。任意一组不同，都不要继续配对。
        </Text>
      </View>
      <PrimaryButton
        label={copied ? '已复制安全号码' : '复制安全号码'}
        onPress={() => void copySafetyNumber()}
      />
      <View style={styles.nextStep}>
        <Text style={styles.nextTitle}>下一步</Text>
        <Text style={styles.nextBody}>
          当前版本先完成真实号码展示。双方确认与关系激活会在下一段纵向流程中接通。
        </Text>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceRaised,
  },
  label: { ...typography.label, color: colors.accent },
  numberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  numberGroup: {
    width: '29%',
    ...typography.title,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  hint: { ...typography.body, color: colors.inkMuted },
  nextStep: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.waitingSoft,
  },
  nextTitle: { ...typography.title, color: colors.ink },
  nextBody: { ...typography.body, color: colors.inkMuted },
});
