import { RedactedLogger } from './redacted-logger';

describe('RedactedLogger', () => {
  it('never forwards raw messages or traces to its structured sink', () => {
    const sink = jest.fn();
    const logger = new RedactedLogger(sink);

    logger.error('safety-number 1234 private-key', 'secret stack', 'Pairing Service');

    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'PairingService',
        event: 'server-log',
        level: 'error',
      }),
    );
    expect(JSON.stringify(sink.mock.calls)).not.toContain('1234');
    expect(JSON.stringify(sink.mock.calls)).not.toContain('private-key');
    expect(JSON.stringify(sink.mock.calls)).not.toContain('secret stack');
  });
});
