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

/**
 * For counters a native sweep or retry loop legitimately reports as zero. Kept separate from
 * `isPositiveSafeInteger` so an identifier or revision that arrives as `0` still fails closed.
 */
export function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * Rejects timestamps before 2020-01-01, which is earlier than this product existed: a native row
 * dated before then is corrupt or came from a device clock that cannot be trusted for ordering.
 */
export function isEpochMs(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1_577_836_800_000;
}

export function invalidNativeResponse(): never {
  throw new Error('m2y-crypto-invalid-native-response');
}
