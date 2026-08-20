import * as SecureStore from 'expo-secure-store';

import { ExpoDatabaseKeyStore } from './ExpoDatabaseKeyStore';

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn(async () => true),
  getItemAsync: jest.fn(async (): Promise<string | null> => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
  canUseBiometricAuthentication: jest.fn(() => true),
}));

const mockIsAvailableAsync = jest.mocked(SecureStore.isAvailableAsync);
const mockGetItemAsync = jest.mocked(SecureStore.getItemAsync);

describe('ExpoDatabaseKeyStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAvailableAsync.mockResolvedValue(true);
    mockGetItemAsync.mockResolvedValue(null);
  });

  it('distinguishes an absent envelope from malformed initialization state', async () => {
    const store = new ExpoDatabaseKeyStore();
    await expect(store.readEnvelope()).resolves.toEqual({ kind: 'absent' });

    mockGetItemAsync.mockResolvedValueOnce('{invalid');
    await expect(store.readEnvelope()).resolves.toEqual({ kind: 'malformed' });
  });

  it('does not accept malformed key material', async () => {
    mockGetItemAsync.mockResolvedValueOnce('not-a-key');
    await expect(new ExpoDatabaseKeyStore().readKey('device')).resolves.toEqual({
      kind: 'missing',
    });
  });

  it('maps biometric cancellation without exposing the native error', async () => {
    mockGetItemAsync.mockRejectedValueOnce(new Error('User canceled the authentication'));
    await expect(new ExpoDatabaseKeyStore().readKey('strong-biometric')).resolves.toEqual({
      kind: 'authentication-cancelled',
    });
  });
});
