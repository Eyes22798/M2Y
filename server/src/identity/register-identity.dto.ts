import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
export const M2Y_ID_PATTERN =
  /^M2Y-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/u;

export class OneTimePreKeyDto {
  @IsInt()
  @Max(2_147_483_647)
  @Min(1)
  id!: number;

  @IsString()
  @Length(32, 256)
  @Matches(BASE64_URL_PATTERN)
  publicKey!: string;
}

export class RegisterIdentityDto {
  @IsString()
  @Length(64, 512)
  @Matches(BASE64_URL_PATTERN)
  authPublicKey!: string;

  @IsUUID(4)
  deviceId!: string;

  @IsString()
  @Length(32, 256)
  @Matches(BASE64_URL_PATTERN)
  identityPublicKey!: string;

  @IsInt()
  @Max(2_147_483_647)
  @Min(1)
  kyberPreKeyId!: number;

  @IsString()
  @Length(256, 4096)
  @Matches(BASE64_URL_PATTERN)
  kyberPreKeyPublic!: string;

  @IsString()
  @Length(32, 256)
  @Matches(BASE64_URL_PATTERN)
  kyberPreKeySignature!: string;

  @IsString()
  @Matches(M2Y_ID_PATTERN)
  m2yId!: string;

  @ArrayMaxSize(16)
  @ArrayMinSize(16)
  @ArrayUnique((preKey: OneTimePreKeyDto) => preKey.id)
  @IsArray()
  @Type(() => OneTimePreKeyDto)
  @ValidateNested({ each: true })
  oneTimePreKeys!: OneTimePreKeyDto[];

  @IsUUID(4)
  operationId!: string;

  @IsInt()
  @Max(2_147_483_647)
  @Min(1)
  registrationId!: number;

  @IsInt()
  @Max(1)
  @Min(1)
  schemaVersion!: 1;

  @IsInt()
  @Max(2_147_483_647)
  @Min(1)
  signedPreKeyId!: number;

  @IsString()
  @Length(32, 256)
  @Matches(BASE64_URL_PATTERN)
  signedPreKeyPublic!: string;

  @IsString()
  @Length(32, 256)
  @Matches(BASE64_URL_PATTERN)
  signedPreKeySignature!: string;

  @IsUUID(4)
  stableIdentityId!: string;
}
