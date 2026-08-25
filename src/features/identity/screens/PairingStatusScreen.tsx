import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton, SecondaryButton } from '@/design/patterns/GateShell';
import { ScreenScaffold } from '@/design/primitives/ScreenScaffold';
import { colors, radius, spacing, typography } from '@/design/tokens';
import type { IdentityRelationshipState, IdentitySummary } from '@/domain/identity/types';
import { useIdentityRelationship } from '@/stores/identity/IdentityRelationshipProvider';

/**
 * Reports the real pairing state instead of a mock flow. Every branch here is reachable today, and
 * the honest answer for most installs is "the identity exists, the pairing service does not yet" —
 * so that is what it says, rather than showing a request UI that could not send anything.
 */
export function PairingStatusScreen({
  onEnterWorkspace,
}: {
  onEnterWorkspace?: (() => void) | undefined;
}) {
  const { access, retry, state } = useIdentityRelationship();
  const identity = identityOf(state);
  const transportUnavailable =
    access.kind === 'granted' && access.reason === 'pairing-transport-unavailable';

  return (
    <ScreenScaffold description={describe(state)} eyebrow="安全建立 · 02" title="连接另一个人">
      {identity ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>你的 M2Y-ID</Text>
          <Text style={styles.identityValue}>{identity.m2yId}</Text>
          <Text style={styles.cardBody}>
            M2Y 只维护一段双人关系。收到对方 ID 后仍需双方线下核对安全号码，才算连接成立。
          </Text>
        </View>
      ) : null}
      {transportUnavailable ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>配对服务尚未开放</Text>
          <Text style={styles.noticeBody}>
            这个版本没有可用的配对服务端点，因此无法发起或接受配对请求。Chat 与 Space
            仍然只保存在本机。
          </Text>
          <Text style={styles.noticeCode}>{`诊断代码：${access.code}`}</Text>
        </View>
      ) : null}
      {state.status === 'networkFailed' ? (
        <PrimaryButton label="重试" onPress={() => void retry()} />
      ) : null}
      {onEnterWorkspace ? (
        <SecondaryButton label="进入本机空间" onPress={onEnterWorkspace} />
      ) : null}
    </ScreenScaffold>
  );
}

function identityOf(state: IdentityRelationshipState): IdentitySummary | null {
  return 'identity' in state ? state.identity : null;
}

function describe(state: IdentityRelationshipState): string {
  switch (state.status) {
    case 'inspecting':
      return '正在读取本机身份…';
    case 'needsIdentity':
    case 'creatingIdentity':
      return '需要先在这台设备上创建身份，才能开始连接。';
    case 'registering':
      return '身份已在本机生成，但还没有被配对服务登记，因此暂时无法被对方找到。';
    case 'unpaired':
      return '身份已登记，目前还没有建立任何关系。';
    case 'outgoingPending':
      return '已向对方发出请求，正在等待确认。';
    case 'incomingReview':
      return '收到一个连接请求，请确认对方身份后再决定。';
    case 'awaitingSafetyVerification':
      return '双方需要各自确认同一组安全号码，连接才会生效。';
    case 'active':
      return '连接已建立。';
    case 'rejected':
      return '请求已被拒绝。';
    case 'cancelled':
      return state.reason === 'safety-mismatch'
        ? '安全号码不一致，连接已中止。请不要重试，先确认你们在核对同一台设备。'
        : '请求已取消。';
    case 'expired':
      return '请求已过期，需要重新发起。';
    case 'networkFailed':
      return '网络请求失败，配对状态未变更。';
    case 'identityChanged':
      return '对方的身份密钥发生变化。在重新线下核对之前，M2Y 不会继续使用这段关系。';
    case 'recoveryRequired':
    case 'fatal':
      return '本机身份状态异常，暂时无法进行配对。';
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled pairing status: ${JSON.stringify(value)}`);
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
  },
  cardLabel: { ...typography.label, color: colors.accent, textTransform: 'uppercase' },
  identityValue: { ...typography.title, color: colors.surface },
  cardBody: { ...typography.body, color: colors.inkFaint },
  notice: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  noticeTitle: { ...typography.title, color: colors.ink },
  noticeBody: { ...typography.body, color: colors.inkMuted },
  noticeCode: { ...typography.caption, color: colors.inkFaint },
});
