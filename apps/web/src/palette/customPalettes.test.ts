import { BUILTIN_PALETTES, type Palette } from '@ic/core';
import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  isSafePalette,
  loadCustomPalettes,
  paletteFromUpload,
  sanitizePalette,
  saveCustomPalettes,
  swapSlots,
  type KeyValueStorage,
} from './customPalettes';

function memoryStorage(init: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(init));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const lilac = BUILTIN_PALETTES[0]!;
const EIGHT = '#D7CDF5 #AA9BF0 #7864D7 #F9ECB0 #F9A3AA #FFE3E1 #181817 #FFFFFF';

describe('sanitizePalette', () => {
  it('keeps a valid palette, normalising hex and forcing a custom id', () => {
    const p = sanitizePalette({
      id: 'lilac',
      name: '  Моя  ',
      slots: { ...lilac.slots, bg1: 'd7cdf5' },
    });
    expect(p).not.toBeNull();
    expect(p!.slots.bg1).toBe('#D7CDF5');
    expect(p!.id).toMatch(/^custom-/);
    expect(p!.name).toBe('Моя');
  });

  it('drops a palette whose slot is not a plain hex (markup injection)', () => {
    const evil = { ...lilac, slots: { ...lilac.slots, obj1: '#fff" onload="alert(1)' } };
    expect(sanitizePalette(evil)).toBeNull();
    expect(sanitizePalette({ ...lilac, slots: { ...lilac.slots, ink: 'red' } })).toBeNull();
    expect(sanitizePalette({ name: 'x' })).toBeNull();
    expect(sanitizePalette('#FFFFFF')).toBeNull();
    expect(sanitizePalette(null)).toBeNull();
  });

  it('truncates long names and replaces non-string names', () => {
    expect(sanitizePalette({ ...lilac, name: 'а'.repeat(200) })!.name).toHaveLength(40);
    expect(sanitizePalette({ ...lilac, name: 42 })!.name).toBe('Своя палитра');
  });
});

describe('isSafePalette', () => {
  it('accepts built-ins and rejects any slot that is not #RRGGBB', () => {
    for (const p of BUILTIN_PALETTES) expect(isSafePalette(p)).toBe(true);
    const bad = { ...lilac, slots: { ...lilac.slots, bg2: 'url(#x)' } } as Palette;
    expect(isSafePalette(bad)).toBe(false);
  });
});

describe('localStorage round trip', () => {
  it('re-validates on load and drops invalid entries', () => {
    const good = sanitizePalette({ ...lilac, id: 'custom-a1', name: 'Хорошая' })!;
    const storage = memoryStorage({
      [STORAGE_KEY]: JSON.stringify([
        good,
        { id: 'custom-b2', name: 'Злая', slots: { ...lilac.slots, obj2: '"/><script>x</script>' } },
        'garbage',
        { id: 'custom-c3' },
      ]),
    });
    const loaded = loadCustomPalettes(storage);
    expect(loaded).toEqual([good]);
  });

  it('returns [] for corrupt JSON or a throwing storage', () => {
    expect(loadCustomPalettes(memoryStorage({ [STORAGE_KEY]: '{not json' }))).toEqual([]);
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadCustomPalettes(throwing)).toEqual([]);
    expect(() => saveCustomPalettes([lilac], throwing)).not.toThrow();
  });

  it('saves only safe palettes', () => {
    const storage = memoryStorage();
    const evil = { ...lilac, id: 'custom-z', slots: { ...lilac.slots, ink: 'javascript:' } };
    saveCustomPalettes([sanitizePalette(lilac)!, evil as Palette], storage);
    expect(loadCustomPalettes(storage)).toHaveLength(1);
  });
});

describe('paletteFromUpload', () => {
  it('parses pasted text through core', () => {
    const r = paletteFromUpload({ text: EIGHT });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.palette.slots).toEqual(lilac.slots);
      expect(r.palette.id).toMatch(/^custom-/);
    }
  });

  it('reports a core error for too few colours', () => {
    const r = paletteFromUpload({ text: '#FFFFFF #000000' });
    expect(r.ok).toBe(false);
  });

  it('parses ASE bytes through core', () => {
    const r = paletteFromUpload({ ase: new ArrayBuffer(4) });
    expect(r.ok).toBe(false);
  });
});

describe('swapSlots', () => {
  it('swaps two slots and leaves the rest', () => {
    const p = swapSlots(lilac, 'bg1', 'obj2');
    expect(p.slots.bg1).toBe(lilac.slots.obj2);
    expect(p.slots.obj2).toBe(lilac.slots.bg1);
    expect(p.slots.ink).toBe(lilac.slots.ink);
    expect(lilac.slots.bg1).toBe('#D7CDF5');
  });
});
