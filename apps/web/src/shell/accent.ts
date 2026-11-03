import type { Palette } from '@ic/core';
import { clampChroma, formatHex, oklch, wcagContrast } from 'culori';

/** Chrome background the accent is drawn on (keep in sync with --chrome in tokens.css). */
export const CHROME = '#ffffff';
/** WCAG 1.4.11: focus rings and selection strokes need 3:1 against their background. */
export const MIN_ACCENT_CONTRAST = 3;

/** Text colour for a fill: the palette's ink or paper, whichever contrasts more. */
export function inkOn(fill: string, palette: Palette): string {
  const { ink, paper } = palette.slots;
  return wcagContrast(fill, paper) >= wcagContrast(fill, ink) ? paper : ink;
}

/**
 * The UI accent comes from the illustration: the palette's deepest background colour,
 * darkened in OKLCH (same hue) until it reaches 3:1 against the chrome.
 */
export function accentColor(palette: Palette): string {
  const base = palette.slots.bg3;
  if (wcagContrast(base, CHROME) >= MIN_ACCENT_CONTRAST) return base;
  const c = oklch(base);
  if (!c) return base;
  for (let l = c.l; l > 0; l -= 0.01) {
    const hex = formatHex(clampChroma({ ...c, l }, 'oklch'));
    if (wcagContrast(hex, CHROME) >= MIN_ACCENT_CONTRAST) return hex;
  }
  return palette.slots.ink;
}

export function accentVars(palette: Palette): Record<string, string> {
  const accent = accentColor(palette);
  return { '--accent': accent, '--accent-ink': inkOn(accent, palette) };
}
