import { describe, expect, it } from 'vitest';
import { chroma, deltaE, lightness } from '../src/color/distance';
import { normalizeHex } from '../src/color/hex';

describe('normalizeHex', () => {
  it('normalizes valid hex input', () => {
    expect(normalizeHex('#d7cdf5')).toBe('#D7CDF5');
    expect(normalizeHex('abc')).toBe('#AABBCC');
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('aabbcc')).toBe('#AABBCC');
  });
  it('rejects invalid input', () => {
    expect(normalizeHex('#12')).toBeNull();
    expect(normalizeHex('rgb(1,2,3)')).toBeNull();
    expect(normalizeHex('#ggg')).toBeNull();
  });
});

describe('distance', () => {
  it('computes CIEDE2000', () => {
    expect(deltaE('#D7CDF5', '#D7CDF5')).toBe(0);
    expect(deltaE('#181817', '#171714')).toBeLessThan(2);
    expect(deltaE('#000000', '#FFFFFF')).toBeGreaterThan(90);
  });
  it('computes OKLCH lightness and chroma', () => {
    expect(lightness('#FFFFFF')).toBeGreaterThan(lightness('#7864D7'));
    expect(chroma('#808080')).toBeLessThan(0.01);
    expect(chroma('#7864D7')).toBeGreaterThan(0.1);
  });
});
