import * as Crypto from 'expo-crypto';

import { ExpoSecureRandom } from './ExpoSecureRandom';

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async () => Uint8Array.from({ length: 32 }, (_, i) => i)),
  randomUUID: () => '11111111-1111-4111-8111-111111111111',
}));

const mockGetRandomBytesAsync = jest.mocked(Crypto.getRandomBytesAsync);

describe('ExpoSecureRandom', () => {
  it('creates a validated 32-byte raw SQLCipher key', async () => {
    const random = new ExpoSecureRandom();
    const key = await random.generateDatabaseKey();

    expect(mockGetRandomBytesAsync).toHaveBeenCalledWith(32);
    expect(key).toBe('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  });

  it('creates opaque scoped ids', () => {
    expect(new ExpoSecureRandom().createId('message')).toBe(
      'message-11111111-1111-4111-8111-111111111111',
    );
  });
});
