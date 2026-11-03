import {
  SLOT_NAMES,
  normalizeHex,
  parseAsePalette,
  parsePaletteText,
  type Palette,
  type PaletteParseResult,
  type SlotName,
} from '@ic/core';

/**
 * The only door for user palettes (upload, paste, localStorage) into the editor.
 * Slot values end up in SVG attributes rendered with dangerouslySetInnerHTML, so every
 * palette is re-parsed by core here and must consist of plain `#RRGGBB` values.
 */

export const STORAGE_KEY = 'ic.customPalettes.v1';
const MAX_NAME = 40;
const MAX_STORED = 12;
const DEFAULT_NAME = 'Своя палитра';
const CUSTOM_ID = /^custom-[a-z0-9-]{1,40}$/;

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const newId = () =>
  `custom-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

function cleanName(v: unknown): string {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return s ? s.slice(0, MAX_NAME) : DEFAULT_NAME;
}

/** True when every slot is exactly a normalised hex (what core produces). */
export function isSafePalette(p: Palette | null | undefined): p is Palette {
  if (!p || typeof p !== 'object' || typeof p.slots !== 'object' || p.slots === null) return false;
  return SLOT_NAMES.every((s) => {
    const v = p.slots[s];
    return typeof v === 'string' && normalizeHex(v) === v;
  });
}

/** Unknown value → a palette with a `custom-*` id, or null when any slot is not a hex colour. */
export function sanitizePalette(raw: unknown): Palette | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const obj = raw as { id?: unknown; name?: unknown; slots?: unknown };
  if (typeof obj.slots !== 'object' || obj.slots === null) return null;
  // core's JSON path: every slot goes through normalizeHex, a bad one fails the whole palette
  const r = parsePaletteText(JSON.stringify({ slots: obj.slots }));
  if (!r.ok || !isSafePalette(r.palette)) return null;
  const id = typeof obj.id === 'string' && CUSTOM_ID.test(obj.id) ? obj.id : newId();
  return { id, name: cleanName(obj.name), slots: r.palette.slots };
}

export type UploadInput = { text: string; name?: string } | { ase: ArrayBuffer; name?: string };

/** Pasted text, a .json/.txt file's text or .ase bytes → a palette via core's parsers. */
export function paletteFromUpload(input: UploadInput): PaletteParseResult {
  const r: PaletteParseResult =
    'ase' in input ? parseAsePalette(input.ase) : parsePaletteText(input.text);
  if (!r.ok) return r;
  const palette = sanitizePalette({
    ...r.palette,
    id: undefined,
    name: input.name ?? r.palette.name,
  });
  return palette
    ? { ok: true, palette, warnings: r.warnings }
    : { ok: false, error: 'Цвета палитры некорректны' };
}

export function swapSlots(p: Palette, a: SlotName, b: SlotName): Palette {
  return { ...p, slots: { ...p.slots, [a]: p.slots[b], [b]: p.slots[a] } };
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadCustomPalettes(storage = defaultStorage()): Palette[] {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return [];
    const list: unknown = JSON.parse(text);
    if (!Array.isArray(list)) return [];
    return list
      .map(sanitizePalette)
      .filter((p): p is Palette => p !== null)
      .slice(0, MAX_STORED);
  } catch {
    return [];
  }
}

export function saveCustomPalettes(list: Palette[], storage = defaultStorage()): void {
  try {
    const safe = list.filter(isSafePalette).slice(0, MAX_STORED);
    storage?.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // storage full or blocked: palettes stay for this session only
  }
}
