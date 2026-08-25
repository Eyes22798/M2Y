import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

import { BASE64_URL_PATTERN, M2Y_ID_PATTERN } from '../identity/register-identity.dto';

export const PAIRING_METHODS = ['qr-ticket', 'm2y-id', 'handshake-code'] as const;
export type PairingMethod = (typeof PAIRING_METHODS)[number];

export class PreparePairRequestDto {
  @IsOptional()
  @IsString()
  @Length(8, 8)
  @Matches(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/u)
  code?: string;

  @IsIn(PAIRING_METHODS)
  method!: PairingMethod;

  @IsOptional()
  @IsString()
  @Matches(M2Y_ID_PATTERN)
  m2yId?: string;

  @IsUUID(4)
  operationId!: string;

  @IsOptional()
  @IsString()
  @Length(43, 43)
  @Matches(BASE64_URL_PATTERN)
  ticket?: string;
}

export class PairingPacketOperationDto {
  @IsUUID(4)
  operationId!: string;

  @IsString()
  @Length(32, 24_576)
  @Matches(BASE64_URL_PATTERN)
  packet!: string;
}

export class RespondPairRequestDto extends PairingPacketOperationDto {
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject';
}
