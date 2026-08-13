export type BenchmarkMessage = Readonly<
  | { id: string; kind: 'text'; author: 'me' | 'other'; body: string }
  | { id: string; kind: 'long-text'; author: 'me' | 'other'; body: string }
  | { id: string; kind: 'system'; body: string }
>;

const longBody =
  '这是一条用于验证多行测量、回收与滚动稳定性的较长消息。内容保持确定性，避免每次基准运行因为随机长度而产生不可比较的结果。';

export function createBenchmarkMessages(count = 10_000): readonly BenchmarkMessage[] {
  return Array.from({ length: count }, (_, index): BenchmarkMessage => {
    const id = `benchmark-message-${String(index).padStart(5, '0')}`;

    if (index % 17 === 0) {
      return { id, kind: 'system', body: `系统事件 · 安全状态更新 ${index}` };
    }

    if (index % 7 === 0) {
      return {
        id,
        kind: 'long-text',
        author: index % 2 === 0 ? 'me' : 'other',
        body: `${longBody} #${index}`,
      };
    }

    return {
      id,
      kind: 'text',
      author: index % 2 === 0 ? 'me' : 'other',
      body: `确定性基准消息 #${index}`,
    };
  });
}
