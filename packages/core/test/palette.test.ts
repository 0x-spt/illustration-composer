import { describe, expect, it } from 'vitest';
import type { Hex } from '../src/color/hex';
import { parseAseDetailed } from '../src/palette/ase';
import { assignSlots } from '../src/palette/assign';
import { BUILTIN_PALETTES } from '../src/palette/builtin';
import { parsePaletteText } from '../src/palette/parse';
import { SLOT_NAMES, type Palette } from '../src/palette/types';

function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function aseBuffer(colors: [number, number, number][]): ArrayBuffer {
  const parts: number[] = [];
  const u16 = (n: number) => parts.push((n >> 8) & 255, n & 255);
  const u32 = (n: number) =>
    parts.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  const f32 = (n: number) => {
    const b = new DataView(new ArrayBuffer(4));
    b.setFloat32(0, n, false);
    for (let i = 0; i < 4; i++) parts.push(b.getUint8(i));
  };
  parts.push(0x41, 0x53, 0x45, 0x46);
  u16(1);
  u16(0);
  u32(colors.length);
  colors.forEach(([r, g, b], i) => {
    const name = `c${i}`;
    u16(0x0001);
    u32(2 + (name.length + 1) * 2 + 4 + 12 + 2);
    u16(name.length + 1);
    for (const ch of name) u16(ch.charCodeAt(0));
    u16(0);
    parts.push(0x52, 0x47, 0x42, 0x20);
    f32(r);
    f32(g);
    f32(b);
    u16(2);
  });
  return new Uint8Array(parts).buffer;
}

describe('assignSlots', () => {
  for (const palette of BUILTIN_PALETTES) {
    it(`restores built-in "${palette.id}" from shuffled colours`, () => {
      const colors = SLOT_NAMES.map((s) => palette.slots[s]);
      for (const seed of [1, 2, 3, 4, 5]) {
        const { slots } = assignSlots(shuffled(colors, seed));
        expect(slots).toEqual(palette.slots);
      }
    });
  }

  it('exposes the three built-in palettes', () => {
    expect(BUILTIN_PALETTES.map((p) => p.id)).toEqual(['lilac', 'peach', 'mint']);
  });

  it('fails with a minimum-6 message on too few colours', () => {
    const r = parsePaletteText('#112233, #AABBCC');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('нужно минимум 6 цветов');
  });

  it('falls back to default ink/paper with warnings', () => {
    const six: Hex[] = ['#D7CDF5', '#AA9BF0', '#7864D7', '#F9ECB0', '#F9A3AA', '#FFE3E1'];
    const r = assignSlots(six);
    expect(r.slots.ink).toBe('#181817');
    expect(r.slots.paper).toBe('#FFFFFF');
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('drops near-duplicates (deltaE < 2)', () => {
    const r = parsePaletteText('#D7CDF5 #D7CDF6 #AA9BF0 #7864D7 #F9ECB0 #F9A3AA #FFE3E1');
    expect(r.ok).toBe(true);
  });
});

describe('parsePaletteText', () => {
  it('rejects text without usable colours', () => {
    expect(parsePaletteText('foo, #ZZZ, 123').ok).toBe(false);
  });

  it('uses 8 of 20 colours with a warning', () => {
    const base = BUILTIN_PALETTES[0] as Palette;
    const extra = Array.from(
      { length: 12 },
      (_, i) =>
        `#${(i * 20 + 30).toString(16).padStart(2, '0')}80${(255 - i * 15).toString(16).padStart(2, '0')}`,
    );
    const text = [...SLOT_NAMES.map((s) => base.slots[s]), ...extra].join(' ');
    const r = parsePaletteText(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.join('|')).toContain('использовано 8 из 20');
  });

  it('passes a Palette JSON through unchanged', () => {
    const p = BUILTIN_PALETTES[1] as Palette;
    const r = parsePaletteText(JSON.stringify(p));
    expect(r).toEqual({ ok: true, palette: p, warnings: [] });
  });

  it('accepts {slots} and a JSON hex array', () => {
    const p = BUILTIN_PALETTES[2] as Palette;
    const a = parsePaletteText(JSON.stringify({ slots: p.slots }), 'Моя');
    expect(a.ok && a.palette.slots).toEqual(p.slots);
    expect(a.ok && a.palette.name).toBe('Моя');
    const b = parsePaletteText(
      JSON.stringify(
        shuffled(
          SLOT_NAMES.map((s) => p.slots[s]),
          7,
        ),
      ),
    );
    expect(b.ok && b.palette.slots).toEqual(p.slots);
  });

  it('extracts hex codes from free text', () => {
    const p = BUILTIN_PALETTES[0] as Palette;
    const text = `Палитра: ${shuffled(
      SLOT_NAMES.map((s) => p.slots[s]),
      3,
    ).join('; ')}`;
    const r = parsePaletteText(text);
    expect(r.ok && r.palette.slots).toEqual(p.slots);
  });
});

describe('parseAseDetailed', () => {
  it('reads RGB colours', () => {
    const buf = aseBuffer([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(parseAseDetailed(buf).colors).toEqual(['#FF0000', '#00FF00', '#0000FF']);
  });

  it('rejects non-ASE data', () => {
    expect(() => parseAseDetailed(new ArrayBuffer(8))).toThrow('Это не ASE-файл');
  });

  // one RGB block: header 12 bytes, block type at 12, length at 14, name length at 18
  const oneColour = () => new DataView(aseBuffer([[1, 0, 0]]));

  it('rejects a block shorter than its colour entry', () => {
    const v = oneColour();
    v.setUint32(14, 8, false);
    expect(() => parseAseDetailed(v.buffer as ArrayBuffer)).toThrow('ASE-файл повреждён');
  });

  it('rejects a name length that runs past the block', () => {
    const v = oneColour();
    v.setUint16(18, 0xffff, false);
    expect(() => parseAseDetailed(v.buffer as ArrayBuffer)).toThrow('ASE-файл повреждён');
  });

  it.each([NaN, Infinity])('rejects a %s colour component', (bad) => {
    expect(() => parseAseDetailed(aseBuffer([[1, bad, 0]]))).toThrow('ASE-файл повреждён');
  });
});
