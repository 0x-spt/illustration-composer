import { describe, expect, it } from 'vitest';
import { buildColorMap, collectColors } from '../colors';
import { COLOR_THRESHOLD, SPEC_PALETTES } from '../library.config';

describe('buildColorMap', () => {
  it('detects the lilac scheme and maps colours to slots', () => {
    const r = buildColorMap(['#D7CDF5', '#7864D7', '#181817', '#F9ECB0'], SPEC_PALETTES, 3);
    expect(r.sourcePalette).toBe('lilac');
    expect(r.colorMap['#7864D7']).toBe('bg3');
    expect(r.colorMap['#181817']).toBe('ink');
    expect(r.colorMap['#F9ECB0']).toBe('obj1');
    expect(r.colorMap['#D7CDF5']).toBe('bg1');
    expect(r.pinned).toEqual([]);
  });

  it('detects the peach scheme', () => {
    const r = buildColorMap(['#FDD7B9', '#D27532'], SPEC_PALETTES, 3);
    expect(r.sourcePalette).toBe('peach');
    expect(r.colorMap['#FDD7B9']).toBe('bg1');
    expect(r.colorMap['#D27532']).toBe('bg3');
  });

  it('binds near colours within the threshold and pins far ones', () => {
    const r = buildColorMap(['#171714', '#757575'], SPEC_PALETTES, 3);
    expect(r.colorMap['#171714']).toBe('ink');
    expect(r.pinned).toEqual(['#757575']);
    expect(r.colorMap['#757575']).toBeUndefined();
  });

  it('default threshold is 8: vase #EEE2F6 binds to bg1, greys stay pinned', () => {
    expect(COLOR_THRESHOLD).toBe(8);
    const r = buildColorMap(['#D7CDF5', '#EEE2F6', '#757575', '#D9D9D9'], SPEC_PALETTES);
    expect(r.colorMap['#EEE2F6']).toBe('bg1');
    expect(r.pinned).toEqual(['#757575', '#D9D9D9']);
  });

  it('colours shared by every scheme do not vote', () => {
    // #FFFFFF / #181817 are in all schemes; #5ABEBE is mint-only.
    const r = buildColorMap(['#FFFFFF', '#181817', '#5ABEBE'], SPEC_PALETTES, 3);
    expect(r.sourcePalette).toBe('mint');
    expect(r.colorMap['#FFFFFF']).toBe('paper');
  });

  it('colours shared by two schemes do not vote either', () => {
    // #80DADA is peach obj2 and mint bg2; #FAC896 is peach-only.
    const r = buildColorMap(['#80DADA', '#FAC896'], SPEC_PALETTES, 3);
    expect(r.sourcePalette).toBe('peach');
    expect(r.colorMap['#80DADA']).toBe('obj2');
  });

  it('falls back to the given palette when nothing votes', () => {
    expect(buildColorMap(['#FFFFFF'], SPEC_PALETTES, 3).sourcePalette).toBe('lilac');
    expect(buildColorMap(['#FFFFFF'], SPEC_PALETTES, 3, 'mint').sourcePalette).toBe('mint');
  });

  it('normalises input hex', () => {
    const r = buildColorMap(['#d7cdf5', 'fff'], SPEC_PALETTES, 3);
    expect(r.colorMap['#D7CDF5']).toBe('bg1');
    expect(r.colorMap['#FFFFFF']).toBe('paper');
  });
});

describe('collectColors', () => {
  const svg =
    '<svg><path fill="#D7CDF5" stroke="#181817" d="M0 0"/><stop stop-color="#7864D7"/><path fill="none" d="M1 1"/><rect fill="url(#a)"/><path fill="#D7CDF5" d="M2 2"/></svg>';

  it('collects distinct fill/stroke/stop-color hexes', () => {
    expect(collectColors(svg).sort()).toEqual(['#181817', '#7864D7', '#D7CDF5']);
  });
});
