import { type PropsWithChildren, useState } from 'react';

import { ConfirmDialog } from '@/design/patterns/ConfirmDialog';
import {
  DiagnosticCode,
  GateHint,
  GateShell,
  PrimaryButton,
  ProgressGate,
  SecondaryButton,
} from '@/design/patterns/GateShell';
import { useIdentityRelationship } from '@/stores/identity/IdentityRelationshipProvider';

import { CreateIdentityScreen } from './screens/CreateIdentityScreen';
import { PairingStatusScreen } from './screens/PairingStatusScreen';

/**
 * Stands between the unlocked local database and the private route tree.
 *
 * Access is decided by `decideWorkspaceAccess`, not by a route redirect, so no private screen can be
 * reached by deep link before the check has run. While no pairing service is configured the decision
 * grants access and this gate reduces to the identity fault handler; once a real endpoint exists the
 * same code path starts blocking, and the identity flow becomes the only thing that renders.
 */
export function IdentityRelationshipGate({ children }: PropsWithChildren) {
  const { access, resetLocalData, retry, state } = useIdentityRelationship();
  const [confirmReset, setConfirmReset] = useState(false);
  const [faultAcknowledged, setFaultAcknowledged] = useState(false);
  const faulted = state.status === 'recoveryRequired' || state.status === 'fatal';

  if (state.status === 'inspecting') {
    return <ProgressGate description="正在检查本机身份…" />;
  }

  if (faulted && !faultAcknowledged) {
    return (
      <>
        <GateShell
          description="本机身份记录无法被安全读取。M2Y 不会用一个来源不明的身份继续配对，也不会自动删除任何东西。"
          icon="waiting"
          title="身份状态异常"
        >
          {state.status === 'fatal' && state.retryable ? (
            <PrimaryButton label="重试" onPress={() => void retry()} />
          ) : null}
          <PrimaryButton
            danger
            label="删除本机身份并重新开始"
            onPress={() => setConfirmReset(true)}
          />
          {access.kind === 'granted' ? (
            <SecondaryButton label="继续使用本机空间" onPress={() => setFaultAcknowledged(true)} />
          ) : null}
          <GateHint>删除身份只会清除密钥与配对记录，本机 Chat 与 Space 内容不受影响。</GateHint>
          <DiagnosticCode code={state.code} />
        </GateShell>
        <ConfirmDialog
          confirmLabel="删除本机身份"
          description="密钥、配对候选与关系记录都会被删除，且无法恢复。已保存的 Chat 与 Space 内容会保留。"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            void resetLocalData();
          }}
          title="确认删除本机身份？"
          visible={confirmReset}
        />
      </>
    );
  }

  if (access.kind === 'blocked') {
    return state.status === 'needsIdentity' || state.status === 'creatingIdentity' ? (
      <CreateIdentityScreen />
    ) : (
      <PairingStatusScreen />
    );
  }

  return <>{children}</>;
}
