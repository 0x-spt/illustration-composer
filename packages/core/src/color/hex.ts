/** Always `#RRGGBB`, uppercase. */
export type Hex = string;

/** Accepts `#abc`, `abc`, `#aabbcc`, `aabbcc`; anything else yields null. */
export function normalizeHex(input: string): Hex | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m || m[1] === undefined) return null;
  let digits = m[1];
  if (digits.length === 3) {
    digits = [...digits].map((c) => c + c).join('');
  }
  return `#${digits.toUpperCase()}`;
}
