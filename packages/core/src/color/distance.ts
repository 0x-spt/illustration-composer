import { differenceCiede2000, oklch } from 'culori';
import type { Hex } from './hex';

const ciede2000 = differenceCiede2000();

/** CIEDE2000 colour difference between two hex colours. */
export function deltaE(a: Hex, b: Hex): number {
  return ciede2000(a, b);
}

/** OKLCH lightness, 0..1. */
export function lightness(h: Hex): number {
  return oklch(h)?.l ?? 0;
}

/** OKLCH chroma (0 for achromatic). */
export function chroma(h: Hex): number {
  return oklch(h)?.c ?? 0;
}
