import { getRandomBytesAsync, randomUUID } from 'expo-crypto';

import {
  parseDatabaseHexKey,
  type DatabaseHexKey,
  type DatabaseKeyGenerator,
} from '@/application/secure-workspace/contracts';

export class ExpoSecureRandom implements DatabaseKeyGenerator {
  async generateDatabaseKey(): Promise<DatabaseHexKey> {
    const bytes = await getRandomBytesAsync(32);
    const encoded = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    const key = parseDatabaseHexKey(encoded);
    if (!key) throw new Error('Secure random source returned an invalid key length');
    return key;
  }

  createId(scope: 'installation' | 'message' | 'item'): string {
    return `${scope}-${randomUUID()}`;
  }
}
