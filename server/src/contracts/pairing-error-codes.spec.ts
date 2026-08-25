import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PAIRING_ERROR_CODES } from './pairing-error-codes';

describe('pairing error-code contract', () => {
  it('matches the versioned client/server fixture exactly', () => {
    const fixture = JSON.parse(
      readFileSync(resolve(__dirname, '../../../contracts/pairing-v1/error-codes.json'), 'utf8'),
    ) as unknown;

    expect(fixture).toEqual(PAIRING_ERROR_CODES);
  });
});
