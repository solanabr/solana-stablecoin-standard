export function shortPk(value: string, take = 6): string {
  if (value.length <= take * 2 + 1) return value;
  return `${value.slice(0, take)}…${value.slice(-take)}`;
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toString();
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const fraction = amount % base;
  const fractionText = fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fractionText.length > 0 ? `${whole.toString()}.${fractionText}` : whole.toString();
}

export function toBigIntValue(input: string): bigint {
  const value = input.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error("Amount must be a positive integer in base units");
  }
  return BigInt(value);
}
