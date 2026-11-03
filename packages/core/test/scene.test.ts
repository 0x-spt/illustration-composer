import { describe, expect, it } from 'vitest';
import { refWidth } from '../src/layout/frame';
import {
  addItem,
  duplicateNode,
  flipNode,
  moveNode,
  removeNode,
  reorderNode,
  rotateNode,
  setBackground,
  setFormat,
  setGlobalScale,
  setNodeState,
  setPalette,
  setSlotMap,
  MAX_SCALE,
  MIN_SCALE,
} from '../src/scene/ops';
import type { Scene } from '../src/scene/types';
import { emptyScene, palette } from './fixtures';
import { loadRealLibrary } from './library';

const ids = (s: { nodes: { id: string }[] }) => s.nodes.map((n) => n.id);

describe('addItem', () => {
  it('adds at the frame centre with generated id', () => {
    const s = addItem(emptyScene(), 'phone', 'main');
    expect(s.nodes).toEqual([
      {
        id: 'phone-1',
        ref: { kind: 'item', item: 'phone', state: 'main' },
        x: 500,
        y: 500,
        rotation: 0,
        flipX: false,
      },
    ]);
  });
  it('uses the given position and the smallest free number', () => {
    let s = addItem(emptyScene(), 'phone', 'main');
    s = addItem(s, 'phone', 'main');
    s = addItem(s, 'phone', 'background', { x: 10, y: 20 });
    expect(ids(s)).toEqual(['phone-1', 'phone-2', 'phone-3']);
    s = removeNode(s, 'phone-2');
    s = addItem(s, 'phone', 'main');
    expect(ids(s)).toEqual(['phone-1', 'phone-3', 'phone-2']);
    expect(s.nodes[1]).toMatchObject({ x: 10, y: 20 });
  });
});

describe('move / rotate / flip', () => {
  const base = addItem(emptyScene(), 'book', 'main');
  it('moves a node', () => {
    expect(moveNode(base, 'book-1', 3, 4).nodes[0]).toMatchObject({ x: 3, y: 4 });
  });
  it('normalizes rotation into [0,360)', () => {
    expect(rotateNode(base, 'book-1', -90).nodes[0]!.rotation).toBe(270);
    expect(rotateNode(base, 'book-1', 450).nodes[0]!.rotation).toBe(90);
    expect(rotateNode(base, 'book-1', 360).nodes[0]!.rotation).toBe(0);
  });
  it('flips and flips back', () => {
    const f = flipNode(base, 'book-1');
    expect(f.nodes[0]!.flipX).toBe(true);
    expect(flipNode(f, 'book-1')).toEqual(base);
  });
  it('returns the same reference for an unknown id', () => {
    expect(moveNode(base, 'nope', 1, 1)).toBe(base);
    expect(rotateNode(base, 'nope', 1)).toBe(base);
    expect(flipNode(base, 'nope')).toBe(base);
    expect(duplicateNode(base, 'nope')).toBe(base);
    expect(reorderNode(base, 'nope', 'top')).toBe(base);
    expect(setNodeState(base, 'nope', 'background')).toBe(base);
    expect(setSlotMap(base, 'nope', { obj1: 'obj2' })).toBe(base);
  });
  it('does not mutate the input', () => {
    const snap = structuredClone(base);
    moveNode(base, 'book-1', 9, 9);
    expect(base).toEqual(snap);
  });
});

describe('duplicateNode', () => {
  it('inserts phone-2 right above phone-1 offset by 24px', () => {
    let s = addItem(emptyScene(), 'phone', 'main', { x: 100, y: 200 });
    s = addItem(s, 'book', 'main');
    s = setSlotMap(s, 'phone-1', { obj1: 'obj3' });
    s = duplicateNode(s, 'phone-1');
    expect(ids(s)).toEqual(['phone-1', 'phone-2', 'book-1']);
    expect(s.nodes[1]).toMatchObject({ x: 124, y: 224, slotMap: { obj1: 'obj3' } });
    expect(s.nodes[1]!.slotMap).not.toBe(s.nodes[0]!.slotMap);
  });
});

describe('removeNode', () => {
  it('removes a node', () => {
    const s = addItem(emptyScene(), 'coin', 'main');
    expect(removeNode(s, 'coin-1').nodes).toEqual([]);
  });
  it('returns the same reference for a missing id', () => {
    const s = addItem(emptyScene(), 'coin', 'main');
    expect(removeNode(s, 'nope')).toBe(s);
  });
});

describe('reorderNode', () => {
  let s = emptyScene();
  for (const it of ['book', 'phone', 'coin', 'pen'] as const) s = addItem(s, it, 'main');
  it('top moves to the end', () => {
    expect(ids(reorderNode(s, 'book-1', 'top'))).toEqual(['phone-1', 'coin-1', 'pen-1', 'book-1']);
  });
  it('bottom moves to the start', () => {
    expect(ids(reorderNode(s, 'pen-1', 'bottom'))).toEqual([
      'pen-1',
      'book-1',
      'phone-1',
      'coin-1',
    ]);
  });
  it('up and down move one step', () => {
    expect(ids(reorderNode(s, 'phone-1', 'up'))).toEqual(['book-1', 'coin-1', 'phone-1', 'pen-1']);
    expect(ids(reorderNode(s, 'phone-1', 'down'))).toEqual([
      'phone-1',
      'book-1',
      'coin-1',
      'pen-1',
    ]);
  });
  it('is a no-op at the edges', () => {
    expect(reorderNode(s, 'pen-1', 'up')).toBe(s);
    expect(reorderNode(s, 'book-1', 'down')).toBe(s);
  });
});

describe('setNodeState / setSlotMap', () => {
  it('changes the state', () => {
    const s = addItem(emptyScene(), 'lamp', 'main');
    expect(setNodeState(s, 'lamp-1', 'background').nodes[0]!.ref).toEqual({
      kind: 'item',
      item: 'lamp',
      state: 'background',
    });
  });
  it('sets and clears the slot map', () => {
    const s = addItem(emptyScene(), 'lamp', 'main');
    const m = setSlotMap(s, 'lamp-1', { obj1: 'obj2', obj2: 'obj1' });
    expect(m.nodes[0]!.slotMap).toEqual({ obj1: 'obj2', obj2: 'obj1' });
    expect(setSlotMap(m, 'lamp-1', {})).toEqual(s);
    expect('slotMap' in setSlotMap(m, 'lamp-1', undefined).nodes[0]!).toBe(false);
  });
});

describe('setGlobalScale', () => {
  it('keeps a centred node and moves a corner node about the centre', () => {
    let s = addItem(emptyScene(), 'vase', 'main');
    s = addItem(s, 'pen', 'main', { x: 0, y: 0 });
    const t = setGlobalScale(s, 2);
    expect(t.globalScale).toBe(2);
    expect(t.nodes[0]).toMatchObject({ x: 500, y: 500 });
    expect(t.nodes[1]).toMatchObject({ x: -500, y: -500 });
  });
  it('is relative to the current scale', () => {
    let s = addItem(emptyScene(), 'pen', 'main', { x: 0, y: 0 });
    s = setGlobalScale(setGlobalScale(s, 2), 1);
    expect(s.nodes[0]).toMatchObject({ x: 0, y: 0 });
  });
  it('clamps to [0.1, 4]', () => {
    const s = emptyScene();
    expect(setGlobalScale(s, 10).globalScale).toBe(4);
    expect(setGlobalScale(s, 0).globalScale).toBe(0.1);
  });
  it('returns the same reference when nothing changes', () => {
    const s = emptyScene();
    expect(setGlobalScale(s, 1)).toBe(s);
  });
  it('leaves decor nodes untouched: decor follows the format, not globalScale', () => {
    const decor = {
      id: 'corner-L-01-1',
      ref: { kind: 'decor' as const, decorId: 'corner-L-01' },
      x: 10,
      y: 20,
      rotation: 0,
      flipX: false,
    };
    const s = { ...addItem(emptyScene(), 'pen', 'main', { x: 0, y: 0 }) };
    const withDecor = { ...s, nodes: [decor, ...s.nodes] };
    const t = setGlobalScale(withDecor, 2);
    expect(t.nodes[0]).toBe(decor);
    expect(t.nodes[1]).toMatchObject({ x: -500, y: -500 });
  });
});

describe('no-op edits return the same scene', () => {
  const base = () =>
    setSlotMap(addItem(emptyScene(), 'phone', 'main'), 'phone-1', { obj1: 'obj2' });

  it('node ops that change nothing', () => {
    const s = base();
    const n = s.nodes[0]!;
    expect(moveNode(s, 'phone-1', n.x, n.y)).toBe(s);
    expect(rotateNode(s, 'phone-1', 360)).toBe(s);
    expect(setNodeState(s, 'phone-1', 'main')).toBe(s);
    expect(moveNode(s, 'missing', 1, 1)).toBe(s);
  });

  it('setSlotMap with an equal map, or clearing an absent one', () => {
    const s = base();
    expect(setSlotMap(s, 'phone-1', { obj1: 'obj2' })).toBe(s);
    const plain = addItem(emptyScene(), 'phone', 'main');
    expect(setSlotMap(plain, 'phone-1', undefined)).toBe(plain);
    expect(setSlotMap(plain, 'phone-1', {})).toBe(plain);
  });

  it('a real change still produces a new scene', () => {
    const s = base();
    expect(setSlotMap(s, 'phone-1', { obj1: 'obj3' })).not.toBe(s);
    expect(setSlotMap(s, 'phone-1', undefined).nodes[0]).not.toHaveProperty('slotMap');
    expect(moveNode(s, 'phone-1', 1, 2)).not.toBe(s);
  });
});

describe('setFormat', () => {
  const lib = loadRealLibrary();
  /** «Масштаб сцены» in %: globalScale relative to the example frame of the format's aspect. */
  const relative = (t: Scene) => (t.globalScale * refWidth(t.format, lib)) / t.format.width;

  it('carries centres proportionally', () => {
    const s = addItem(emptyScene(), 'wallet', 'main', { x: 250, y: 750 });
    const t = setFormat(s, { width: 1200, height: 630 }, lib);
    expect(t.format).toEqual({ width: 1200, height: 630 });
    expect(t.nodes[0]).toMatchObject({ x: 300, y: 472.5 });
  });

  it('keeps the relative scale across formats', () => {
    let s: Scene = { ...addItem(emptyScene(), 'wallet', 'main'), globalScale: 0.8 };
    const start = relative(s);
    for (const f of [
      { width: 1200, height: 630 },
      { width: 800, height: 1200 },
      { width: 2400, height: 2400 },
      { width: 1000, height: 1000 },
    ]) {
      s = setFormat(s, f, lib);
      expect(relative(s), `${f.width}×${f.height}`).toBeCloseTo(start, 9);
    }
    expect(s.globalScale).toBeCloseTo(0.8, 9);
  });

  it('scales items with the frame when the designed width changes', () => {
    const t = setFormat({ ...emptyScene(), globalScale: 1 }, { width: 2000, height: 2000 }, lib);
    expect(t.globalScale).toBeCloseTo(2, 9);
  });

  it('clamps the scale to the slider range', () => {
    const big = setFormat({ ...emptyScene(), globalScale: 3 }, { width: 4000, height: 4000 }, lib);
    expect(big.globalScale).toBe(MAX_SCALE);
    const small = setFormat(
      { ...emptyScene(), globalScale: 0.2 },
      { width: 200, height: 200 },
      lib,
    );
    expect(small.globalScale).toBe(MIN_SCALE);
  });

  it('uses the default reference width without a library', () => {
    const t = setFormat(emptyScene(), { width: 1200, height: 630 }, null);
    expect(t.globalScale).toBeCloseTo(1.2, 9);
  });
});

describe('setPalette / setBackground', () => {
  it('sets the palette and background', () => {
    const p = { ...palette, id: 'p2' };
    expect(setPalette(emptyScene(), p).palette).toBe(p);
    expect(setBackground(emptyScene(), 'bg-a').backgroundPresetId).toBe('bg-a');
    expect(setBackground(setBackground(emptyScene(), 'bg-a'), null).backgroundPresetId).toBeNull();
  });
});
