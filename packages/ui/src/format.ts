/** Format a base-unit bigint as a decimal string (no external deps). */
export function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = abs % base;
  let out = whole.toLocaleString("en-US");
  if (fraction > 0n) {
    const frac = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
    out += `.${frac}`;
  }
  return negative ? `-${out}` : out;
}

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= 2 + chars * 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}
