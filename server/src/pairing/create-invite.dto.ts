import { IsIn, IsUUID } from 'class-validator';

export const PAIRING_INVITE_KINDS = ['qr-ticket', 'handshake-code'] as const;
export type PairingInviteKind = (typeof PAIRING_INVITE_KINDS)[number];

export class CreateInviteDto {
  @IsIn(PAIRING_INVITE_KINDS)
  kind!: PairingInviteKind;

  @IsUUID(4)
  operationId!: string;
}
