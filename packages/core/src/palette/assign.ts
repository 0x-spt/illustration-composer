import { chroma, deltaE, lightness } from '../color/distance';
import type { Hex } from '../color/hex';
import { oklch } from 'culori';
import type { SlotName } from './types';

export const MIN_COLORS_ERROR = 'нужно минимум 6 цветов: 3 для фона и 3 для объектов';
export const DEFAULT_INK: Hex = '#181817';
export const DEFAULT_PAPER: Hex = '#FFFFFF';

const DUPLICATE_DELTA_E = 2;
const NEUTRAL_CHROMA = 0.01;

function hue(h: Hex): number | null {
  const c = oklch(h);
  return c && c.c >= NEUTRAL_CHROMA && c.h !== undefined ? c.h : null;
}

/** Smallest arc (degrees) that contains all given hues; neutrals are ignored. */
function hueSpread(colors: Hex[]): number {
  const hs = colors
    .map(hue)
    .filter((h): h is number => h !== null)
    .sort((a, b) => a - b);
  if (hs.length < 2) return 0;
  let maxGap = 360 - (hs[hs.length - 1] as number) + (hs[0] as number);
  for (let i = 1; i < hs.length; i++)
    maxGap = Math.max(maxGap, (hs[i] as number) - (hs[i - 1] as number));
  return 360 - maxGap;
}

function triples<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let a = 0; a < items.length; a++)
    for (let b = a + 1; b < items.length; b++)
      for (let c = b + 1; c < items.length; c++)
        out.push([items[a] as T, items[b] as T, items[c] as T]);
  return out;
}

/**
 * Splits six colours into background and object triples.
 *
 * Deviation from the brief ("3 least saturated -> bg"): that rule cannot restore the built-in
 * palettes. In lilac the pale obj3 #FFE3E1 (chroma 0.031) and obj1 #F9ECB0 (0.078) are less
 * saturated than bg2 #AA9BF0 (0.122), and obj2 #F9A3AA (0.102) is less saturated than it too, so
 * chroma and lightness do not separate the groups. What every built-in shares is that the
 * background is a tonal ramp of one hue (hue spread 1-13 degrees), while objects are mixed hues.
 * So bg = the triple with the tightest hue spread (ties: lower total chroma).
 * Order inside bg is by descending lightness. Inside obj, obj2 is the most saturated and obj1 the
 * lighter of the other two: built-in obj triples are not sorted by lightness (lilac obj3 is
 * lighter than obj2), so the brief's "descending L" would also fail the round trip.
 */
function split(six: Hex[]): { bg: Hex[]; obj: Hex[] } {
  let best: Hex[] = [];
  let bestSpread = Infinity;
  let bestChroma = Infinity;
  for (const t of triples(six)) {
    const spread = hueSpread(t);
    const total = t.reduce((s, c) => s + chroma(c), 0);
    if (
      spread < bestSpread - 1e-9 ||
      (Math.abs(spread - bestSpread) <= 1e-9 && total < bestChroma)
    ) {
      best = t;
      bestSpread = spread;
      bestChroma = total;
    }
  }
  const bg = [...best].sort((a, b) => lightness(b) - lightness(a));
  const rest = six.filter((c) => !best.includes(c));
  const vivid = [...rest].sort((a, b) => chroma(b) - chroma(a))[0] as Hex;
  const others = rest.filter((c) => c !== vivid).sort((a, b) => lightness(b) - lightness(a));
  return { bg, obj: [others[0] as Hex, vivid, others[1] as Hex] };
}

export function assignSlots(colors: Hex[]): { slots: Record<SlotName, Hex>; warnings: string[] } {
  const warnings: string[] = [];
  const unique: Hex[] = [];
  for (const c of colors) {
    if (!unique.some((u) => deltaE(u, c) < DUPLICATE_DELTA_E)) unique.push(c);
  }
  if (unique.length < colors.length) {
    warnings.push(`Похожие цвета объединены: ${colors.length - unique.length}`);
  }

  let pool = [...unique];
  let ink = DEFAULT_INK;
  let usedInput = 0;
  const darkest = [...pool].sort((a, b) => lightness(a) - lightness(b))[0];
  if (darkest !== undefined && lightness(darkest) < 0.25) {
    ink = darkest;
    usedInput++;
    pool = pool.filter((c) => c !== darkest);
  } else {
    warnings.push(`Нет достаточно тёмного цвета для ink, взят ${DEFAULT_INK}`);
  }
  let paper = DEFAULT_PAPER;
  const lightest = [...pool].sort((a, b) => lightness(b) - lightness(a))[0];
  if (lightest !== undefined && lightness(lightest) > 0.95) {
    paper = lightest;
    usedInput++;
    pool = pool.filter((c) => c !== lightest);
  } else {
    warnings.push(`Нет достаточно светлого цвета для paper, взят ${DEFAULT_PAPER}`);
  }

  if (pool.length < 6) throw new Error(MIN_COLORS_ERROR);
  // Input order is the user's priority: keep the first six.
  pool = pool.slice(0, 6);
  usedInput += 6;
  if (usedInput < unique.length) warnings.push(`использовано ${usedInput} из ${colors.length}`);
  const { bg, obj } = split(pool);
  const slots: Record<SlotName, Hex> = {
    bg1: bg[0] as Hex,
    bg2: bg[1] as Hex,
    bg3: bg[2] as Hex,
    obj1: obj[0] as Hex,
    obj2: obj[1] as Hex,
    obj3: obj[2] as Hex,
    ink,
    paper,
  };
  return { slots, warnings };
}
