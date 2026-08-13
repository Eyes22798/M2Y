import { createBenchmarkMessages } from './messages';

describe('FlashList benchmark fixture', () => {
  it('creates a deterministic 10,000-message mixed data set', () => {
    const first = createBenchmarkMessages();
    const second = createBenchmarkMessages();

    expect(first).toHaveLength(10_000);
    expect(first).toEqual(second);
    expect(new Set(first.map((message) => message.kind))).toEqual(
      new Set(['text', 'long-text', 'system']),
    );
  });

  it('gives every message a stable unique key', () => {
    const messages = createBenchmarkMessages();
    expect(new Set(messages.map((message) => message.id)).size).toBe(messages.length);
  });
});
