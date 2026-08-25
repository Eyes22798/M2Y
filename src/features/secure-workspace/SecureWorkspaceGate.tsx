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
import { useSecureWorkspace } from '@/stores/secure-workspace/SecureWorkspaceProvider';
import { WorkspaceProvider } from '@/stores/workspace/WorkspaceProvider';

export function SecureWorkspaceGate({ children }: PropsWithChildren) {
  const secureWorkspace = useSecureWorkspace();
  const { state } = secureWorkspace;
  const [confirmReset, setConfirmReset] = useState(false);

  switch (state.status) {
    case 'checking':
      return <ProgressGate description="正在检查本机安全存储…" />;
    case 'opening':
      return <ProgressGate description="正在打开本地加密空间…" />;
    case 'setupRequired':
      return (
        <GateShell
          description="Chat 与 Space 会保存在当前 Android 设备的加密数据库中。卸载 App 或系统密钥失效后，本机数据无法恢复。"
          icon="lock"
          title="设置本地安全空间"
        >
          <PrimaryButton
            label="使用设备保护并继续"
            onPress={() => void secureWorkspace.setup('device')}
          />
          {state.strongBiometricAvailable ? (
            <SecondaryButton
              label="使用强生物识别解锁"
              onPress={() => void secureWorkspace.setup('strong-biometric')}
            />
          ) : null}
          <GateHint>
            生物识别只是本机访问门槛，不会创建 M2Y-ID，也不代表已建立端到端加密关系。
          </GateHint>
        </GateShell>
      );
    case 'locked':
      return (
        <GateShell
          description={
            state.reason === 'authentication-cancelled'
              ? '上次解锁已取消，你的私密内容仍保持锁定。'
              : state.reason === 'authentication-unavailable'
                ? '当前无法使用已登记的强生物识别，请检查系统设置后重试。'
                : '使用已登记的强生物识别访问本机加密空间。'
          }
          icon="lock"
          title="本地空间已锁定"
        >
          <PrimaryButton label="解锁本地空间" onPress={() => void secureWorkspace.unlock()} />
        </GateShell>
      );
    case 'ready':
      return <WorkspaceProvider session={state.session}>{children}</WorkspaceProvider>;
    case 'recoveryRequired':
      return (
        <>
          <GateShell
            description="本机加密数据库与系统保护密钥已无法安全配对。当前版本没有恢复码；继续操作将永久删除本机 Chat 与 Space 数据。"
            icon="waiting"
            title="需要重置本机数据"
          >
            <PrimaryButton danger label="删除并重新初始化" onPress={() => setConfirmReset(true)} />
            <DiagnosticCode code={state.reason} />
          </GateShell>
          <ConfirmDialog
            confirmLabel="删除本机数据"
            description="此操作不可撤销。数据库、密钥和本机初始化信息都会被删除。"
            onCancel={() => setConfirmReset(false)}
            onConfirm={() => {
              setConfirmReset(false);
              void secureWorkspace.resetLocalData();
            }}
            title="确认销毁本机数据？"
            visible={confirmReset}
          />
        </>
      );
    case 'fatal':
      return (
        <GateShell
          description={fatalDescription(state.code)}
          icon="waiting"
          title="无法打开本地空间"
        >
          {state.retryable ? (
            <PrimaryButton label="重试" onPress={() => void secureWorkspace.retry()} />
          ) : null}
          <DiagnosticCode code={state.code} />
        </GateShell>
      );
    default:
      return assertNever(state);
  }
}

function fatalDescription(code: string): string {
  return code === 'unsupported-platform'
    ? '当前安全数据基础仅在 Android Development Build 中启用。不会回退到明文或临时存储。'
    : 'M2Y 已阻止私密页面继续加载。请重试；若问题持续存在，请保留诊断代码。';
}

function assertNever(value: never): never {
  throw new Error(`Unhandled secure workspace screen state: ${String(value)}`);
}
