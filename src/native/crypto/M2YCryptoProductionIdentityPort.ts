import type {
  IdentityDraft,
  IdentityInspection,
  PendingPairingPacket,
  PreparedPairingPacket,
  ProductionIdentityPort,
} from '@/application/identity/contracts';
import type { LeasedPublicBundle } from '@/application/pairing/contracts';

import { toIdentityDraft, toIdentityInspection } from './production-identity-mapping';

/**
 * 把身份 controller 接到生产 native 模块。adapter 使用延迟导入，因为 requireNativeModule 在模块加载时
 * 执行；这样缺少 Android 模块的 Jest 环境仍能加载应用端口，并由 controller 统一 fail closed。
 */
export class M2YCryptoProductionIdentityPort implements ProductionIdentityPort {
  async acknowledgePairingPacket(operationId: string, receiptId: string): Promise<void> {
    const { ackM2YPairingOutbox } = await import('./M2YCryptoProductionAdapter');
    const acknowledgement = await ackM2YPairingOutbox(operationId, receiptId);
    if (acknowledgement.operationId !== operationId) {
      throw new Error('pairing-outbox-acknowledgement-binding-invalid');
    }
  }

  async commitRegistration(operationId: string, receiptId: string): Promise<IdentityInspection> {
    const { commitM2YIdentityRegistration } = await import('./M2YCryptoProductionAdapter');
    return toIdentityInspection(await commitM2YIdentityRegistration(operationId, receiptId));
  }

  async consumePairingRequestEvent(
    eventId: string,
    requestId: string,
    packet: string,
  ): Promise<IdentityInspection> {
    const { consumeM2YPairingRequestEvent } = await import('./M2YCryptoProductionAdapter');
    return toIdentityInspection(await consumeM2YPairingRequestEvent(eventId, requestId, packet));
  }

  async inspectIdentity(): Promise<IdentityInspection> {
    const { inspectM2YProductionIdentity } = await import('./M2YCryptoProductionAdapter');
    return toIdentityInspection(await inspectM2YProductionIdentity());
  }

  async prepareIdentity(displayName: string | null): Promise<IdentityDraft> {
    const { prepareM2YIdentityRegistration } = await import('./M2YCryptoProductionAdapter');
    return toIdentityDraft(await prepareM2YIdentityRegistration(displayName));
  }

  async preparePairingPacket(
    requestId: string,
    expiresAtMs: number,
    targetBundle: LeasedPublicBundle,
  ): Promise<PreparedPairingPacket> {
    const { prepareM2YPairingPacket } = await import('./M2YCryptoProductionAdapter');
    const prepared = await prepareM2YPairingPacket(requestId, expiresAtMs, targetBundle);
    return {
      expiresAtMs: prepared.expiresAtMs,
      operationId: prepared.operationId,
      packet: prepared.packet,
      requestId: prepared.requestId,
      targetDeviceId: prepared.targetDeviceId,
      targetM2yId: prepared.targetM2yId,
      targetStableIdentityId: prepared.targetStableIdentityId,
    };
  }

  async listPendingPairingPackets(): Promise<readonly PendingPairingPacket[]> {
    const { listM2YPairingOutbox } = await import('./M2YCryptoProductionAdapter');
    const outbox = await listM2YPairingOutbox();
    return outbox.items.flatMap((item): readonly PendingPairingPacket[] => {
      if (
        item.packetType !== 'pair-request' ||
        item.expiresAtMs === undefined ||
        item.packet === undefined ||
        item.targetDeviceId === undefined ||
        item.targetM2yId === undefined ||
        item.targetStableIdentityId === undefined
      ) {
        return [];
      }
      return [
        {
          createdAtMs: item.createdAtMs,
          expiresAtMs: item.expiresAtMs,
          operationId: item.operationId,
          packet: item.packet,
          requestId: item.requestId,
          retryCount: item.retryCount,
          targetDeviceId: item.targetDeviceId,
          targetM2yId: item.targetM2yId,
          targetStableIdentityId: item.targetStableIdentityId,
        },
      ];
    });
  }

  async resetIdentity(): Promise<void> {
    const { resetM2YProductionIdentity } = await import('./M2YCryptoProductionAdapter');
    await resetM2YProductionIdentity();
  }
}
