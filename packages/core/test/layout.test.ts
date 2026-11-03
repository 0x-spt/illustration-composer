import { describe, expect, it } from 'vitest';
import type { CompositionIntent, IntentItem } from '../src/intent/schema';
import {
  composeScene,
  countTemplateCandidates,
  FIT_FLOOR,
  layoutCandidates,
  sceneCollisions,
  selectTemplates,
  SETTLE_FLOOR,
  SETTLE_SCALE_STEP,
  templateCandidates,
  templateFit,
  visibleFraction,
} from '../src/layout/compose';
import { HERO_MIN_VISIBLE_UPRIGHT } from '../src/layout/types';
import { placeDecor, resolvePresetForDetail } from '../src/layout/decor';
import { aspectOf, decorScale } from '../src/layout/frame';
import { decorUnit } from '../src/library/load';
import type { Aspect, DetailSize, ItemId } from '../src/library/types';
import { exportScene } from '../src/render/export';
import { setGlobalScale } from '../src/scene/ops';
import type { Format, Scene, SceneNode } from '../src/scene/types';
import { loadRealLibrary, paletteById } from './library';

const lib = loadRealLibrary();
const lilac = paletteById(lib, 'lilac');

const FORMATS: Record<Aspect, Format> = {
  square: { width: 1000, height: 1000 },
  landscape: { width: 1200, height: 630 },
  portrait: { width: 800, height: 1200 },
};

const intent = (...items: Array<[ItemId, IntentItem['role'], IntentItem['state']?]>) =>
  ({
    items: items.map(([item, role, state]) => ({
      item,
      role,
      state: state ?? (role === 'backdrop' ? 'background' : 'main'),
    })),
    rationale: 'test',
  }) satisfies CompositionIntent;

const opts = (format: Format, variant = 0, backgroundPresetId: string | null = null) => ({
  format,
  detail: 'L' as DetailSize,
  palette: lilac,
  backgroundPresetId,
  variant,
});

const nominal = (item: ItemId) => lib.manifest.items.find((i) => i.id === item)!;
const itemNodes = (s: Scene) => s.nodes.filter((n) => n.ref.kind === 'item');
const itemOf = (n: SceneNode) => (n.ref.kind === 'item' ? n.ref.item : n.ref.decorId);
/** Canvas box of an item node: nominalWidth × globalScale, the variant's aspect. */
function box(s: Scene, n: SceneNode) {
  const def = nominal(itemOf(n) as ItemId);
  const w = def.nominalWidth * s.globalScale;
  return { cx: n.x, cy: n.y, w, h: w * (def.nominalHeight / def.nominalWidth) };
}
const inside = (s: Scene, n: SceneNode) => {
  const b = box(s, n);
  const e = 1e-6;
  return (
    b.cx - b.w / 2 >= -e &&
    b.cx + b.w / 2 <= s.format.width + e &&
    b.cy - b.h / 2 >= -e &&
    b.cy + b.h / 2 <= s.format.height + e
  );
};

describe('aspectOf', () => {
  it('ratio > 1.2 landscape, < 0.83 portrait, else square', () => {
    expect(aspectOf({ width: 1000, height: 1000 })).toBe('square');
    expect(aspectOf({ width: 1200, height: 1000 })).toBe('square');
    expect(aspectOf({ width: 1210, height: 1000 })).toBe('landscape');
    expect(aspectOf({ width: 1200, height: 630 })).toBe('landscape');
    expect(aspectOf({ width: 830, height: 1000 })).toBe('square');
    expect(aspectOf({ width: 820, height: 1000 })).toBe('portrait');
    expect(aspectOf({ width: 800, height: 1200 })).toBe('portrait');
  });
});

describe('composeScene', () => {
  const byCount: Record<number, CompositionIntent> = {
    1: intent(['book', 'hero']),
    2: intent(['book', 'hero'], ['phone', 'support']),
    3: intent(['folder', 'hero'], ['wallet', 'support'], ['coin', 'support']),
  };

  for (const aspect of ['square', 'landscape', 'portrait'] as const) {
    for (const count of [1, 2, 3]) {
      it(`${aspect}, ${count} item(s): hero is the largest, centred in frame; supports inside`, () => {
        const it = byCount[count]!;
        const n = selectTemplates(it, aspect, lib).length;
        expect(n).toBeGreaterThan(0);
        for (let variant = 0; variant < n; variant++) {
          const s = composeScene(it, opts(FORMATS[aspect], variant), lib);
          const items = itemNodes(s);
          expect(items).toHaveLength(count);
          const hero = items.find((x) => itemOf(x) === it.items[0]!.item)!;
          const heroW = box(s, hero).w;
          for (const o of items) if (o !== hero) expect(box(s, o).w).toBeLessThan(heroW);
          expect(hero.x).toBeGreaterThanOrEqual(0);
          expect(hero.x).toBeLessThanOrEqual(s.format.width);
          expect(hero.y).toBeGreaterThanOrEqual(0);
          expect(hero.y).toBeLessThanOrEqual(s.format.height);
          expect(visibleFraction(box(s, hero), 0, s.format)).toBeGreaterThanOrEqual(0.5);
          for (const o of items) if (o !== hero) expect(inside(s, o)).toBe(true);
        }
      });
    }
  }

  it('the source intent of 24:2437 reproduces the example (hero within 1px)', () => {
    const it = intent(['book', 'hero'], ['phone', 'support']);
    const cands = templateCandidates(it, opts(FORMATS.square), lib);
    const variant = cands.findIndex((t) => t.sourceFrame === '24:2437');
    expect(variant).toBeGreaterThanOrEqual(0);
    const s = composeScene(it, opts(FORMATS.square, variant), lib);
    const hero = s.nodes.find((n) => itemOf(n) === 'book')!;
    // example: book bbox x −639.7, y 11.7, 1445.9 × 976.7 in a 1000×1000 frame
    expect(Math.abs(hero.x - (-639.7 + 1445.9 / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(hero.y - (11.7 + 976.7 / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(box(s, hero).w - 1445.9)).toBeLessThanOrEqual(1);
    expect(s.nodes.map((n) => n.id)).toEqual(['book-1', 'phone-1']);
  });

  it('every template, filled with its own source items at its own frame, keeps its hero', () => {
    for (const t of lib.templates) {
      const it: CompositionIntent = {
        items: t.slots.map((sl) => ({
          item: sl.sourceItem,
          role: sl.role,
          state: sl.role === 'backdrop' ? 'background' : 'main',
        })),
        rationale: t.id,
      };
      const cands = templateCandidates(it, opts(t.frame), lib);
      const variant = cands.indexOf(t);
      expect(variant, t.id).toBeGreaterThanOrEqual(0);
      const s = composeScene(it, opts(t.frame, variant), lib);
      const heroSlot = t.slots.find((sl) => sl.role === 'hero')!;
      const hero = s.nodes.find((n) => itemOf(n) === heroSlot.sourceItem)!;
      const vis = visibleFraction(box(s, hero), 0, s.format);
      // the designer's crop is kept unless it shows less than half the hero
      if (vis > 0.5 + 1e-6) {
        expect(Math.abs(hero.x - heroSlot.cx * t.frame.width), t.id).toBeLessThanOrEqual(1);
        expect(Math.abs(hero.y - heroSlot.cy * t.frame.height), t.id).toBeLessThanOrEqual(1);
      }
      // a hero cropped below the floor in its example is raised exactly to the floor (D6)
      if (t.id === 'landscape-24-8002') expect(Math.abs(vis - 0.5)).toBeLessThanOrEqual(0.005);
      // backdrop is never clamped
      for (const sl of t.slots.filter((x) => x.role === 'backdrop')) {
        const b = s.nodes.find((n) => itemOf(n) === sl.sourceItem)!;
        expect(Math.abs(b.x - sl.cx * t.frame.width), t.id).toBeLessThanOrEqual(1);
        expect(Math.abs(b.y - sl.cy * t.frame.height), t.id).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a hero bigger than the source item is pulled in to ≥ 60% visible', () => {
    // 24:3312: phone hero fully visible; a book (1446 px) in that slot overflows the frame
    const it = intent(['book', 'hero'], ['puzzle', 'support']);
    const cands = templateCandidates(it, opts(FORMATS.square), lib);
    const variant = cands.findIndex((t) => t.sourceFrame === '24:3312');
    const s = composeScene(it, opts(FORMATS.square, variant), lib);
    const hero = s.nodes.find((n) => itemOf(n) === 'book')!;
    expect(visibleFraction(box(s, hero), 0, s.format)).toBeGreaterThanOrEqual(0.6 - 1e-6);
  });

  it('a lamp hero in the book slot of 24:2437 stays whole instead of taking the book crop (D13)', () => {
    // the designer cuts the book to ~0.56 there; a lamp cut like that stops reading as a lamp
    const it = intent(['lamp', 'hero'], ['phone', 'support']);
    const cands = templateCandidates(it, opts(FORMATS.square), lib);
    const variant = cands.findIndex((t) => t.sourceFrame === '24:2437');
    expect(variant).toBeGreaterThanOrEqual(0);
    const s = composeScene(it, opts(FORMATS.square, variant), lib);
    const hero = s.nodes.find((n) => itemOf(n) === 'lamp')!;
    expect(visibleFraction(box(s, hero), 0, s.format)).toBeGreaterThanOrEqual(
      HERO_MIN_VISIBLE_UPRIGHT - 1e-6,
    );
  });

  it('globalScale = template.scale × format.width / template.frame.width', () => {
    const it = intent(['phone', 'hero'], ['puzzle', 'support']);
    const f = { width: 1600, height: 840 };
    const t = templateCandidates(it, opts(FORMATS.landscape), lib)[0]!;
    const s = composeScene(it, opts(f, 0), lib);
    expect(s.globalScale).toBeCloseTo((t.scale * 1600) / t.frame.width, 9);
    // a phone in the book slot of 24:2437 keeps the example scale, not the book's width fraction
    const sq = composeScene(
      it,
      opts(
        FORMATS.square,
        templateCandidates(it, opts(FORMATS.square), lib).findIndex(
          (x) => x.sourceFrame === '24:2437',
        ),
      ),
      lib,
    );
    expect(sq.globalScale).toBeCloseTo(1, 2);
  });

  it('variant 0 and 1 give different scenes when there are ≥ 2 candidates', () => {
    const it = intent(['phone', 'hero'], ['puzzle', 'support']);
    for (const aspect of ['square', 'landscape', 'portrait'] as const) {
      if (selectTemplates(it, aspect, lib).length < 2) continue;
      const a = composeScene(it, opts(FORMATS[aspect], 0), lib);
      const b = composeScene(it, opts(FORMATS[aspect], 1), lib);
      expect(a.nodes).not.toEqual(b.nodes);
    }
    expect(selectTemplates(it, 'square', lib).length).toBeGreaterThanOrEqual(2);
  });

  it('variant wraps around the candidates', () => {
    const it = intent(['phone', 'hero'], ['puzzle', 'support']);
    const n = selectTemplates(it, 'square', lib).length;
    expect(composeScene(it, opts(FORMATS.square, n), lib)).toEqual(
      composeScene(it, opts(FORMATS.square, 0), lib),
    );
  });

  it('filters by role composition: hero + backdrop picks a template with a backdrop slot', () => {
    const it = intent(['headphones', 'hero'], ['vase', 'backdrop']);
    for (const aspect of ['square', 'landscape', 'portrait'] as const) {
      const cands = selectTemplates(it, aspect, lib);
      expect(cands.length).toBeGreaterThan(0);
      for (const t of cands) {
        expect(t.aspect).toBe(aspect);
        expect(t.slots.map((x) => x.role).sort()).toEqual(['backdrop', 'hero']);
      }
      const s = composeScene(it, opts(FORMATS[aspect]), lib);
      const vase = s.nodes.find((n) => itemOf(n) === 'vase')!;
      expect(vase.ref).toEqual({ kind: 'item', item: 'vase', state: 'background' });
    }
  });

  it('missing support slots: the extra support goes to a free corner opposite the hero', () => {
    // 4 items: no 4-slot template exists, the nearest have 3 slots
    const it = intent(
      ['folder', 'hero'],
      ['wallet', 'support'],
      ['coin', 'support'],
      ['pen', 'support'],
    );
    const cands = templateCandidates(it, opts(FORMATS.square), lib);
    expect(cands.length).toBeGreaterThan(0);
    for (const t of cands) expect(t.slots).toHaveLength(3);
    for (let v = 0; v < cands.length; v++) {
      const s = composeScene(it, opts(FORMATS.square, v), lib);
      expect(itemNodes(s)).toHaveLength(4);
      for (const n of itemNodes(s)) if (itemOf(n) !== 'folder') expect(inside(s, n)).toBe(true);
      const hero = s.nodes.find((n) => itemOf(n) === 'folder')!;
      const pen = s.nodes.find((n) => itemOf(n) === 'pen')!;
      // opposite quadrant on at least one axis
      expect(
        Math.sign(pen.x - 500) !== Math.sign(hero.x - 500) ||
          Math.sign(pen.y - 500) !== Math.sign(hero.y - 500),
      ).toBe(true);
    }
  });

  it('extra template slots stay empty', () => {
    const s = composeScene(intent(['phone', 'hero']), opts(FORMATS.portrait), lib);
    expect(itemNodes(s).map((n) => n.id)).toEqual(['phone-1']);
  });

  it('without a hero the first main item becomes the hero', () => {
    const it = intent(['lamp', 'backdrop'], ['phone', 'support'], ['coin', 'support']);
    const s = composeScene(it, opts(FORMATS.square), lib);
    expect(itemNodes(s)).toHaveLength(3);
  });

  it('nodes are in slot z-order, ids follow `${item}-${n}`, no node carries a scale', () => {
    const it = intent(['book', 'hero'], ['book', 'support'], ['coin', 'support']);
    const s = composeScene(it, opts(FORMATS.square, 0, 'confetti-L'), lib);
    const ids = itemNodes(s).map((n) => n.id);
    expect(ids).toContain('book-1');
    expect(ids).toContain('book-2');
    expect(new Set(s.nodes.map((n) => n.id)).size).toBe(s.nodes.length);
    for (const n of s.nodes) expect(n).not.toHaveProperty('scale');
  });

  it('item nodes: backdrops at the bottom, then the slot z-order (every 3-slot template)', () => {
    const three = lib.templates.filter((t) => t.slots.length === 3);
    expect(three.length).toBeGreaterThan(0);
    // 24:2914 lists pen (z0), book backdrop (z1), puzzle hero (z2): the backdrop goes under the
    // pen (D13), which never meets it in the example but would sit under a taller item there
    expect(three.some((t) => t.sourceFrame === '24:2914')).toBe(true);
    for (const t of three) {
      const order: Record<string, number> = { hero: 0, support: 1, backdrop: 2 };
      const slots = [...t.slots].sort((a, b) => order[a.role]! - order[b.role]!);
      const it: CompositionIntent = {
        items: slots.map((sl) => ({
          item: sl.sourceItem,
          role: sl.role,
          state: sl.role === 'backdrop' ? 'background' : 'main',
        })),
        rationale: t.id,
      };
      const cands = templateCandidates(it, opts(t.frame), lib);
      const s = composeScene(it, opts(t.frame, cands.indexOf(t)), lib);
      const under = (role: string) => (role === 'backdrop' ? 0 : 1);
      const byZ = [...t.slots]
        .sort((a, b) => under(a.role) - under(b.role) || a.z - b.z)
        .map((sl) => sl.sourceItem);
      expect(itemNodes(s).map(itemOf), t.id).toEqual(byZ);
    }
  });

  it('decor goes first (under the items) and is laid out by the format, not globalScale', () => {
    const it = intent(['phone', 'hero'], ['puzzle', 'support']);
    const f = { width: 1600, height: 840 };
    const s = composeScene(it, opts(f, 0, 'corner-L'), lib);
    const kinds = s.nodes.map((n) => n.ref.kind);
    const firstItem = kinds.indexOf('item');
    expect(kinds.slice(0, firstItem).every((k) => k === 'decor')).toBe(true);
    expect(kinds.slice(firstItem).every((k) => k === 'item')).toBe(true);
    expect(s.backgroundPresetId).toBe('corner-L');
    const preset = lib.manifest.backgrounds.find((b) => b.id === 'corner-L')!;
    expect(s.nodes.slice(0, firstItem)).toEqual(placeDecor(preset, f, lib));
  });

  it('a preset of the other detail size is resolved to this size', () => {
    const it = intent(['phone', 'hero']);
    const s = composeScene(it, { ...opts(FORMATS.square, 0, 'confetti-L'), detail: 'S' }, lib);
    expect(s.backgroundPresetId).toBe('confetti-S');
    const decor = s.nodes.filter((n) => n.ref.kind === 'decor');
    expect(decor.length).toBeGreaterThan(0);
    for (const d of decor) expect(d.ref.kind === 'decor' && d.ref.decorId).toMatch(/^confetti-S-/);
  });

  it('backgroundPresetId null → no decor', () => {
    const s = composeScene(intent(['phone', 'hero']), opts(FORMATS.square), lib);
    expect(s.nodes.every((n) => n.ref.kind === 'item')).toBe(true);
    expect(s.backgroundPresetId).toBeNull();
  });
});

describe('placeDecor', () => {
  const f = { width: 1200, height: 630 };

  it('anchors decor to its corner: br decor on 1200×630 lies at x > 600, y > 315', () => {
    for (const preset of lib.manifest.backgrounds) {
      const nodes = placeDecor(preset, f, lib);
      expect(nodes.map((n) => n.ref)).toEqual(
        preset.decorIds.map((decorId) => ({ kind: 'decor', decorId })),
      );
      for (const n of nodes) {
        const def = lib.manifest.decor.find(
          (d) => n.ref.kind === 'decor' && d.id === n.ref.decorId,
        )!;
        if (def.anchor.corner === 'br') {
          expect(n.x).toBeGreaterThan(600);
          expect(n.y).toBeGreaterThan(315);
        }
      }
    }
  });

  it('top-left = corner + (dx, dy) × decorScale; centre = top-left + size × decorScale / 2', () => {
    const preset = lib.manifest.backgrounds.find((b) => b.id === 'corner-L')!;
    const f = { width: 1800, height: 945 };
    const k = decorScale(f, lib);
    expect(k).toBeCloseTo(1.5, 9); // landscape examples are 1200 wide
    const nodes = placeDecor(preset, f, lib);
    for (const n of nodes) {
      const def = lib.manifest.decor.find((d) => n.ref.kind === 'decor' && d.id === n.ref.decorId)!;
      const { corner, dx, dy } = def.anchor;
      const cx = corner.endsWith('r') ? f.width : 0;
      const cy = corner.startsWith('b') ? f.height : 0;
      expect(n.x).toBeCloseTo(cx + dx * k + (def.asset.width * k) / 2, 9);
      expect(n.y).toBeCloseTo(cy + dy * k + (def.asset.height * k) / 2, 9);
      expect(n.rotation).toBe(0);
      expect(n.flipX).toBe(false);
      expect(n.id).toBe(`${def.id}-1`);
    }
  });
});

describe('decor unit (S decor drawn at L size)', () => {
  it('decorUnit is 2 for S decor and 1 for L decor', () => {
    expect(decorUnit(lib, 'confetti-S-01')).toBe(2);
    expect(decorUnit(lib, 'confetti-bold-S-03')).toBe(2);
    expect(decorUnit(lib, 'confetti-L-01')).toBe(1);
  });

  it('confetti-S at detail S gives the same centres (±1px) as confetti-L at detail L', () => {
    const it = intent(['phone', 'hero'], ['puzzle', 'support']);
    for (const f of [FORMATS.portrait, { width: 1600, height: 840 }]) {
      const L = composeScene(it, opts(f, 0, 'confetti-L'), lib);
      const S = composeScene(it, { ...opts(f, 0, 'confetti-L'), detail: 'S' }, lib);
      expect(S.backgroundPresetId).toBe('confetti-S');
      expect(S.globalScale).toBe(L.globalScale);
      const dl = L.nodes.filter((n) => n.ref.kind === 'decor');
      const ds = S.nodes.filter((n) => n.ref.kind === 'decor');
      expect(ds).toHaveLength(dl.length);
      dl.forEach((a, k) => {
        expect(Math.abs(ds[k]!.x - a.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(ds[k]!.y - a.y)).toBeLessThanOrEqual(1);
      });
    }
  });
});

describe('resolvePresetForDetail', () => {
  const m = lib.manifest;
  it('keeps a preset of the right size', () => {
    expect(resolvePresetForDetail('confetti-S', 'S', m)).toBe('confetti-S');
    expect(resolvePresetForDetail('corner-L', 'L', m)).toBe('corner-L');
  });
  it('switches to the same family of the other size', () => {
    expect(resolvePresetForDetail('confetti-L', 'S', m)).toBe('confetti-S');
    expect(resolvePresetForDetail('corner-S', 'L', m)).toBe('corner-L');
  });
  it('falls back to the first preset of that size (confetti-bold-S has no L)', () => {
    const firstL = m.backgrounds.find((b) => b.size === 'L')!.id;
    expect(resolvePresetForDetail('confetti-bold-S', 'L', m)).toBe(firstL);
    // "confetti-bold" must not be matched by the "confetti" family
    expect(resolvePresetForDetail('confetti-L', 'S', m)).not.toBe('confetti-bold-S');
  });
  it('null when the id is unknown or no preset of that size exists', () => {
    expect(resolvePresetForDetail('nope', 'L', m)).toBeNull();
    expect(
      resolvePresetForDetail('corner-L', 'S', {
        ...m,
        backgrounds: m.backgrounds.filter((b) => b.size === 'L'),
      }),
    ).toBeNull();
  });
});

describe('slots by size, support fit', () => {
  /** Rotated box fully inside the frame. */
  const fullyInside = (s: Scene, n: SceneNode) =>
    visibleFraction(box(s, n), n.rotation, s.format) >= 1 - 1e-6;

  it('phone + book + lamp: the book is the hero; supports inside, or ≥70 % under the floor', () => {
    const it = intent(['phone', 'hero'], ['book', 'support'], ['lamp', 'support']);
    for (const aspect of ['square', 'landscape', 'portrait'] as const) {
      const cands = templateCandidates(it, opts(FORMATS[aspect]), lib);
      expect(cands.length).toBeGreaterThan(0);
      cands.forEach((t, variant) => {
        const s = composeScene(it, opts(FORMATS[aspect], variant), lib);
        const items = itemNodes(s);
        const widest = items.reduce((a, b) => (box(s, b).w > box(s, a).w ? b : a));
        expect(itemOf(widest), `${aspect} ${variant}`).toBe('book');
        const floored = templateFit(t, it, lib) < FIT_FLOOR;
        for (const o of items) {
          if (o === widest) continue;
          const vis = visibleFraction(box(s, o), o.rotation, s.format);
          if (floored)
            expect(vis, `${aspect} ${variant} ${o.id}`).toBeGreaterThanOrEqual(0.7 - 1e-6);
          else expect(fullyInside(s, o), `${aspect} ${variant} ${o.id}`).toBe(true);
        }
      });
    }
  });

  it('the hero is the widest main item whatever order and roles the intent gives', () => {
    const orders: Array<Array<[ItemId, IntentItem['role']]>> = [
      [
        ['coin', 'hero'],
        ['folder', 'support'],
        ['pen', 'support'],
      ],
      [
        ['pen', 'support'],
        ['coin', 'support'],
        ['folder', 'hero'],
      ],
      [
        ['folder', 'support'],
        ['pen', 'hero'],
        ['coin', 'support'],
      ],
    ];
    const t0 = templateCandidates(intent(...orders[0]!), opts(FORMATS.square), lib);
    for (const o of orders) {
      const it = intent(...o);
      expect(templateCandidates(it, opts(FORMATS.square), lib)).toEqual(t0);
      for (let variant = 0; variant < t0.length; variant++) {
        const s = composeScene(it, opts(FORMATS.square, variant), lib);
        const t = t0[variant]!;
        const heroSlot = t.slots.find((sl) => sl.role === 'hero')!;
        const folder = s.nodes.find((n) => itemOf(n) === 'folder')!;
        // the folder sits on the hero slot (before the hero clamp moves it, if at all)
        const vis = visibleFraction(box(s, folder), folder.rotation, s.format);
        if (vis > 0.6) {
          expect(Math.abs(folder.x - heroSlot.cx * 1000)).toBeLessThanOrEqual(1);
          expect(Math.abs(folder.y - heroSlot.cy * 1000)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('background-state items take the backdrop role', () => {
    const it = intent(['vase', 'hero', 'background'], ['headphones', 'support']);
    const s = composeScene(it, opts(FORMATS.square), lib);
    expect(s.nodes.find((n) => itemOf(n) === 'vase')!.ref).toMatchObject({ state: 'background' });
    const t = templateCandidates(it, opts(FORMATS.square), lib)[0]!;
    expect(t.slots.map((x) => x.role).sort()).toEqual(['backdrop', 'hero']);
  });

  it('fit is 1 for source items; else it starts at the support fit (≥ 0.6) and only drops to settle', () => {
    const own = intent(['folder', 'hero'], ['wallet', 'support'], ['coin', 'support']);
    const tOwn = templateCandidates(own, opts(FORMATS.square), lib)[0]!;
    expect(templateFit(tOwn, own, lib)).toBe(1);
    const sOwn = composeScene(own, opts(FORMATS.square), lib);
    expect(sOwn.globalScale).toBeCloseTo((tOwn.scale * 1000) / tOwn.frame.width, 9);

    const big = intent(['book', 'hero'], ['lamp', 'support'], ['phone', 'support']);
    for (const [variant, c] of layoutCandidates(big, opts(FORMATS.square), lib).entries()) {
      const sup = c.template.slots
        .filter((sl) => sl.role === 'support')
        .map((sl) => nominal(sl.sourceItem).nominalWidth)
        .sort((a, b) => b - a);
      const raw = Math.min(
        1,
        (sup[0]! * 1.15) / nominal('lamp').nominalWidth,
        (sup[1]! * 1.15) / nominal('phone').nominalWidth,
      );
      expect(templateFit(c.template, big, lib)).toBeCloseTo(raw, 9);
      const start = Math.max(FIT_FLOOR, raw);
      expect(c.fit).toBeLessThanOrEqual(start + 1e-9);
      expect(c.fit).toBeGreaterThanOrEqual(SETTLE_FLOOR - 1e-9);
      // the ladder below the start fit
      expect(
        Math.abs(
          (start - c.fit) / SETTLE_SCALE_STEP - Math.round((start - c.fit) / SETTLE_SCALE_STEP),
        ),
      ).toBeLessThan(1e-6);
      const s = composeScene(big, opts(FORMATS.square, variant), lib);
      const base = (c.template.scale * 1000) / c.template.frame.width;
      expect(s.globalScale).toBeCloseTo(base * c.fit, 9);
    }
  });

  it('candidates: settled first, then the largest fit; ties keep the library order', () => {
    const intents = [
      intent(['book', 'hero'], ['lamp', 'support'], ['phone', 'support']),
      intent(['book', 'hero'], ['coin', 'support']),
      intent(['folder', 'hero'], ['wallet', 'support'], ['coin', 'support']),
    ];
    for (const it of intents)
      for (const aspect of ['square', 'landscape', 'portrait'] as const) {
        const cands = layoutCandidates(it, opts(FORMATS[aspect]), lib);
        const pool = selectTemplates(it, aspect, lib);
        for (let k = 1; k < cands.length; k++) {
          const [prev, cur] = [cands[k - 1]!, cands[k]!];
          expect(Number(cur.settled)).toBeLessThanOrEqual(Number(prev.settled));
          if (cur.settled === prev.settled && cur.settled) {
            expect(Math.round(cur.fit * 100)).toBeLessThanOrEqual(Math.round(prev.fit * 100));
            if (Math.round(cur.fit * 100) === Math.round(prev.fit * 100))
              expect(pool.indexOf(cur.template)).toBeGreaterThan(pool.indexOf(prev.template));
          }
        }
        // same set as the role filter, only reordered
        expect(cands.map((c) => c.template.id).sort()).toEqual(pool.map((t) => t.id).sort());
      }
  });

  it('«телефон, книга и лампа» square: book hero, phone and lamp whole, nothing collides', () => {
    const it = intent(['phone', 'support'], ['book', 'support'], ['lamp', 'support']);
    const s = composeScene(it, opts(FORMATS.square), lib);
    const items = itemNodes(s);
    const widest = items.reduce((a, b) => (box(s, b).w > box(s, a).w ? b : a));
    expect(itemOf(widest)).toBe('book');
    for (const o of items)
      if (o !== widest)
        expect(visibleFraction(box(s, o), o.rotation, s.format)).toBeGreaterThanOrEqual(
          HERO_MIN_VISIBLE_UPRIGHT - 1e-6,
        );
    expect(sceneCollisions(s, lib)).toEqual([]);
  });

  it('countTemplateCandidates matches what composeScene cycles through', () => {
    const it = intent(['phone', 'hero'], ['puzzle', 'support']);
    const n = countTemplateCandidates(it, FORMATS.square, lib);
    expect(n).toBe(selectTemplates(it, 'square', lib).length);
    expect(composeScene(it, opts(FORMATS.square, n), lib)).toEqual(
      composeScene(it, opts(FORMATS.square, 0), lib),
    );
  });
});

describe('decor depends only on the format', () => {
  it('decorScale = width / example frame width of the aspect', () => {
    expect(decorScale({ width: 1000, height: 1000 }, lib)).toBe(1);
    expect(decorScale({ width: 1200, height: 630 }, lib)).toBe(1);
    expect(decorScale({ width: 800, height: 1200 }, lib)).toBe(1);
    expect(decorScale({ width: 2400, height: 2400 }, lib)).toBe(2.4);
  });

  const decorGroups = (svg: string) =>
    svg.split(/\r?\n/).filter((l) => /<g id="[^"]+" data-decor=/.test(l));

  it('decor geometry is identical at gs 0.6 and gs 1 for the same format', () => {
    const it = intent(['phone', 'hero'], ['puzzle', 'support']);
    for (const [f, preset] of [
      [FORMATS.portrait, 'corner-L'],
      [FORMATS.square, 'confetti-L'],
      [FORMATS.landscape, 'confetti-S'],
    ] as const) {
      const base = composeScene(
        it,
        { ...opts(f, 0, preset), detail: preset.endsWith('S') ? 'S' : 'L' },
        lib,
      );
      const a = setGlobalScale(base, 0.6);
      const b = setGlobalScale(base, 1);
      const decor = (s: Scene) => s.nodes.filter((n) => n.ref.kind === 'decor');
      expect(decor(a).length).toBeGreaterThan(0);
      expect(decor(a)).toEqual(decor(b));
      expect(decorGroups(exportScene(a, lib))).toEqual(decorGroups(exportScene(b, lib)));
      // items still follow globalScale
      expect(a.nodes.filter((n) => n.ref.kind === 'item')).not.toEqual(
        b.nodes.filter((n) => n.ref.kind === 'item'),
      );
    }
  });

  it('a composition with a low fit keeps full-size decor', () => {
    const it = intent(['book', 'hero'], ['lamp', 'support'], ['phone', 'support']);
    const s = composeScene(it, opts(FORMATS.portrait, 0, 'corner-L'), lib);
    const preset = lib.manifest.backgrounds.find((b) => b.id === 'corner-L')!;
    expect(s.globalScale).toBeLessThan(1);
    expect(s.nodes.filter((n) => n.ref.kind === 'decor')).toEqual(
      placeDecor(preset, FORMATS.portrait, lib),
    );
  });
});
