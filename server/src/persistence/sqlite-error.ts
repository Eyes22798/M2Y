export function isSqliteConstraintError(error: unknown): error is Readonly<{ code: string }> {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  const { code } = error as { code?: unknown };
  return typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT');
}
