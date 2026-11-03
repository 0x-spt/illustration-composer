import { normalizeHex, type Hex } from '../color/hex';
import { assignSlots } from './assign';
import { parseAseDetailed } from './ase';
import { SLOT_NAMES, type Palette } from './types';

export type PaletteParseResult =
  { ok: true; palette: Palette; warnings: string[] } | { ok: false; error: string };

const DEFAULT_NAME = 'Своя палитра';
const HEX_IN_TEXT = /(?<![0-9a-z#])#?([0-9a-f]{3}|[0-9a-f]{6})(?![0-9a-z])/gi;

function fromColors(colors: Hex[], name: string, extra: string[] = []): PaletteParseResult {
  try {
    const { slots, warnings } = assignSlots(colors);
    return { ok: true, palette: { id: 'custom', name, slots }, warnings: [...extra, ...warnings] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function extractHexes(text: string): Hex[] {
  const all = [...text.matchAll(HEX_IN_TEXT)];
  // Words such as "bad" or "face" are valid hex; if any code has an explicit '#', trust only those.
  const marked = all.filter((m) => m[0].startsWith('#'));
  const picked = marked.length > 0 ? marked : all;
  return picked.map((m) => normalizeHex(m[0])).filter((h): h is Hex => h !== null);
}

function paletteFromObject(obj: Record<string, unknown>, name?: string): PaletteParseResult | null {
  const rawSlots = obj.slots;
  if (typeof rawSlots !== 'object' || rawSlots === null) return null;
  const slots = {} as Palette['slots'];
  for (const slot of SLOT_NAMES) {
    const v = (rawSlots as Record<string, unknown>)[slot];
    const hex = typeof v === 'string' ? normalizeHex(v) : null;
    if (hex === null)
      return { ok: false, error: `В палитре нет корректного цвета для места ${slot}` };
    slots[slot] = hex;
  }
  return {
    ok: true,
    palette: {
      id: typeof obj.id === 'string' ? obj.id : 'custom',
      name: name ?? (typeof obj.name === 'string' ? obj.name : DEFAULT_NAME),
      slots,
    },
    warnings: [],
  };
}

export function parsePaletteText(text: string, name?: string): PaletteParseResult {
  const label = name ?? DEFAULT_NAME;
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = undefined;
    }
    if (Array.isArray(json)) {
      const colors = json
        .map((v) => (typeof v === 'string' ? normalizeHex(v) : null))
        .filter((h): h is Hex => h !== null);
      return fromColors(colors, label);
    }
    if (typeof json === 'object' && json !== null) {
      const r = paletteFromObject(json as Record<string, unknown>, name);
      if (r) return r;
    }
  }
  const colors = extractHexes(text);
  if (colors.length === 0) return { ok: false, error: 'В тексте не найдено ни одного hex-цвета' };
  return fromColors(colors, label);
}

/** Convenience for uploads: ASE bytes straight to a palette. */
export function parseAsePalette(buf: ArrayBuffer, name?: string): PaletteParseResult {
  try {
    const { colors, warnings } = parseAseDetailed(buf);
    return fromColors(colors, name ?? DEFAULT_NAME, warnings);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
