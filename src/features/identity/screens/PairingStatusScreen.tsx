import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { PrimaryButton, SecondaryButton } from '@/design/patterns/GateShell';
import { ScreenScaffold } from '@/design/primitives/ScreenScaffold';
import { colors, radius, spacing, typography } from '@/design/tokens';
import type { PairingResponseAction } from '@/application/identity/contracts';
import type { IdentityRelationshipState, IdentitySummary } from '@/domain/identity/types';
import {
  IdentityReadyStep,
  M2yIdInputStep,
  PairingMethodStep,
  type PairingSetupStep,
} from '@/features/identity/components/PairingSetupSteps';
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
  const { access, respondToPairingRequest, retry, startM2yPairing, state } =
    useIdentityRelationship();
  const [setupStep, setSetupStep] = useState<PairingSetupStep>('identity-ready');
  const [targetM2yId, setTargetM2yId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [decisionSubmitting, setDecisionSubmitting] = useState<PairingResponseAction | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const identity = identityOf(state);
  const transportUnavailable =
    access.kind === 'granted' && access.reason === 'pairing-transport-unavailable';
  const setupCopy =
    state.status === 'unpaired' && !transportUnavailable ? describeSetup(setupStep) : null;

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    const result = await startM2yPairing(targetM2yId);
    setSubmitting(false);
    if (!result.ok) setFormError(pairingErrorMessage(result.reason));
  };

  const submitDecision = async (action: PairingResponseAction) => {
    if (decisionSubmitting || state.status !== 'incomingReview') return;
    setDecisionSubmitting(action);
    setDecisionError(null);
    const result = await respondToPairingRequest(state.request.requestId, action);
    setDecisionSubmitting(null);
    if (!result.ok) {
      setDecisionError(
        result.reason === 'pairing-operation-busy'
          ? '正在处理上一项操作，请稍后再试。'
          : '响应暂未送达。请检查网络后重试，已经生成的加密响应不会重复创建。',
      );
    }
  };

  return (
    <KeyboardAvoidingView automaticOffset behavior="padding" style={styles.screen}>
      <ScreenScaffold
        description={setupCopy?.description ?? describe(state)}
        eyebrow="安全建立 · 02"
        title={setupCopy?.title ?? '连接另一个人'}
      >
        {state.status === 'unpaired' && !transportUnavailable && identity ? (
          setupStep === 'identity-ready' ? (
            <IdentityReadyStep
              identity={identity}
              onContinue={() => setSetupStep('method-picker')}
            />
          ) : setupStep === 'method-picker' ? (
            <PairingMethodStep
              onBack={() => setSetupStep('identity-ready')}
              onChooseM2yId={() => setSetupStep('m2y-id')}
            />
          ) : (
            <M2yIdInputStep
              error={formError}
              onBack={() => setSetupStep('method-picker')}
              onChange={(value) => {
                setTargetM2yId(value);
                setFormError(null);
              }}
              onSubmit={() => void submit()}
              submitting={submitting}
              value={targetM2yId}
            />
          )
        ) : identity ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>你的 M2Y-ID</Text>
            <Text style={styles.identityValue}>{identity.m2yId}</Text>
            <Text style={styles.cardBody}>
              M2Y 只维护一段双人关系。收到对方 ID 后仍需双方线下核对安全号码，才算连接成立。
            </Text>
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
        {state.status === 'incomingReview' ? (
          <View style={styles.incomingCard}>
            <Text style={styles.incomingLabel}>收到连接请求</Text>
            <Text style={styles.pendingIdentity}>{state.request.peer.m2yId}</Text>
            <Text style={styles.pendingBody}>
              请求已在本机完成端到端解密和身份绑定校验。你尚未接受，对方还不能成为你的关系。
            </Text>
            <View style={styles.decisionActions}>
              <PrimaryButton
                disabled={decisionSubmitting !== null}
                label={decisionSubmitting === 'accept' ? '正在接受…' : '接受并核对安全码'}
                onPress={() => void submitDecision('accept')}
              />
              <SecondaryButton
                disabled={decisionSubmitting !== null}
                label={decisionSubmitting === 'reject' ? '正在拒绝…' : '拒绝请求'}
                onPress={() => void submitDecision('reject')}
              />
            </View>
            {decisionError ? <Text style={styles.decisionError}>{decisionError}</Text> : null}
          </View>
        ) : null}
        {state.status === 'rejected' ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>已拒绝连接请求</Text>
            <Text style={styles.noticeBody}>对方已收到加密拒绝响应，本机没有建立关系。</Text>
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

function describeSetup(step: PairingSetupStep): { title: string; description: string } {
  switch (step) {
    case 'identity-ready':
      return {
        title: '身份已在本机创建',
        description: '不需要手机号、邮箱或通讯录。你的身份已经安全地生成在这台设备上。',
      };
    case 'method-picker':
      return {
        title: '配对方式',
        description: '选择你们现在最方便的连接方式。',
      };
    case 'm2y-id':
      return {
        title: '输入 M2Y-ID',
        description: '让 TA 把 M2Y-ID 发给你，然后在这里发起连接请求。',
      };
    default:
      return assertNever(step);
  }
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
  pendingCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.waitingSoft,
  },
  pendingLabel: { ...typography.label, color: colors.waiting },
  pendingIdentity: { ...typography.title, color: colors.ink },
  pendingBody: { ...typography.body, color: colors.inkMuted },
  incomingCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  incomingLabel: { ...typography.label, color: colors.accent },
  decisionActions: { gap: spacing.sm, paddingTop: spacing.sm },
  decisionError: { ...typography.caption, color: colors.danger },
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
