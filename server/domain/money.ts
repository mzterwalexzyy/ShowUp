/** Accept decimal text only. Floating point rounding can change a liability. */
export function parseNim(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,5})?$/.test(value) || value.length > 20) throw new Error('INVALID_AMOUNT');
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole!) * 100000n + BigInt(fraction.padEnd(5, '0'));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_AMOUNT');
  return Number(result);
}
export function luna(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_AMOUNT');
  return value;
}
