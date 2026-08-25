import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SecondaryButton } from '@/design/patterns/GateShell';
import { ScreenScaffold } from '@/design/primitives/ScreenScaffold';
import { colors, radius, spacing, typography } from '@/design/tokens';
import { useIdentityRelationship } from '@/stores/identity/IdentityRelationshipProvider';

/**
 * Creates the production identity: real libsignal keys in the Android Keystore, generated natively.
 * The screen never claims more than that — an identity is not a relationship, and the M2Y-ID it
 * produces cannot be exchanged until a pairing service exists.
 *
 * `onSkip` is offered only by callers that can still reach the local workspace; the gate omits it
 * when an identity is genuinely required.
 */
export function CreateIdentityScreen({ onSkip }: { onSkip?: (() => void) | undefined }) {
  const { createIdentity, state } = useIdentityRelationship();
  const busy = state.status === 'creatingIdentity';

  return (
    <ScreenScaffold
      description="M2Y 会在这台设备的系统密钥库中生成一组只属于你的密钥，并派生一个可分享的 M2Y-ID。私钥不会离开设备，也不会写入普通存储。"
      eyebrow="安全建立 · 01"
      title="创建你的本地身份"
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>创建前需要知道</Text>
        <Text style={styles.cardBody}>
          身份与关系是两件事：创建身份不会自动建立端到端加密关系，也不会向任何人公开你的存在。
        </Text>
        <Text style={styles.cardBody}>
          当前版本没有恢复码。卸载 App 或系统密钥失效后，这个身份无法在别处重建。
        </Text>
      </View>
      {busy ? (
        <Text style={styles.pending}>正在生成密钥…</Text>
      ) : (
        <PrimaryButton label="生成本机身份" onPress={() => void createIdentity(null)} />
      )}
      {onSkip && !busy ? (
        <SecondaryButton label="稍后再说，先使用本机空间" onPress={onSkip} />
      ) : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
  },
  cardTitle: { ...typography.title, color: colors.surface },
  cardBody: { ...typography.body, color: colors.inkFaint },
  pending: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
});
