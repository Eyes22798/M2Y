import { formatMessageTime, formatUpdatedAt } from './workspace-presenters';

describe('workspace presenters', () => {
  it('formats a local clock time', () => {
    const timestamp = new Date(2026, 7, 20, 19, 28).getTime();
    expect(formatMessageTime(timestamp)).toBe('19:28');
  });

  it('formats recent updates without persisting presentation copy', () => {
    const nowMs = new Date(2026, 7, 20, 19, 30).getTime();
    expect(formatUpdatedAt(nowMs - 10_000, nowMs)).toBe('刚刚');
    expect(formatUpdatedAt(nowMs - 5 * 60_000, nowMs)).toBe('5 分钟前');
  });
});
