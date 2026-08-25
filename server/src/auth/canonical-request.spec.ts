import { canonicalRequest, canonicalRequestTarget } from './canonical-request';

describe('canonicalRequest', () => {
  it('sorts query keys and repeated values without changing the path', () => {
    expect(canonicalRequestTarget('/v1/pair/events?z=last&a=two&a=one')).toBe(
      '/v1/pair/events?a=one&a=two&z=last',
    );
  });

  it('binds the exact body bytes into the versioned request', () => {
    expect(
      canonicalRequest({
        body: Buffer.from('{"ok":true}', 'utf8'),
        method: 'post',
        nonce: 'abcdefghijklmnop',
        requestTarget: '/v1/identity/register',
        timestamp: 1_700_000_000_000,
      }),
    ).toBe(
      [
        'M2Y-REQUEST-V1',
        'POST',
        '/v1/identity/register',
        '1700000000000',
        'abcdefghijklmnop',
        '4062edaf750fb8074e7e83e0c9028c94e32468a8b6f1614774328ef045150f93',
      ].join('\n'),
    );
  });
});
