import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { OneTimePreKeyDto } from './register-identity.dto';

export class ReplenishPreKeysDto {
  @ArrayMaxSize(100)
  @ArrayMinSize(1)
  @ArrayUnique((preKey: OneTimePreKeyDto) => preKey.id)
  @IsArray()
  @Type(() => OneTimePreKeyDto)
  @ValidateNested({ each: true })
  oneTimePreKeys!: OneTimePreKeyDto[];

  @IsUUID(4)
  operationId!: string;
}
