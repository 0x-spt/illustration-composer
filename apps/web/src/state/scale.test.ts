import rawManifest from '@ic/library/data/manifest.json';
import rawPalettes from '@ic/library/data/palettes.json';
import rawTemplates from '@ic/library/data/templates.json';
import {
  createLibrary,
  MAX_SCALE,
  MIN_SCALE,
  type LayoutTemplate,
  type LibraryManifest,
  type Palette,
} from '@ic/core';
import { describe, expect, it } from 'vitest';
import { scaleView } from './scale';

const lib = createLibrary(
  rawManifest as unknown as LibraryManifest,
  rawPalettes as unknown as Palette[],
  rawTemplates as unknown as LayoutTemplate[],
  () => '',
);

describe('scaleView', () => {
  it('100 % means the example size at the default square', () => {
    const v = scaleView(1, { width: 1000, height: 1000 }, lib);
    expect(v.percent).toBe(100);
    expect([v.min, v.max]).toEqual([10, 400]);
  });

  it('at 2400×2400 a composed scene (gs 2.4) reads 100 % and the slider covers gs up to 4', () => {
    const f = { width: 2400, height: 2400 };
    const v = scaleView(2.4, f, lib);
    expect(v.percent).toBe(100);
    expect(v.max).toBeGreaterThan(v.percent);
    // touching the slider at its current value keeps the scene size
    expect(v.toScale(v.percent)).toBeCloseTo(2.4, 9);
    expect(v.toScale(v.max)).toBeLessThanOrEqual(MAX_SCALE);
    expect(v.toScale(v.max)).toBeGreaterThan(MAX_SCALE * 0.99);
    expect(v.toScale(v.min)).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it('uses the aspect frame width: 1200 for landscape, 800 for portrait', () => {
    expect(scaleView(1, { width: 1200, height: 630 }, lib).percent).toBe(100);
    expect(scaleView(1, { width: 800, height: 1200 }, lib).percent).toBe(100);
    expect(scaleView(2, { width: 1600, height: 2400 }, lib).percent).toBe(100);
  });
});
