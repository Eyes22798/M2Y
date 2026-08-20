const minuteMs = 60_000;
const hourMs = 60 * minuteMs;

export function formatMessageTime(timestampMs: number): string {
  const value = new Date(timestampMs);
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function formatUpdatedAt(timestampMs: number, nowMs = Date.now()): string {
  const elapsed = nowMs - timestampMs;
  if (elapsed >= 0 && elapsed < minuteMs) return '刚刚';
  if (elapsed >= minuteMs && elapsed < hourMs) return `${Math.floor(elapsed / minuteMs)} 分钟前`;

  const value = new Date(timestampMs);
  const now = new Date(nowMs);
  if (
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate()
  ) {
    return formatMessageTime(timestampMs);
  }
  return `${value.getMonth() + 1}月${value.getDate()}日`;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}
