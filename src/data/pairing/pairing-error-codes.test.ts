import errorCodeFixture from '../../../contracts/pairing-v1/error-codes.json';

import { isPairingErrorCode, PAIRING_ERROR_CODES } from './pairing-error-codes';

describe('pairing error-code contract', () => {
  it('matches the versioned client/server fixture exactly', () => {
    expect(PAIRING_ERROR_CODES).toEqual(errorCodeFixture);
  });

  it('rejects arbitrary exception text', () => {
    expect(isPairingErrorCode('identity-not-found')).toBe(true);
    expect(isPairingErrorCode('SQLITE_CONSTRAINT: private row leaked')).toBe(false);
    expect(isPairingErrorCode(null)).toBe(false);
  });
});
