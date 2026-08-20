import type { WorkspaceSession } from '@/application/workspace/contracts';

import { parseDatabaseHexKey } from './contracts';
import { initialSecureWorkspaceState, secureWorkspaceReducer } from './reducer';

const session: WorkspaceSession = {
  initialSnapshot: { messages: [], sharedItems: [] },
  execute: jest.fn(),
  loadSnapshot: jest.fn(),
  close: jest.fn(),
};

describe('secureWorkspaceReducer', () => {
  it('moves through setup, opening, and ready states', () => {
    const setup = secureWorkspaceReducer(initialSecureWorkspaceState, {
      type: 'require-setup',
      strongBiometricAvailable: true,
    });
    const opening = secureWorkspaceReducer(setup, { type: 'open', mode: 'device' });
    const ready = secureWorkspaceReducer(opening, {
      type: 'become-ready',
      mode: 'device',
      session,
    });

    expect(setup).toEqual({ status: 'setupRequired', strongBiometricAvailable: true });
    expect(ready).toMatchObject({ status: 'ready', mode: 'device' });
  });

  it('rejects ready without an opening state', () => {
    expect(() =>
      secureWorkspaceReducer(initialSecureWorkspaceState, {
        type: 'become-ready',
        mode: 'device',
        session,
      }),
    ).toThrow('Invalid secure workspace state transition');
  });

  it('accepts only a 32-byte lowercase hexadecimal database key', () => {
    expect(parseDatabaseHexKey('ab'.repeat(32))).toBe('ab'.repeat(32));
    expect(parseDatabaseHexKey('AB'.repeat(32))).toBeNull();
    expect(parseDatabaseHexKey('ab'.repeat(31))).toBeNull();
  });
});
