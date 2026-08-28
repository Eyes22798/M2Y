import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { PrimaryButton, SecondaryButton } from '@/design/patterns/GateShell';
import { ScreenScaffold } from '@/design/primitives/ScreenScaffold';
import { colors, radius, spacing, typography } from '@/design/tokens';
import type { IdentityRelationshipState, IdentitySummary } from '@/domain/identity/types';
import { useIdentityRelationship } from '@/stores/identity/IdentityRelationshipProvider';

/**
 * 只展示 controller 已提交的真实状态。配置真实端点后，`unpaired` 代表服务端注册和 native
 * receipt 回写都已经成功；页面不会把仅在本机生成的 `registering` 身份描述为已登记。
 */
export function PairingStatusScreen({
  onEnterWorkspace,
}: {
  onEnterWorkspace?: (() => void) | undefined;
}) {
  const { access, retry, startM2yPairing, state } = useIdentityRelationship();
  const [targetM2yId, setTargetM2yId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const identity = identityOf(state);
  const transportUnavailable =
    access.kind === 'granted' && access.reason === 'pairing-transport-unavailable';

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    const result = await startM2yPairing(targetM2yId);
    setSubmitting(false);
    if (!result.ok) setFormError(pairingErrorMessage(result.reason));
  };

  return (
    <KeyboardAvoidingView automaticOffset behavior="padding" style={styles.screen}>
      <ScreenScaffold description={describe(state)} eyebrow="安全建立 · 02" title="连接另一个人">
        {identity ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>
              {state.status === 'unpaired' ? '服务端已登记 · 你的 M2Y-ID' : '你的 M2Y-ID'}
            </Text>
            <Text style={styles.identityValue}>{identity.m2yId}</Text>
            <Text style={styles.cardBody}>
              M2Y 只维护一段双人关系。收到对方 ID 后仍需双方线下核对安全号码，才算连接成立。
            </Text>
          </View>
        ) : null}
        {state.status === 'unpaired' && !transportUnavailable ? (
          <View style={styles.form}>
            <View style={styles.formCopy}>
              <Text style={styles.formTitle}>输入对方的 M2Y-ID</Text>
              <Text style={styles.formBody}>
                这一步只发送端到端加密的连接请求。对方接受后，你们还需要当面核对安全号码。
              </Text>
            </View>
            <TextInput
              accessibilityLabel="对方的 M2Y-ID"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!submitting}
              onChangeText={(value) => {
                setTargetM2yId(value);
                setFormError(null);
              }}
              onSubmitEditing={() => void submit()}
              placeholder="M2Y-XXXX-XXXX-XXXX-XXXX"
              placeholderTextColor={colors.inkFaint}
              returnKeyType="send"
              spellCheck={false}
              style={styles.input}
              value={targetM2yId}
            />
            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            <PrimaryButton
              disabled={submitting}
              label={submitting ? '正在发送…' : '发送配对请求'}
              onPress={() => void submit()}
            />
          </View>
        ) : null}
        {state.status === 'outgoingPending' ? (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingLabel}>等待对方确认</Text>
            <Text style={styles.pendingIdentity}>{state.request.peer.m2yId}</Text>
            <Text style={styles.pendingBody}>
              请求已加密发送。对方接受前，不会建立关系或共享内容。
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
    </KeyboardAvoidingView>
  );
}

function pairingErrorMessage(
  reason:
    | 'm2y-id-invalid'
    | 'pairing-operation-busy'
    | 'pairing-target-unavailable'
    | 'pairing-transport-unavailable'
    | 'self-pairing-not-allowed',
): string {
  switch (reason) {
    case 'm2y-id-invalid':
      return '请输入完整的 M2Y-ID，例如 M2Y-XXXX-XXXX-XXXX-XXXX。';
    case 'self-pairing-not-allowed':
      return '不能向自己的 M2Y-ID 发送配对请求。';
    case 'pairing-target-unavailable':
      return '没有找到可配对的对方，或对方当前无法接收请求。';
    case 'pairing-operation-busy':
      return '正在处理上一项身份操作，请稍后再试。';
    case 'pairing-transport-unavailable':
      return '请求暂未完成。请检查网络后重试，M2Y 不会重复生成加密请求。';
    default:
      return assertNever(reason);
  }
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
  screen: { flex: 1 },
  card: {
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
  },
  cardLabel: { ...typography.label, color: colors.accent, textTransform: 'uppercase' },
  identityValue: { ...typography.title, color: colors.surface },
  cardBody: { ...typography.body, color: colors.inkFaint },
  form: {
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  formCopy: { gap: spacing.xs },
  formTitle: { ...typography.title, color: colors.ink },
  formBody: { ...typography.body, color: colors.inkMuted },
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
  formError: { ...typography.caption, color: colors.danger },
  pendingCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.waitingSoft,
  },
  pendingLabel: { ...typography.label, color: colors.waiting },
  pendingIdentity: { ...typography.title, color: colors.ink },
  pendingBody: { ...typography.body, color: colors.inkMuted },
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
