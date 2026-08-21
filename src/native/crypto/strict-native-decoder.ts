export type NativeRecord = Readonly<Record<string, unknown>>;

export function isNativeRecord(value: unknown): value is NativeRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasExactNativeKeys(value: NativeRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    sortedExpected.every((key, index) => actual[index] === key)
  );
}

export function isUuidV4(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)
  );
}

export function isBoundedString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string {
  return (
    typeof value === 'string' && value.length >= minimumLength && value.length <= maximumLength
  );
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function invalidNativeResponse(): never {
  throw new Error('m2y-crypto-invalid-native-response');
}
