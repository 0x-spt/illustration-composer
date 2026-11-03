import { deltaE, normalizeHex, SLOT_NAMES, type Hex, type Palette, type SlotName } from '@ic/core';
import { COLOR_THRESHOLD } from './library.config';

const PAINT_ATTR = /\s(fill|stroke|stop-color)="([^"]*)"/g;

/** Distinct `#RRGGBB` values of fill/stroke/stop-color attributes (expects a normalised SVG). */
export function collectColors(svg: string): Hex[] {
  const out = new Set<Hex>();
  for (const m of svg.matchAll(PAINT_ATTR)) {
    const hex = normalizeHex(m[2]!);
    if (hex) out.add(hex);
  }
  return [...out];
}

export interface ColorMapResult {
  sourcePalette: string;
  colorMap: Record<Hex, SlotName>;
  pinned: Hex[];
  /** ΔE of every colour that was bound by nearest match (not exact), for the report. */
  approximations: Array<{ color: Hex; slot: SlotName; deltaE: number }>;
  /** Nearest slot and ΔE of each pinned colour, for the report. */
  pinnedDetails: Array<{ color: Hex; nearest: SlotName; deltaE: number }>;
}

/**
 * Detects the palette a set of colours is drawn in and maps every colour to a slot.
 * Only colours that occur in exactly one palette vote; ties and no votes fall back to
 * `fallbackPalette` (default: the first palette). Exact matches map directly, others go
 * to the nearest slot of the source palette when ΔE ≤ threshold and are pinned otherwise.
 */
export function buildColorMap(
  colors: string[],
  palettes: Palette[],
  threshold = COLOR_THRESHOLD,
  fallbackPalette?: string,
): ColorMapResult {
  const hexes = [...new Set(colors.map((c) => normalizeHex(c)).filter((c): c is Hex => !!c))];
  if (palettes.length === 0) throw new Error('buildColorMap: no palettes');

  const votes = new Map<string, number>();
  for (const hex of hexes) {
    const owners = palettes.filter((p) => SLOT_NAMES.some((s) => p.slots[s] === hex));
    if (owners.length === 1) votes.set(owners[0]!.id, (votes.get(owners[0]!.id) ?? 0) + 1);
  }
  const fallback = palettes.find((p) => p.id === fallbackPalette) ?? palettes[0]!;
  const best = Math.max(0, ...votes.values());
  const leaders = palettes.filter((p) => (votes.get(p.id) ?? 0) === best && best > 0);
  const source = leaders.find((p) => p === fallback) ?? leaders[0] ?? fallback;

  const result: ColorMapResult = {
    sourcePalette: source.id,
    colorMap: {},
    pinned: [],
    approximations: [],
    pinnedDetails: [],
  };
  for (const hex of hexes) {
    const exact = SLOT_NAMES.find((s) => source.slots[s] === hex);
    if (exact) {
      result.colorMap[hex] = exact;
      continue;
    }
    let nearest: SlotName = SLOT_NAMES[0]!;
    let dist = Infinity;
    for (const s of SLOT_NAMES) {
      const d = deltaE(hex, source.slots[s]);
      if (d < dist) {
        dist = d;
        nearest = s;
      }
    }
    if (dist <= threshold) {
      result.colorMap[hex] = nearest;
      result.approximations.push({ color: hex, slot: nearest, deltaE: dist });
    } else {
      result.pinned.push(hex);
      result.pinnedDetails.push({ color: hex, nearest, deltaE: dist });
    }
  }
  result.pinned.sort();
  return result;
}
