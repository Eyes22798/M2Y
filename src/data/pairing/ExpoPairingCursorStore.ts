import * as SecureStore from 'expo-secure-store';

import type {
  PairingCursorReadResult,
  PairingCursorStore,
  PairingCursorWriteResult,
} from '@/application/pairing/contracts';

const cursorKey = 'm2y.pairing.event-cursor.v1';
const cursorService = 'm2y.pairing.event-cursor-service.v1';
const cursorOptions: SecureStore.SecureStoreOptions = {
  keychainService: cursorService,
  requireAuthentication: false,
};

/** 只保存服务端事件序号，不保存事件内容、packet 或安全号码。 */
export class ExpoPairingCursorStore implements PairingCursorStore {
  async readCursor(): Promise<PairingCursorReadResult> {
    if (!(await isAvailable())) return unavailable();

    let stored: string | null;
    try {
      stored = await SecureStore.getItemAsync(cursorKey, cursorOptions);
    } catch {
      return unavailable();
    }
    if (stored === null) return { ok: true, cursor: 0 };

    const cursor = parseCursor(stored);
    return cursor === null ? { ok: false, reason: 'pairing-cursor-invalid' } : { ok: true, cursor };
  }

  async writeCursor(cursor: number): Promise<PairingCursorWriteResult> {
    if (!isCursor(cursor)) return { ok: false, reason: 'pairing-cursor-invalid' };
    if (!(await isAvailable())) return unavailable();

    try {
      await SecureStore.setItemAsync(cursorKey, String(cursor), cursorOptions);
      return { ok: true };
    } catch {
      return unavailable();
    }
  }
}

function parseCursor(value: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) return null;
  const cursor = Number(value);
  return isCursor(cursor) ? cursor : null;
}

function isCursor(cursor: number): boolean {
  return Number.isSafeInteger(cursor) && cursor >= 0;
}

async function isAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

function unavailable(): Readonly<{ ok: false; reason: 'pairing-cursor-unavailable' }> {
  return { ok: false, reason: 'pairing-cursor-unavailable' };
}
