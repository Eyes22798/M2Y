const M2Y_ID_PATTERN =
  /^M2Y-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/u;

/** 只做无歧义的大小写与首尾空白归一化，分组错误仍交给用户修正。 */
export function normalizeM2yIdInput(value: string): string {
  return value.trim().toUpperCase();
}

export function isM2yId(value: string): boolean {
  return M2Y_ID_PATTERN.test(value);
}
