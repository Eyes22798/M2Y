import type { IdentityDraft, IdentityInspection } from '@/application/identity/contracts';

import type {
  ProductionIdentityInspection,
  ProductionIdentityRegistration,
} from './M2YCryptoProductionContract';

/** 把严格解码后的 native 投影映射到应用合同；这里不导入 native 模块，便于在普通 Jest 中验证。 */
export function toIdentityInspection(value: ProductionIdentityInspection): IdentityInspection {
  if (value.status === 'absent') {
    return { kind: 'absent' };
  }

  const identity = {
    deviceId: value.deviceId,
    ...(value.displayName === undefined ? {} : { displayName: value.displayName }),
    m2yId: value.m2yId,
    stableIdentityId: value.stableIdentityId,
  };
  if (value.status === 'pendingRegistration') {
    return { kind: 'pendingRegistration', identity, operationId: value.operationId };
  }
  if (value.status === 'outgoingPending') {
    return {
      kind: 'outgoingPending',
      identity,
      request: {
        expiresAtMs: value.expiresAtMs,
        method: 'm2y-id',
        peer: { m2yId: value.targetM2yId, routeId: value.targetDeviceId },
        requestId: value.requestId,
      },
    };
  }
  if (value.status === 'incomingReview') {
    return {
      kind: 'incomingReview',
      identity,
      request: {
        expiresAtMs: value.expiresAtMs,
        method: 'm2y-id',
        peer: { m2yId: value.peerM2yId, routeId: value.peerDeviceId },
        requestId: value.requestId,
      },
    };
  }
  if (value.status === 'awaitingSafetyVerification') {
    return {
      kind: 'awaitingSafetyVerification',
      identity,
      request: {
        expiresAtMs: value.expiresAtMs,
        method: 'm2y-id',
        peer: { m2yId: value.peerM2yId, routeId: value.peerDeviceId },
        requestId: value.requestId,
      },
      safetyNumber: { groups: value.safetyNumber },
    };
  }
  return { kind: 'unpaired', identity };
}

/**
 * 准备结果中的公开密钥包只交给应用层配对端口，用于完成服务端注册；它不进入 React state。
 * 显示名仍只以 native store 的下一次 inspection 为准，避免回显一个未实际持久化的草稿值。
 */
export function toIdentityDraft(value: ProductionIdentityRegistration): IdentityDraft {
  return {
    identity: {
      deviceId: value.deviceId,
      m2yId: value.m2yId,
      stableIdentityId: value.stableIdentityId,
    },
    operationId: value.operationId,
    registration: {
      authPublicKey: value.authPublicKey,
      deviceId: value.deviceId,
      identityPublicKey: value.identityPublicKey,
      kyberPreKeyId: value.kyberPreKeyId,
      kyberPreKeyPublic: value.kyberPreKeyPublic,
      kyberPreKeySignature: value.kyberPreKeySignature,
      m2yId: value.m2yId,
      oneTimePreKeys: value.oneTimePreKeys,
      operationId: value.operationId,
      registrationId: value.registrationId,
      schemaVersion: 1,
      signedPreKeyId: value.signedPreKeyId,
      signedPreKeyPublic: value.signedPreKeyPublic,
      signedPreKeySignature: value.signedPreKeySignature,
      stableIdentityId: value.stableIdentityId,
    },
  };
}
