import { readFileSync } from 'node:fs';
import rawManifest from '@ic/library/data/manifest.json';
import rawMasks from '@ic/library/data/masks.json';
import rawPalettes from '@ic/library/data/palettes.json';
import rawTemplates from '@ic/library/data/templates.json';
import {
  composeScene,
  createLibrary,
  type AssetMask,
  type CompositionIntent,
  type Format,
  type LayoutTemplate,
  type LibraryManifest,
  type LoadedLibrary,
  type Palette,
} from '@ic/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { nodeFrame, frameCorners } from './selectors';
import { scaleView } from './scale';
import { DEFAULT_FORMAT, DEFAULT_SCALE, createInitialScene, decorEdited, useEditor } from './store';

const libraryRoot = new URL('../../../../packages/library/', import.meta.url);

function realLibrary(): LoadedLibrary {
  return createLibrary(
    rawManifest as unknown as LibraryManifest,
    rawPalettes as unknown as Palette[],
    rawTemplates as unknown as LayoutTemplate[],
    (file) => readFileSync(new URL(file, libraryRoot), 'utf8'),
    rawMasks as Record<string, AssetMask>,
  );
}

const lib = realLibrary();
const scene = () => useEditor.getState().history.present;
const editor = () => useEditor.getState();

beforeEach(() => {
  useEditor.setState({
    history: { past: [], present: createInitialScene(lib.palettes[0]!), future: [] },
    selectedId: null,
    library: lib,
    gestureBase: null,
    composition: null,
  });
});

describe('drag gesture', () => {
  it('a series of commit:false moves plus one commit:true is one history entry', () => {
    editor().add('book', 'main');
    const id = editor().selectedId!;
    const before = scene().nodes[0]!;
    const pastLen = editor().history.past.length;

    editor().move(id, before.x + 5, before.y + 5, { commit: false });
    editor().move(id, before.x + 10, before.y + 12, { commit: false });
    editor().move(id, before.x + 20, before.y + 30, { commit: false });
    expect(editor().history.past.length).toBe(pastLen);
    expect(scene().nodes[0]!.x).toBe(before.x + 20);

    editor().move(id, before.x + 25, before.y + 31, { commit: true });
    expect(editor().history.past.length).toBe(pastLen + 1);
    expect(scene().nodes[0]).toMatchObject({ x: before.x + 25, y: before.y + 31 });

    editor().undo();
    expect(scene().nodes[0]).toMatchObject({ x: before.x, y: before.y });
    editor().redo();
    expect(scene().nodes[0]).toMatchObject({ x: before.x + 25, y: before.y + 31 });
  });

  it('a rotate gesture is one history entry too', () => {
    editor().add('coin', 'main');
    const id = editor().selectedId!;
    const pastLen = editor().history.past.length;
    editor().rotate(id, 10, { commit: false });
    editor().rotate(id, 40, { commit: false });
    editor().rotate(id, 45, { commit: true });
    expect(editor().history.past.length).toBe(pastLen + 1);
    editor().undo();
    expect(scene().nodes[0]!.rotation).toBe(0);
  });

  it('a gesture that ends where it started records nothing', () => {
    editor().add('book', 'main');
    const id = editor().selectedId!;
    const start = scene().nodes[0]!;
    const pastLen = editor().history.past.length;
    editor().move(id, start.x + 40, start.y, { commit: false });
    editor().move(id, start.x, start.y, { commit: true });
    expect(editor().history.past.length).toBe(pastLen);
    expect(editor().gestureBase).toBeNull();
    editor().rotate(id, 30, { commit: false });
    editor().rotate(id, 0, { commit: false });
    editor().endGesture();
    expect(editor().history.past.length).toBe(pastLen);
  });

  it('endGesture commits a running gesture as one step', () => {
    editor().add('book', 'main');
    const id = editor().selectedId!;
    const start = scene().nodes[0]!;
    const pastLen = editor().history.past.length;
    editor().move(id, start.x + 1, start.y, { commit: false });
    editor().move(id, start.x + 2, start.y, { commit: false });
    editor().endGesture();
    expect(editor().history.past.length).toBe(pastLen + 1);
    expect(editor().gestureBase).toBeNull();
    editor().endGesture();
    expect(editor().history.past.length).toBe(pastLen + 1);
    editor().undo();
    expect(scene().nodes[0]!.x).toBe(start.x);
  });

  it('move without options commits a step', () => {
    editor().add('pen', 'main');
    const id = editor().selectedId!;
    const pastLen = editor().history.past.length;
    editor().move(id, 1, 2);
    editor().move(id, 3, 4);
    expect(editor().history.past.length).toBe(pastLen + 2);
  });
});

describe('selection', () => {
  it('add selects the new node', () => {
    editor().add('phone', 'main');
    expect(editor().selectedId).toBe(scene().nodes[0]!.id);
  });

  it('duplicate selects the copy', () => {
    editor().add('book', 'main');
    const id = editor().selectedId!;
    editor().duplicate(id);
    expect(scene().nodes).toHaveLength(2);
    expect(editor().selectedId).toBe(scene().nodes[1]!.id);
    expect(editor().selectedId).not.toBe(id);
  });

  it('remove clears the selection of the removed node', () => {
    editor().add('book', 'main');
    editor().remove(editor().selectedId!);
    expect(scene().nodes).toHaveLength(0);
    expect(editor().selectedId).toBeNull();
  });

  it('undo drops a selection that no longer exists', () => {
    editor().add('book', 'main');
    editor().undo();
    expect(editor().selectedId).toBeNull();
  });

  it('reorder, flip and setState go through history', () => {
    editor().add('book', 'main');
    editor().add('coin', 'main');
    const coin = editor().selectedId!;
    editor().reorder(coin, 'down');
    expect(scene().nodes[0]!.id).toBe(coin);
    editor().flip(coin);
    expect(scene().nodes[0]!.flipX).toBe(true);
    editor().setState(coin, 'background');
    expect(scene().nodes[0]!.ref).toMatchObject({ state: 'background' });
    editor().undo();
    editor().undo();
    editor().undo();
    expect(scene().nodes[1]!.id).toBe(coin);
  });
});

describe('background', () => {
  it('setBackground places the preset decor under the items, null removes it', () => {
    editor().add('book', 'main');
    editor().setBackground('corner-L');
    const nodes = scene().nodes;
    expect(scene().backgroundPresetId).toBe('corner-L');
    expect(nodes.slice(0, 3).every((n) => n.ref.kind === 'decor')).toBe(true);
    expect(nodes[3]!.ref).toMatchObject({ kind: 'item', item: 'book' });
    editor().setBackground(null);
    expect(scene().nodes.map((n) => n.ref.kind)).toEqual(['item']);
  });
});

describe('nodeFrame', () => {
  it('is nominalWidth × globalScale wide with the asset aspect, centred on the node', () => {
    editor().add('book', 'main');
    const s = scene();
    const node = s.nodes[0]!;
    const f = nodeFrame(node, s, lib)!;
    const def = lib.manifest.items.find((i) => i.id === 'book')!;
    const asset = def.variants.L.main;
    expect(f.w).toBeCloseTo(def.nominalWidth * s.globalScale);
    expect(f.h).toBeCloseTo((f.w * asset.height) / asset.width);
    expect(f).toMatchObject({ cx: node.x, cy: node.y, rotation: 0 });
  });

  it('corners rotate about the centre', () => {
    const c = frameCorners({ cx: 0, cy: 0, w: 4, h: 2, rotation: 90 });
    expect(c[0]!.x).toBeCloseTo(1);
    expect(c[0]!.y).toBeCloseTo(-2);
  });
});

describe('layers: moveTo', () => {
  it('moves a node to a z-index in one history step', () => {
    editor().add('book', 'main');
    editor().add('vase', 'main');
    editor().add('coin', 'main');
    const steps = editor().history.past.length;
    editor().moveTo('coin-1', 0);
    expect(scene().nodes.map((n) => n.id)).toEqual(['coin-1', 'book-1', 'vase-1']);
    expect(editor().history.past.length).toBe(steps + 1);
    editor().moveTo('coin-1', 0);
    expect(editor().history.past.length).toBe(steps + 1);
    editor().moveTo('book-1', 99);
    expect(scene().nodes.map((n) => n.id)).toEqual(['coin-1', 'vase-1', 'book-1']);
  });
});

describe('palette guard', () => {
  it('ignores a palette whose slots are not plain hex', () => {
    const before = scene().palette;
    const evil = { ...before, id: 'x', slots: { ...before.slots, obj1: '#fff" onload="x' } };
    editor().setPalette(evil);
    expect(scene().palette).toBe(before);
    editor().setPalette(lib.palettes[2]!);
    expect(scene().palette.id).toBe('mint');
  });
});

describe('decorEdited', () => {
  it('is true only when decor differs from a fresh layout of the preset', () => {
    editor().add('book', 'main');
    expect(decorEdited(scene(), lib)).toBe(false);
    editor().setBackground('corner-L');
    expect(decorEdited(scene(), lib)).toBe(false);
    const decor = scene().nodes[0]!;
    editor().move(decor.id, decor.x + 40, decor.y);
    expect(decorEdited(scene(), lib)).toBe(true);
    editor().setFormat({ width: 800, height: 1200 });
    expect(decorEdited(scene(), lib)).toBe(false);
    editor().remove(scene().nodes[0]!.id);
    expect(decorEdited(scene(), lib)).toBe(true);
  });
});

describe('scale slider and decor', () => {
  it('setScale moves items but keeps decor, including user edits', () => {
    editor().add('book', 'main', { x: 200, y: 300 });
    editor().setBackground('corner-L');
    const d = scene().nodes[0]!;
    editor().move(d.id, d.x + 40, d.y);
    const before = scene().nodes.filter((n) => n.ref.kind === 'decor');
    const book = scene().nodes.find((n) => n.ref.kind === 'item')!;
    editor().setScale(0.25, { commit: false });
    editor().setScale(1.5, { commit: true });
    expect(scene().nodes.filter((n) => n.ref.kind === 'decor')).toEqual(before);
    expect(scene().nodes.find((n) => n.ref.kind === 'item')).not.toEqual(book);
    expect(scene().globalScale).toBe(1.5);
    expect(decorEdited(scene(), lib)).toBe(true);
  });
});

describe('format change', () => {
  const intent: CompositionIntent = {
    items: [
      { item: 'phone', state: 'main', role: 'hero' },
      { item: 'book', state: 'main', role: 'support' },
    ],
    rationale: 'Телефон и книга',
  };
  const landscape: Format = { width: 1200, height: 630 };
  const portrait: Format = { width: 800, height: 1200 };
  const composedFor = (format: Format, template = 1) => {
    const s = scene();
    return composeScene(
      intent,
      {
        format,
        detail: s.detail,
        palette: s.palette,
        backgroundPresetId: s.backgroundPresetId,
        variant: template,
      },
      lib,
    );
  };
  const percent = () => scaleView(scene().globalScale, scene().format, lib).percent;

  it('re-composes an untouched composition for the new format, same variant', () => {
    editor().setBackground('corner-L');
    editor().compose(intent, 1);
    expect(scene()).toEqual(composedFor(DEFAULT_FORMAT));
    editor().setFormat(landscape);
    expect(scene()).toEqual(composedFor(landscape));
    editor().setFormat(portrait);
    expect(scene()).toEqual(composedFor(portrait));
  });

  it('still re-composes after undoing back to the composition', () => {
    editor().compose(intent, 0);
    const node = scene().nodes.find((n) => n.ref.kind === 'item')!;
    editor().move(node.id, node.x + 30, node.y);
    editor().undo();
    editor().setFormat(landscape);
    expect(scene()).toEqual(composedFor(landscape, 0));
  });

  it('transforms an edited composition and keeps the relative scale %', () => {
    editor().compose(intent, 0);
    const node = scene().nodes.find((n) => n.ref.kind === 'item')!;
    editor().move(node.id, 100, 100);
    const before = percent();
    editor().setFormat(landscape);
    expect(scene().nodes.find((n) => n.id === node.id)).toMatchObject({ x: 120, y: 63 });
    expect(percent()).toBe(before);
    editor().setFormat(portrait);
    expect(percent()).toBe(before);
  });

  it('a capped composition (names, 70 %) keeps its cap when re-composed for a new format', () => {
    editor().compose(intent, 0, 0.7);
    expect(percent()).toBeLessThanOrEqual(70);
    editor().setFormat(landscape);
    expect(percent()).toBeLessThanOrEqual(70);
    const s = scene();
    expect(s).toEqual(
      composeScene(
        intent,
        {
          format: landscape,
          detail: s.detail,
          palette: s.palette,
          backgroundPresetId: s.backgroundPresetId,
          variant: 0,
          maxFit: 0.7,
        },
        lib,
      ),
    );
  });

  it('a hand-built scene keeps its relative scale %', () => {
    editor().add('lamp', 'main');
    expect(percent()).toBe(100);
    editor().setFormat(landscape);
    expect(percent()).toBe(100);
    editor().setFormat({ width: 2400, height: 2400 });
    expect(percent()).toBe(100);
  });
});

describe('empty canvas', () => {
  it('starts at 100 % relative scale, like a composed scene at fit 1', () => {
    expect(scaleView(DEFAULT_SCALE, DEFAULT_FORMAT, lib).percent).toBe(100);
  });
});

describe('no-op edits', () => {
  it('leave no empty undo step', () => {
    editor().add('phone', 'main');
    const id = editor().selectedId!;
    editor().setSlotMap(id, { obj1: 'obj2' });
    const past = editor().history.past.length;
    editor().setSlotMap(id, { obj1: 'obj2' });
    editor().setState(id, 'main');
    editor().rotate(id, 0);
    expect(editor().history.past.length).toBe(past);
  });
});
