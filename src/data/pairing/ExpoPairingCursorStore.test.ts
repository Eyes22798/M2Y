import * as SecureStore from 'expo-secure-store';

import { ExpoPairingCursorStore } from './ExpoPairingCursorStore';

jest.mock('expo-secure-store', () => ({
  isAvailableAsync: jest.fn(async () => true),
  getItemAsync: jest.fn(async (): Promise<string | null> => null),
  setItemAsync: jest.fn(async () => undefined),
}));

const mockIsAvailable = jest.mocked(SecureStore.isAvailableAsync);
const mockGetItem = jest.mocked(SecureStore.getItemAsync);
const mockSetItem = jest.mocked(SecureStore.setItemAsync);

describe('ExpoPairingCursorStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAvailable.mockResolvedValue(true);
    mockGetItem.mockResolvedValue(null);
  });

  it('首次读取从零开始，并能持久化非负安全整数', async () => {
    const store = new ExpoPairingCursorStore();

    await expect(store.readCursor()).resolves.toEqual({ ok: true, cursor: 0 });
    await expect(store.writeCursor(42)).resolves.toEqual({ ok: true });
    expect(mockSetItem).toHaveBeenCalledWith(
      'm2y.pairing.event-cursor.v1',
      '42',
      expect.objectContaining({
        keychainService: 'm2y.pairing.event-cursor-service.v1',
        requireAuthentication: false,
      }),
    );
  });

  it.each(['01', '-1', '1.5', '9007199254740992', 'secret-stack'])(
    '拒绝损坏的持久游标 %s',
    async (stored) => {
      mockGetItem.mockResolvedValueOnce(stored);
      await expect(new ExpoPairingCursorStore().readCursor()).resolves.toEqual({
        ok: false,
        reason: 'pairing-cursor-invalid',
      });
    },
  );

  it('屏蔽 SecureStore 异常并返回稳定失败码', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('native details'));
    await expect(new ExpoPairingCursorStore().readCursor()).resolves.toEqual({
      ok: false,
      reason: 'pairing-cursor-unavailable',
    });

    mockIsAvailable.mockResolvedValueOnce(false);
    await expect(new ExpoPairingCursorStore().writeCursor(1)).resolves.toEqual({
      ok: false,
      reason: 'pairing-cursor-unavailable',
    });
  });

  it('写入前拒绝非法游标，不调用原生存储', async () => {
    await expect(new ExpoPairingCursorStore().writeCursor(-1)).resolves.toEqual({
      ok: false,
      reason: 'pairing-cursor-invalid',
    });
    expect(mockSetItem).not.toHaveBeenCalled();
  });
});
