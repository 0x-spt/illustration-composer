import { BUILTIN_PALETTES } from '@ic/core';
import { wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';
import { CHROME, MIN_ACCENT_CONTRAST, accentColor, accentVars } from './accent';

const mint = BUILTIN_PALETTES.find((p) => p.id === 'mint')!;

describe('accent', () => {
  it('darkens a light palette accent (mint) to at least 3:1 against the chrome', () => {
    expect(wcagContrast(mint.slots.bg3, CHROME)).toBeLessThan(3);
    const a = accentColor(mint);
    expect(wcagContrast(a, CHROME)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
    // still the same family: not collapsed to grey/black
    expect(wcagContrast(a, CHROME)).toBeLessThan(4.5);
  });

  it('keeps an accent that already contrasts enough', () => {
    const lilac = BUILTIN_PALETTES.find((p) => p.id === 'lilac')!;
    expect(accentColor(lilac).toUpperCase()).toBe(lilac.slots.bg3.toUpperCase());
  });

  it('every builtin palette yields a readable accent', () => {
    for (const p of BUILTIN_PALETTES) {
      expect(wcagContrast(accentVars(p)['--accent']!, CHROME)).toBeGreaterThanOrEqual(3);
    }
  });
});
