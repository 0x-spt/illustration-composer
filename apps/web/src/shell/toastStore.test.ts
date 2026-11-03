import { describe, expect, it } from 'vitest';
import { MAX_DETAILS, capDetails } from './toastStore';

describe('capDetails', () => {
  it('keeps up to 5 lines and folds the rest into «и ещё N»', () => {
    const lines = Array.from({ length: 8 }, (_, i) => `line ${i}`);
    const out = capDetails(lines)!;
    expect(out).toHaveLength(MAX_DETAILS + 1);
    expect(out.at(-1)).toBe('и ещё 3');
    expect(capDetails(lines.slice(0, 5))).toHaveLength(5);
    expect(capDetails(undefined)).toBeUndefined();
  });
});
