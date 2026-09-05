import type {
  IdentityRelationshipState,
  IdentitySummary,
  PairingRequestSummary,
  SafetyNumberDisplay,
} from '@/domain/identity/types';
import type {
  IdentityRegistrationRequest,
  LeasedPublicBundle,
  PairingApi,
  PairingEventConsumer,
} from '@/application/pairing/contracts';

/**
 * 生产身份存储对本机状态的最小投影。应用层只保留决策所需字段，不接收 native 的 revision、
 * schemaVersion 或任何密钥材料；已获服务端回执的首包会恢复为 outgoingPending。
 */
export type IdentityInspection =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'pendingRegistration'; identity: IdentitySummary; operationId: string }>
  | Readonly<{ kind: 'unpaired'; identity: IdentitySummary }>
  | Readonly<{
      kind: 'outgoingPending';
      identity: IdentitySummary;
      request: PairingRequestSummary;
    }>
  | Readonly<{
      kind: 'incomingReview';
      identity: IdentitySummary;
      request: PairingRequestSummary;
    }>
  | Readonly<{
      kind: 'awaitingSafetyVerification';
      identity: IdentitySummary;
      request: PairingRequestSummary;
      safetyNumber: SafetyNumberDisplay;
    }>;

/**
 * 应用层只暂存本次注册所需的公开材料。私钥仍只存在于 native store；控制器必须把公开注册包
 * 提交给服务端并回写真实 receipt，才能把状态发布为 `unpaired`。
 */
export type IdentityDraft = Readonly<{
  identity: IdentitySummary;
  operationId: string;
  registration: IdentityRegistrationRequest;
}>;

/** native 已同事务提交 PQXDH 会话与首包 outbox 后，应用层可以安全传输的公开投影。 */
export type PreparedPairingPacket = Readonly<{
  expiresAtMs: number;
  operationId: string;
  packet: string;
  requestId: string;
  targetDeviceId: string;
  targetM2yId: string;
  targetStableIdentityId: string;
}>;

/** 尚未获得服务端回执的首包；重启后必须原样重传，不能重新加密或更换 operation。 */
export type PendingPairingPacket = PreparedPairingPacket &
  Readonly<{
    createdAtMs: number;
    retryCount: number;
  }>;

export type PairingResponseAction = 'accept' | 'reject';

/** native 已提交候选状态、安全码（仅接受）与响应 outbox 后的严格结果。 */
export type PreparedPairingResponse =
  | Readonly<{
      action: 'accept';
      operationId: string;
      packet: string;
      requestId: string;
      safetyNumber: SafetyNumberDisplay;
    }>
  | Readonly<{
      action: 'reject';
      operationId: string;
      packet: string;
      requestId: string;
    }>;

export type PendingPairingResponse = PreparedPairingResponse &
  Readonly<{
    createdAtMs: number;
    retryCount: number;
  }>;

export type RespondToPairingRequestResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: 'pairing-operation-busy' | 'pairing-transport-unavailable' }>;

export type StartM2yPairingResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      reason:
        | 'm2y-id-invalid'
        | 'pairing-operation-busy'
        | 'pairing-target-unavailable'
        | 'pairing-transport-unavailable'
        | 'self-pairing-not-allowed';
    }>;

export interface OperationIdGenerator {
  createOperationId(): string;
}

/** native 拒绝统一由 controller 映射为 fail-closed 状态，端口不虚构更细的失败精度。 */
export interface ProductionIdentityPort {
  inspectIdentity(): Promise<IdentityInspection>;
  prepareIdentity(displayName: string | null): Promise<IdentityDraft>;
  commitRegistration(operationId: string, receiptId: string): Promise<IdentityInspection>;
  consumePairingRequestEvent(
    eventId: string,
    requestId: string,
    packet: string,
  ): Promise<IdentityInspection>;
  preparePairingPacket(
    requestId: string,
    expiresAtMs: number,
    targetBundle: LeasedPublicBundle,
  ): Promise<PreparedPairingPacket>;
  preparePairingResponse(
    requestId: string,
    action: PairingResponseAction,
  ): Promise<PreparedPairingResponse>;
  listPendingPairingPackets(): Promise<readonly PendingPairingPacket[]>;
  listPendingPairingResponses(): Promise<readonly PendingPairingResponse[]>;
  acknowledgePairingPacket(operationId: string, receiptId: string): Promise<void>;
  resetIdentity(): Promise<void>;
}

export type IdentityControllerDependencies = Readonly<{
  identityStore: ProductionIdentityPort;
  operationIdGenerator?: OperationIdGenerator;
  pairingApi?: PairingApi;
}>;

export interface IdentityRelationshipController extends PairingEventConsumer {
  getState(): IdentityRelationshipState;
  subscribe(listener: () => void): () => void;
  inspect(): Promise<void>;
  createIdentity(displayName: string | null): Promise<void>;
  startM2yPairing(m2yId: string): Promise<StartM2yPairingResult>;
  respondToPairingRequest(
    requestId: string,
    action: PairingResponseAction,
  ): Promise<RespondToPairingRequestResult>;
  resetLocalData(): Promise<void>;
  retry(): Promise<void>;
}
