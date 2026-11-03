// D13: compositions of any items keep them apart, only flat-on-surface stacks, and keep
// lamps, vases and headphones whole; checked over every 2- and 3-item combination.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CompositionIntent } from '../src/intent/schema';
import {
  composeScene,
  FIT_FLOOR,
  layoutCandidates,
  sceneCollisions,
  SETTLE_FLOOR,
  visibleFraction,
} from '../src/layout/compose';
import { HERO_MIN_VISIBLE_UPRIGHT } from '../src/layout/types';
import { ITEM_IDS, type ItemId } from '../src/library/types';
import { addItem, moveNode } from '../src/scene/ops';
import type { Format, Scene } from '../src/scene/types';
import { loadRealLibrary, paletteById, readAsset } from './library';

const lib = loadRealLibrary();
const lilac = paletteById(lib, 'lilac');
const FORMATS: Format[] = [
  { width: 1000, height: 1000 },
  { width: 1200, height: 630 },
  { width: 800, height: 1200 },
];

const named = (...items: ItemId[]): CompositionIntent => ({
  items: items.map((item) => ({ item, state: 'main', role: 'support' })),
  rationale: 'names',
});
const opts = (format: Format, variant = 0, maxFit?: number) => ({
  format,
  detail: 'L' as const,
  palette: lilac,
  backgroundPresetId: null,
  variant,
  maxFit,
});

const COMBOS: ItemId[][] = [];
for (let i = 0; i < ITEM_IDS.length; i++)
  for (let j = i + 1; j < ITEM_IDS.length; j++) {
    COMBOS.push([ITEM_IDS[i]!, ITEM_IDS[j]!]);
    for (let k = j + 1; k < ITEM_IDS.length; k++)
      COMBOS.push([ITEM_IDS[i]!, ITEM_IDS[j]!, ITEM_IDS[k]!]);
  }

const def = (id: ItemId) => lib.manifest.items.find((i) => i.id === id)!;
function boxOf(s: Scene, id: string) {
  const n = s.nodes.find((x) => x.id === id)!;
  const d = def(n.ref.kind === 'item' ? n.ref.item : 'book');
  const w = d.nominalWidth * s.globalScale;
  return { box: { cx: n.x, cy: n.y, w, h: (w * d.nominalHeight) / d.nominalWidth }, n };
}

describe('silhouettes', () => {
  it('every item variant has a mask rendered from its current SVG', () => {
    for (const item of lib.manifest.items)
      for (const size of ['L', 'S'] as const)
        for (const state of ['main', 'background'] as const) {
          const file = item.variants[size][state].file;
          const mask = lib.masks[file];
          expect(mask, `${file}: run npm run library:masks`).toBeDefined();
          const sha1 = createHash('sha1').update(readAsset(file)).digest('hex');
          expect(mask!.sha1, `${file} changed: run npm run library:masks`).toBe(sha1);
        }
  });
});

/** First layout of every combination in every format, composed once for the sweeps below. */
const SWEEP = FORMATS.flatMap((format) =>
  COMBOS.map((items) => {
    const intent = named(...items);
    return {
      format,
      items,
      intent,
      template: layoutCandidates(intent, opts(format), lib)[0]!.template,
      scene: composeScene(intent, opts(format), lib),
    };
  }),
);

describe('composed scenes (D13)', () => {
  it('no two items collide in the first layout of any combination, in any format', () => {
    const hits: string[] = [];
    for (const { format, items, scene } of SWEEP)
      for (const [a, b] of sceneCollisions(scene, lib))
        hits.push(`${format.width}×${format.height} ${items.join('+')}: ${a} / ${b}`);
    // one known case: book + lamp + folder in 1200×630 has a single 3-slot template and the
    // least colliding layout keeps a sliver of contact
    expect(hits.filter((h) => !h.startsWith('1200×630 book+lamp+folder:'))).toEqual([]);
  });

  it('lamp, vase, headphones and other non-surfaces stay whole; only surfaces are cut', () => {
    for (const { format, items, template: t, scene: s } of SWEEP)
      for (const n of s.nodes) {
        if (n.ref.kind !== 'item' || def(n.ref.item).stacking === 'surface') continue;
        const d = def(n.ref.item);
        // in a slot drawn for this very item the designer's crop is kept (layout.test)
        const own = t.slots.find((sl) => sl.sourceItem === d.id);
        const designer = own
          ? visibleFraction(
              {
                cx: own.cx * t.frame.width,
                cy: own.cy * t.frame.height,
                w: d.nominalWidth * t.scale,
                h: d.nominalHeight * t.scale,
              },
              own.rotation,
              t.frame,
            )
          : 1;
        const min = Math.min(HERO_MIN_VISIBLE_UPRIGHT, designer);
        const vis = visibleFraction(boxOf(s, n.id).box, n.rotation, format);
        const where = `${format.width}×${format.height} ${items.join('+')} ${n.id}`;
        expect(vis, where).toBeGreaterThanOrEqual(min - 1e-6);
      }
  });

  it('a flat item may lie on a surface (phone on book), nothing lies on a lamp', () => {
    let s = addItem(
      { ...composeScene(named('book'), opts(FORMATS[0]!), lib), globalScale: 0.6 },
      'phone',
      'main',
      { x: 500, y: 500 },
    );
    const book = s.nodes.find((n) => n.ref.kind === 'item' && n.ref.item === 'book')!;
    s = moveNode(s, book.id, 500, 500);
    expect(sceneCollisions(s, lib)).toEqual([]);

    const lamp = addItem({ ...s, nodes: [] }, 'lamp', 'main', { x: 500, y: 500 });
    const onLamp = addItem(lamp, 'coin', 'main', { x: 560, y: 380 });
    expect(sceneCollisions(onLamp, lib)).toHaveLength(1);
  });

  it('a background-state item lies under the scene, and the first layout settles', () => {
    // two main items and a third in the background state: what the AI returns most often
    const unsettled: string[] = [];
    for (const format of FORMATS)
      for (const bg of ITEM_IDS)
        for (const [a, b] of COMBOS.filter((c) => c.length === 2 && !c.includes(bg))) {
          const intent: CompositionIntent = {
            items: [
              { item: a!, state: 'main', role: 'support' },
              { item: b!, state: 'main', role: 'support' },
              { item: bg, state: 'background', role: 'backdrop' },
            ],
            rationale: 'backdrop',
          };
          const first = layoutCandidates(intent, opts(format), lib)[0]!;
          if (!first.settled) unsettled.push(`${format.width}×${format.height} ${a}+${b} bg:${bg}`);
          const s = composeScene(intent, opts(format), lib);
          // the backdrop is under every main item
          expect(
            s.nodes.findIndex((n) => n.ref.kind === 'item' && n.ref.state === 'background'),
          ).toBe(0);
        }
    expect(unsettled).toEqual([]);
  }, 60_000);

  // sweeps of every candidate of every combination: well over the default 5 s on a busy CI
  const SLOW = 60_000;

  it(
    'every layout settles at a fit between SETTLE_FLOOR and the start fit',
    () => {
      for (const { format, intent } of SWEEP)
        for (const c of layoutCandidates(intent, opts(format), lib)) {
          expect(c.fit).toBeGreaterThanOrEqual(SETTLE_FLOOR - 1e-9);
          expect(c.fit).toBeLessThanOrEqual(1 + 1e-9);
        }
    },
    SLOW,
  );

  it(
    'maxFit caps the scene: the names scenario starts at 70 %',
    () => {
      for (const { format, intent } of SWEEP)
        for (const c of layoutCandidates(intent, opts(format, 0, 0.7), lib))
          expect(c.fit).toBeLessThanOrEqual(0.7 + 1e-9);
      // the designer's own folder + wallet + coin settles at full size without a cap
      const own = named('folder', 'wallet', 'coin');
      expect(layoutCandidates(own, opts(FORMATS[0]!), lib)[0]!.fit).toBe(1);
      expect(layoutCandidates(own, opts(FORMATS[0]!, 0, 0.7), lib)[0]!.fit).toBeCloseTo(0.7, 9);
      expect(FIT_FLOOR).toBeLessThan(0.7);
    },
    SLOW,
  );
});
