import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AssetFile, ItemDef, ItemId, LibraryManifest } from '@ic/core';
import { analyzeExample, extractTemplate, type FigmaNode } from '../templates';

const frames: FigmaNode[] = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/example-frames.json', import.meta.url)), 'utf8'),
);
const frame = (id: string) => frames.find((f) => f.id === id)!;

const asset = (w: number, h: number): AssetFile => ({
  file: 'x.svg',
  width: w,
  height: h,
  viewBox: `0 0 ${w} ${h}`,
  sourcePalette: 'lilac',
  colorMap: {},
  pinned: [],
});
const item = (id: ItemId, w: number, h: number): ItemDef => ({
  id,
  label: id,
  nominalWidth: w,
  nominalHeight: h,
  stacking: 'flat',
  variants: {
    L: { main: asset(w, h), background: asset(w, h) },
    S: { main: asset(w / 2, h / 2), background: asset(w / 2, h / 2) },
  },
});
const manifest: LibraryManifest = {
  version: 1,
  figmaFileKey: 'k',
  syncedAt: '2026-11-03T00:00:00Z',
  items: [
    item('book', 1446, 977),
    item('phone', 797, 462),
    item('puzzle', 544, 314),
    item('headphones', 888, 692),
    item('vase', 591, 747),
  ],
  decor: [],
  backgrounds: [],
};

describe('extractTemplate', () => {
  it('square frame: book is the hero, phone supports', () => {
    const t = extractTemplate(frame('24:2437'), manifest);
    expect(t.aspect).toBe('square');
    expect(t.sourceFrame).toBe('24:2437');
    expect(t.slots.map((s) => s.role)).toEqual(['hero', 'support']);
    const hero = t.slots[0]!;
    expect(hero.cx).toBeCloseTo((-639.7 + 1445.9 / 2) / 1000, 2);
    expect(hero.cy).toBeCloseTo((11.7 + 976.7 / 2) / 1000, 2);
    expect(t.scale).toBeCloseTo(1445.9 / 1446, 3);
    expect(t.frame).toEqual({ width: 1000, height: 1000 });
    expect(t.slots.map((s) => s.sourceItem)).toEqual(['book', 'phone']);
    expect(t.slots.map((s) => s.z)).toEqual([0, 1]);
    expect(hero.rotation).toBe(0);
  });

  it('landscape frame: unnamed vase group in background state becomes the backdrop', () => {
    const t = extractTemplate(frame('24:8127'), manifest);
    expect(t.aspect).toBe('landscape');
    // child order: vase (Group 2136136347) first, then headphones
    expect(t.slots.map((s) => s.role)).toEqual(['backdrop', 'hero']);
    // globalScale of the example: hero bbox width / hero nominal width
    expect(t.scale).toBeCloseTo(888.1 / 888, 3);
    expect(t.frame).toEqual({ width: 1200, height: 630 });
    expect(t.slots.map((s) => s.sourceItem)).toEqual(['vase', 'headphones']);
    expect(t.slots[1]!.cy).toBeCloseTo((77.3 + 691.5 / 2) / 630, 2);
  });

  it('portrait frame: largest main item is the hero', () => {
    const t = extractTemplate(frame('24:9802'), manifest);
    expect(t.aspect).toBe('portrait');
    expect(t.slots.map((s) => s.role)).toEqual(['hero', 'support']);
    expect(t.scale).toBeCloseTo(796.5 / 797, 3);
    expect(t.frame).toEqual({ width: 800, height: 1200 });
    expect(t.slots[0]!.sourceItem).toBe('phone');
    expect(t).not.toHaveProperty('heroWidthFrac');
  });

  it('off-palette copies keep their state (#F5EFC9 headphones stay main)', () => {
    const a = analyzeExample(frame('24:8127'), manifest);
    expect(a.items.map((i) => [i.item, i.state])).toEqual([
      ['vase', 'background'],
      ['headphones', 'main'],
    ]);
  });

  it('ignores decor and hidden children', () => {
    const t = extractTemplate(frame('24:8127'), manifest);
    expect(t.slots).toHaveLength(2);
  });
});
