import { describe, expect, it } from 'vitest';
import { createLibrary, getAsset } from '../src/library/load';
import type { AssetFile, LibraryManifest } from '../src/library/types';
import { setDetail } from '../src/scene/detail';
import {
  canRedo,
  canUndo,
  createHistory,
  push,
  redo,
  undo,
  HISTORY_LIMIT,
} from '../src/scene/history';
import { addItem, rotateNode, setSlotMap } from '../src/scene/ops';
import type { Scene } from '../src/scene/types';
import { emptyScene } from './fixtures';

const asset = (file: string): AssetFile => ({
  file,
  width: 10,
  height: 10,
  viewBox: '0 0 10 10',
  sourcePalette: 'p1',
  colorMap: {},
  pinned: [],
});

const manifest: LibraryManifest = {
  version: 1,
  figmaFileKey: 'k',
  syncedAt: '2026-01-01T00:00:00Z',
  items: [
    {
      id: 'phone',
      label: 'Phone',
      nominalWidth: 300,
      nominalHeight: 500,
      stacking: 'flat',
      variants: {
        L: { main: asset('L/phone.main.svg'), background: asset('L/phone.bg.svg') },
        S: { main: asset('S/phone.main.svg'), background: asset('S/phone.bg.svg') },
      },
    },
  ],
  decor: [
    {
      id: 'd1',
      preset: 'pr',
      size: 'L',
      asset: asset('L/d1.svg'),
      anchor: { corner: 'tl', dx: 0, dy: 0 },
    },
  ],
  backgrounds: [],
};
const lib = createLibrary(manifest, [], [], (f) => `<svg data-f="${f}"/>`);

function threeNodeScene(): Scene {
  let s = emptyScene();
  s = addItem(s, 'phone', 'main', { x: 100, y: 200 });
  s = addItem(s, 'phone', 'background', { x: 300, y: 400 });
  s = addItem(s, 'phone', 'main', { x: 700, y: 800 });
  s = rotateNode(s, 'phone-1', 33);
  s = rotateNode(s, 'phone-3', -15);
  s = setSlotMap(s, 'phone-2', { obj1: 'obj3', obj3: 'obj1' });
  return s;
}

describe('setDetail', () => {
  it('changes only scene.detail and round-trips', () => {
    const s = threeNodeScene();
    const small = setDetail(s, 'S');
    expect(small.detail).toBe('S');
    expect(small.nodes).toEqual(s.nodes);
    expect(small.globalScale).toBe(s.globalScale);
    expect(setDetail(small, 'L')).toEqual(s);
  });
});

describe('library', () => {
  it('returns assets for items and decor', () => {
    expect(getAsset(lib, { kind: 'item', item: 'phone', state: 'background' }, 'S').file).toBe(
      'S/phone.bg.svg',
    );
    expect(getAsset(lib, { kind: 'decor', decorId: 'd1' }, 'L').file).toBe('L/d1.svg');
    expect(lib.markup('x')).toBe('<svg data-f="x"/>');
  });
  it('throws on unknown refs', () => {
    expect(() => getAsset(lib, { kind: 'item', item: 'book', state: 'main' }, 'L')).toThrow();
    expect(() => getAsset(lib, { kind: 'decor', decorId: 'zz' }, 'L')).toThrow();
  });
});

describe('history', () => {
  const s0 = emptyScene();
  const s1 = addItem(s0, 'book', 'main');
  const s2 = addItem(s1, 'pen', 'main');
  const s3 = addItem(s2, 'coin', 'main');

  it('3 push, 2 undo, 1 redo lands on the second state', () => {
    let h = createHistory(s0);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    h = push(push(push(h, s1), s2), s3);
    h = undo(undo(h));
    expect(h.present).toBe(s1);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(s2);
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(true);
  });
  it('push after undo drops the redo branch', () => {
    let h = push(push(createHistory(s0), s1), s2);
    h = push(undo(h), s3);
    expect(h.present).toBe(s3);
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe(s1);
  });
  it('undo/redo at the ends return the same history', () => {
    const h = createHistory(s0);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
  it('ignores pushing the identical present', () => {
    const h = createHistory(s0);
    expect(push(h, s0)).toBe(h);
  });
  it('keeps at most 100 undo steps', () => {
    let h = createHistory(s0);
    let s = s0;
    for (let i = 0; i < 150; i++) {
      s = { ...s, globalScale: 1 + i / 1000 };
      h = push(h, s);
    }
    expect(h.past.length).toBe(HISTORY_LIMIT);
    for (let i = 0; i < 200; i++) h = undo(h);
    expect(h.present.globalScale).toBeCloseTo(1 + 49 / 1000);
  });
});
