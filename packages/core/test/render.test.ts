import { describe, expect, it } from 'vitest';
import { decorScale } from '../src/layout/frame';
import { getAsset } from '../src/library/load';
import type { AssetFile, DetailSize, ItemId } from '../src/library/types';
import { exportScene, validateScene } from '../src/render/export';
import { scopeIds } from '../src/render/ids';
import { nodeTransform, renderNodeInner } from '../src/render/node';
import { recolorMarkup } from '../src/render/recolor';
import { addItem, reorderNode, setSlotMap } from '../src/scene/ops';
import type { Scene, SceneNode } from '../src/scene/types';
import { loadRealLibrary, paletteById, readAsset } from './library';

const lib = loadRealLibrary();
const lilac = paletteById(lib, 'lilac');
const mint = paletteById(lib, 'mint');

const COLOR_ATTR = /(?<=\s)(?:fill|stroke|stop-color)="(#[0-9A-Fa-f]{6})"/g;
const colors = (m: string) => [...m.matchAll(COLOR_ATTR)].map((x) => x[1]!.toUpperCase());
const dList = (m: string) => [...m.matchAll(/(?<=\s)d="([^"]*)"/g)].map((x) => x[1]!).sort();
const elementCount = (m: string) => (m.match(/<[a-zA-Z]/g) ?? []).length;
const ids = (m: string) => [...m.matchAll(/(?<=\s)id="([^"]*)"/g)].map((x) => x[1]!);
const refs = (m: string) => [
  ...[...m.matchAll(/url\(#([^)]+)\)/g)].map((x) => x[1]!),
  ...[...m.matchAll(/(?<=\s)(?:xlink:)?href="#([^"]+)"/g)].map((x) => x[1]!),
];
const stripColors = (m: string) => m.replace(COLOR_ATTR, (s) => s.replace(/#[0-9A-Fa-f]{6}/, '#X'));

/** Markup of the `<g id="…">` element with that id, balanced over nested `<g>`. */
function groupById(svg: string, id: string): string {
  const start = svg.indexOf(`<g id="${id}"`);
  if (start < 0) throw new Error(`no group ${id}`);
  const re = /<g\b[^>]*?(\/?)>|<\/g>/g;
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(svg); m; m = re.exec(svg)) {
    if (m[0] === '</g>') depth--;
    else if (m[1] !== '/') depth++;
    if (depth === 0) return svg.slice(start, re.lastIndex);
  }
  throw new Error(`unbalanced group ${id}`);
}

/** Minimal well-formedness: balanced tags, quoted attributes, single root. */
function assertWellFormed(xml: string): void {
  const stack: string[] = [];
  let roots = 0;
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0;
  for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
    const between = xml.slice(last, m.index);
    expect(between, `stray markup before ${m[0]}`).not.toMatch(/[<>]/);
    last = tag.lastIndex;
    const [, close, name, , selfClose] = m;
    if (close) {
      expect(stack.pop(), `closing ${name}`).toBe(name);
    } else {
      if (stack.length === 0) roots++;
      if (!selfClose) stack.push(name!);
    }
  }
  expect(xml.slice(last)).not.toMatch(/[<>]/);
  expect(stack).toEqual([]);
  expect(roots).toBe(1);
}

function decorNode(decorId: string, n = 1, extra: Partial<SceneNode> = {}): SceneNode {
  return {
    id: `${decorId}-${n}`,
    ref: { kind: 'decor', decorId },
    x: 300,
    y: 200,
    rotation: 0,
    flipX: false,
    ...extra,
  };
}

function scene(detail: DetailSize = 'L'): Scene {
  return {
    format: { width: 1200, height: 630 },
    detail,
    palette: mint,
    backgroundPresetId: 'corner-L',
    globalScale: 0.5,
    nodes: [],
  };
}

const item = (id: ItemId, size: DetailSize = 'L', state: 'main' | 'background' = 'main') =>
  getAsset(lib, { kind: 'item', item: id, state }, size);

describe('recolorMarkup', () => {
  it('recolours phone L main from lilac to mint without touching geometry', () => {
    const asset = item('phone');
    const src = readAsset(asset.file);
    const out = recolorMarkup(src, asset, mint);
    const allowed = new Set([...Object.values(mint.slots), ...asset.pinned]);
    expect(colors(out).length).toBe(colors(src).length);
    for (const c of colors(out)) expect(allowed, c).toContain(c);
    expect(elementCount(out)).toBe(elementCount(src));
    expect(dList(out)).toEqual(dList(src));
    expect(stripColors(out)).toBe(stripColors(src));
  });

  it('slotMap {obj1:obj2, obj2:obj1} swaps exactly those two colours', () => {
    const asset = item('book');
    const src = readAsset(asset.file);
    const out = recolorMarkup(src, asset, lilac, { obj1: 'obj2', obj2: 'obj1' });
    const { obj1, obj2 } = lilac.slots;
    const swap = (c: string) => (c === obj1 ? obj2 : c === obj2 ? obj1 : c);
    const before = colors(src);
    expect(before).toContain(obj1);
    expect(before).toContain(obj2);
    expect(colors(out)).toEqual(before.map(swap));
    expect(stripColors(out)).toBe(stripColors(src));
  });

  it('leaves pinned and unknown colours alone and handles stroke / stop-color', () => {
    const asset: AssetFile = {
      file: 'x.svg',
      width: 10,
      height: 10,
      viewBox: '0 0 10 10',
      sourcePalette: 'lilac',
      colorMap: { '#181817': 'ink', '#F9ECB0': 'obj1' },
      pinned: ['#123456'],
    };
    const src =
      '<path d="M0 0" fill="#123456" stroke="#181817"/><stop stop-color="#f9ecb0"/>' +
      '<path d="M1 1" fill="#ABCDEF"/><rect fill="none"/>';
    expect(recolorMarkup(src, asset, mint)).toBe(
      '<path d="M0 0" fill="#123456" stroke="#181817"/><stop stop-color="#FFD4F2"/>' +
        '<path d="M1 1" fill="#ABCDEF"/><rect fill="none"/>',
    );
  });
});

describe('scopeIds', () => {
  it('suffixes ids and rewrites url(#) / href references to them only', () => {
    const src =
      '<g id="phone-L-main__a"><path id="phone-L-main__b" fill="url(#phone-L-main__g)"/>' +
      '<linearGradient id="phone-L-main__g"/><use href="#phone-L-main__b"/>' +
      '<use xlink:href="#phone-L-main__b"/><path clip-path="url(#elsewhere)"/></g>';
    expect(scopeIds(src, 'phone-2')).toBe(
      '<g id="phone-L-main__a--phone-2"><path id="phone-L-main__b--phone-2" fill="url(#phone-L-main__g--phone-2)"/>' +
        '<linearGradient id="phone-L-main__g--phone-2"/><use href="#phone-L-main__b--phone-2"/>' +
        '<use xlink:href="#phone-L-main__b--phone-2"/><path clip-path="url(#elsewhere)"/></g>',
    );
  });
});

describe('nodeTransform', () => {
  const node: SceneNode = {
    id: 'phone-1',
    ref: { kind: 'item', item: 'phone', state: 'main' },
    x: 600,
    y: 300,
    rotation: 15,
    flipX: true,
  };

  it('centres the asset, rotates and flips at nominal size', () => {
    expect(nodeTransform(node, item('phone'), 797, 1)).toBe(
      'translate(600 300) rotate(15) scale(-1, 1) translate(-398.5 -231)',
    );
  });

  it('scales the S variant up to the nominal width', () => {
    const s = item('phone', 'S');
    const k = (797 * 0.5) / 399;
    expect(nodeTransform({ ...node, flipX: false }, s, 797, 0.5)).toBe(
      `translate(600 300) rotate(15) scale(${+k.toFixed(4)}, ${+k.toFixed(4)}) translate(-199.5 -115.5)`,
    );
  });
});

describe('decor scale', () => {
  const scaleOf = (svg: string, id: string) => {
    const m = new RegExp(
      String.raw`<g id="${id}"[^>]*transform="[^"]*scale\(([-\d.]+), ([-\d.]+)\)`,
    ).exec(svg);
    if (!m) throw new Error(`no transform for ${id}`);
    return [Number(m[1]), Number(m[2])];
  };

  it('S decor renders at 2 × decorScale, L decor at decorScale, whatever globalScale', () => {
    const s: Scene = {
      ...scene('S'),
      format: { width: 1800, height: 945 },
      globalScale: 0.75,
      nodes: [decorNode('confetti-S-01'), decorNode('confetti-L-01')],
    };
    const ds = decorScale(s.format, lib);
    expect(ds).toBeCloseTo(1.5, 9);
    const svg = exportScene(s, lib);
    expect(scaleOf(svg, 'confetti-S-01-1')).toEqual([2 * ds, 2 * ds]);
    expect(scaleOf(svg, 'confetti-L-01-1')).toEqual([ds, ds]);
  });
});

describe('renderNodeInner', () => {
  it('returns recoloured, scoped inner markup without the root <svg>', () => {
    const s = addItem(scene(), 'phone', 'main');
    const inner = renderNodeInner(s.nodes[0]!, s, lib);
    expect(inner).not.toMatch(/<svg|<\/svg>/);
    expect(ids(inner).length).toBeGreaterThan(0);
    for (const id of ids(inner)) expect(id.endsWith('--phone-1')).toBe(true);
    // the root fill="none" must still apply to the content
    expect(inner).toMatch(/^<g fill="none">/);
    expect(dList(inner)).toEqual(dList(readAsset(item('phone').file)));
  });

  it('clips decor to its own viewBox with a node-scoped clipPath', () => {
    const s = { ...scene(), nodes: [decorNode('corner-L-01')] };
    const inner = renderNodeInner(s.nodes[0]!, s, lib);
    expect(inner).toContain(
      '<clipPath id="corner-L-01-1__clip"><rect width="530" height="262"/></clipPath>',
    );
    expect(inner).toContain('clip-path="url(#corner-L-01-1__clip)"');
  });

  it('renders an unknown decor as empty markup instead of throwing', () => {
    const s = { ...scene(), nodes: [decorNode('confetti-bold-L-01')] };
    expect(renderNodeInner(s.nodes[0]!, s, lib)).toBe('');
  });
});

function richScene(detail: DetailSize = 'L'): Scene {
  let s = scene(detail);
  s = { ...s, nodes: [decorNode('corner-L-01'), decorNode('confetti-L-02', 1, { rotation: 30 })] };
  s = addItem(s, 'phone', 'main', { x: 400, y: 300 });
  s = addItem(s, 'phone', 'main', { x: 800, y: 300 });
  s = addItem(s, 'book', 'background', { x: 200, y: 500 });
  s = setSlotMap(s, 'phone-2', { obj1: 'obj2' });
  return s;
}

describe('exportScene', () => {
  it('ids are unique and every reference resolves within its node group', () => {
    const svg = exportScene(richScene(), lib);
    const all = ids(svg);
    expect(new Set(all).size).toBe(all.length);
    for (const nodeId of ['phone-1', 'phone-2', 'corner-L-01-1', 'confetti-L-02-1']) {
      const g = groupById(svg, nodeId);
      const local = new Set(ids(g));
      for (const r of refs(g)) expect(local, `${nodeId} -> #${r}`).toContain(r);
    }
    // the decor clip references are real references that must resolve locally
    expect(refs(groupById(svg, 'corner-L-01-1')).length).toBeGreaterThan(0);
  });

  it('produces a Figma-compatible document', () => {
    const svg = exportScene(richScene(), lib);
    for (const bad of ['var(', '<style', '<image', '<foreignObject', 'filter=']) {
      expect(svg).not.toContain(bad);
    }
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200" height="630" viewBox="0 0 1200 630">/,
    );
    expect(svg).toContain('<clipPath id="frame"><rect width="1200" height="630"/></clipPath>');
    const clipped = groupById(
      svg.replace('<g clip-path="url(#frame)">', '<g id="__frame">'),
      '__frame',
    );
    for (const id of ['background', 'phone-1', 'phone-2', 'book-1']) {
      expect(clipped).toContain(`<g id="${id}"`);
    }
    // background first: bg1 rect, then decor; then items in scene order
    const bg = groupById(svg, 'background');
    expect(bg).toMatch(/^<g id="background">\s*<rect width="1200" height="630" fill="#BEEBEB"\/>/);
    expect(bg).toContain('<g id="corner-L-01-1"');
    expect(bg).toContain('<g id="confetti-L-02-1"');
    expect(bg).not.toContain('data-item');
    const order = ['background', 'phone-1', 'phone-2', 'book-1'].map((id) =>
      svg.indexOf(`<g id="${id}"`),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(svg).toContain('<g id="phone-1" data-item="phone" data-state="main" transform="');
    expect(svg).toContain('<g id="book-1" data-item="book" data-state="background" transform="');
    assertWellFormed(svg);
  });

  it.each(['L', 'S'] as const)(
    'path invariant (%s): each node keeps its asset d multiset',
    (detail) => {
      const s = richScene(detail);
      const svg = exportScene(s, lib);
      for (const node of s.nodes) {
        const asset = getAsset(lib, node.ref, detail);
        const src = dList(readAsset(asset.file));
        expect(src.length).toBeGreaterThan(0);
        expect(dList(groupById(svg, node.id)), node.id).toEqual(src);
      }
      // nothing but those nodes carries geometry
      const total = s.nodes.reduce(
        (n, node) => n + dList(readAsset(getAsset(lib, node.ref, detail).file)).length,
        0,
      );
      expect(dList(svg).length).toBe(total);
    },
  );

  it('applies the slotMap only to its own node', () => {
    const svg = exportScene(richScene(), lib);
    const p1 = colors(groupById(svg, 'phone-1'));
    const p2 = colors(groupById(svg, 'phone-2'));
    expect(p1).toContain(mint.slots.obj1);
    expect(p2).not.toContain(mint.slots.obj1);
    expect(p2).toEqual(p1.map((c) => (c === mint.slots.obj1 ? mint.slots.obj2 : c)));
  });

  it('emits a decor raised above an item in place, keeping the editor z-order', () => {
    const s = reorderNode(richScene(), 'confetti-L-02-1', 'top');
    const svg = exportScene(s, lib);
    const order = s.nodes.map((n) => svg.indexOf(`<g id="${n.id}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const bg = groupById(svg, 'background');
    expect(bg).toContain('<g id="corner-L-01-1"');
    expect(bg).not.toContain('confetti-L-02-1');
    expect(groupById(svg, 'confetti-L-02-1')).toContain('data-decor="confetti-L-02"');
    assertWellFormed(svg);
  });

  it('keeps decor between items out of the background group', () => {
    const base = richScene();
    const [corner, confetti, ...items] = base.nodes;
    const s = { ...base, nodes: [corner!, items[0]!, confetti!, ...items.slice(1)] };
    const svg = exportScene(s, lib);
    expect(groupById(svg, 'background')).not.toContain('confetti-L-02-1');
    const order = s.nodes.map((n) => svg.indexOf(`<g id="${n.id}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('skips an unknown decor instead of crashing', () => {
    const s = { ...richScene(), nodes: [decorNode('confetti-bold-L-01'), ...richScene().nodes] };
    const svg = exportScene(s, lib);
    expect(svg).not.toContain('confetti-bold-L-01-1');
    assertWellFormed(svg);
  });
});

describe('validateScene', () => {
  it('flags a background-state node whose slotMap maps into obj1', () => {
    let s = addItem(scene(), 'phone', 'background');
    s = addItem(s, 'book', 'main');
    s = setSlotMap(s, 'phone-1', { obj2: 'obj1' });
    s = setSlotMap(s, 'book-1', { obj1: 'obj2' });
    expect(validateScene(s, lib)).toEqual([
      { nodeId: 'phone-1', rule: 'object-color-in-background' },
    ]);
  });

  it('flags decor with an object slotMap and unknown assets', () => {
    const s = {
      ...scene(),
      nodes: [
        decorNode('corner-L-01', 1, { slotMap: { obj1: 'obj3' } }),
        decorNode('confetti-bold-L-01'),
      ],
    };
    expect(validateScene(s, lib)).toEqual([
      { nodeId: 'corner-L-01-1', rule: 'object-color-in-background' },
      { nodeId: 'confetti-bold-L-01-1', rule: 'unknown-asset' },
    ]);
  });

  it('a clean scene has no violations', () => {
    expect(validateScene(richScene(), lib)).toEqual([]);
  });
});
