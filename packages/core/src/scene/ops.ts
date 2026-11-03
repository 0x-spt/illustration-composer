import { refWidth } from '../layout/frame';
import type { LoadedLibrary } from '../library/load';
import type { ItemId, ItemState } from '../library/types';
import type { ObjectSlot, Palette } from '../palette/types';
import type { Format, Scene, SceneNode } from './types';

export const DUPLICATE_OFFSET = 24;
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;

const clampScale = (k: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));

function nextId(s: Scene, item: string): string {
  const used = new Set(s.nodes.map((n) => n.id));
  let n = 1;
  while (used.has(`${item}-${n}`)) n++;
  return `${item}-${n}`;
}

function itemOf(node: SceneNode): string {
  return node.ref.kind === 'item' ? node.ref.item : node.ref.decorId;
}

/** Shallow equality of two flat records; both absent counts as equal. */
function sameRecord(a: object | undefined, b: object | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const rb = b as Record<string, unknown>;
  return (
    ka.length === Object.keys(b).length &&
    ka.every((k) => (a as Record<string, unknown>)[k] === rb[k])
  );
}

function sameNode(a: SceneNode, b: SceneNode): boolean {
  return (
    a.id === b.id &&
    a.x === b.x &&
    a.y === b.y &&
    a.rotation === b.rotation &&
    a.flipX === b.flipX &&
    sameRecord(a.ref, b.ref) &&
    sameRecord(a.slotMap, b.slotMap)
  );
}

/** Applies `f` to one node. Returns `s` itself when nothing changed, so history records no step. */
function mapNode(s: Scene, id: string, f: (n: SceneNode) => SceneNode): Scene {
  const i = s.nodes.findIndex((n) => n.id === id);
  if (i < 0) return s;
  const next = f(s.nodes[i]!);
  if (sameNode(next, s.nodes[i]!)) return s;
  const nodes = s.nodes.slice();
  nodes[i] = next;
  return { ...s, nodes };
}

export function addItem(
  s: Scene,
  item: ItemId,
  state: ItemState,
  at?: { x: number; y: number },
): Scene {
  const node: SceneNode = {
    id: nextId(s, item),
    ref: { kind: 'item', item, state },
    x: at?.x ?? s.format.width / 2,
    y: at?.y ?? s.format.height / 2,
    rotation: 0,
    flipX: false,
  };
  return { ...s, nodes: [...s.nodes, node] };
}

export function moveNode(s: Scene, id: string, x: number, y: number): Scene {
  return mapNode(s, id, (n) => ({ ...n, x, y }));
}

export function rotateNode(s: Scene, id: string, deg: number): Scene {
  const rotation = ((deg % 360) + 360) % 360;
  return mapNode(s, id, (n) => ({ ...n, rotation }));
}

export function flipNode(s: Scene, id: string): Scene {
  return mapNode(s, id, (n) => ({ ...n, flipX: !n.flipX }));
}

export function duplicateNode(s: Scene, id: string): Scene {
  const i = s.nodes.findIndex((n) => n.id === id);
  if (i < 0) return s;
  const src = s.nodes[i]!;
  const copy: SceneNode = {
    ...src,
    id: nextId(s, itemOf(src)),
    ref: { ...src.ref },
    x: src.x + DUPLICATE_OFFSET,
    y: src.y + DUPLICATE_OFFSET,
    ...(src.slotMap ? { slotMap: { ...src.slotMap } } : {}),
  };
  const nodes = s.nodes.slice();
  nodes.splice(i + 1, 0, copy);
  return { ...s, nodes };
}

export function removeNode(s: Scene, id: string): Scene {
  if (!s.nodes.some((n) => n.id === id)) return s;
  return { ...s, nodes: s.nodes.filter((n) => n.id !== id) };
}

export function reorderNode(s: Scene, id: string, dir: 'up' | 'down' | 'top' | 'bottom'): Scene {
  const i = s.nodes.findIndex((n) => n.id === id);
  if (i < 0) return s;
  const last = s.nodes.length - 1;
  const target =
    dir === 'up'
      ? Math.min(i + 1, last)
      : dir === 'down'
        ? Math.max(i - 1, 0)
        : dir === 'top'
          ? last
          : 0;
  if (target === i) return s;
  const nodes = s.nodes.slice();
  const [node] = nodes.splice(i, 1);
  nodes.splice(target, 0, node!);
  return { ...s, nodes };
}

export function setNodeState(s: Scene, id: string, state: ItemState): Scene {
  return mapNode(s, id, (n) => (n.ref.kind === 'item' ? { ...n, ref: { ...n.ref, state } } : n));
}

export function setSlotMap(
  s: Scene,
  id: string,
  map: Partial<Record<ObjectSlot, ObjectSlot>> | undefined,
): Scene {
  return mapNode(s, id, (n) => {
    const rest: SceneNode = { ...n };
    delete rest.slotMap;
    return map && Object.keys(map).length > 0 ? { ...rest, slotMap: { ...map } } : rest;
  });
}

/**
 * Scales the items' size and positions about the frame centre. k is clamped to [0.1, 4].
 * Decor frames the canvas, not the items, so it stays where it is (D7).
 */
export function setGlobalScale(s: Scene, k: number): Scene {
  const next = clampScale(k);
  if (next === s.globalScale) return s;
  const ratio = next / s.globalScale;
  const cx = s.format.width / 2;
  const cy = s.format.height / 2;
  return {
    ...s,
    globalScale: next,
    nodes: s.nodes.map((n) =>
      n.ref.kind === 'decor' ? n : { ...n, x: cx + (n.x - cx) * ratio, y: cy + (n.y - cy) * ratio },
    ),
  };
}

/**
 * Changes the frame. Node centres keep their relative position in the frame, and globalScale
 * keeps the relative scale `globalScale × refWidth / width` (the «Масштаб сцены» %): items keep
 * their size relative to the designer's example frame of the new aspect. Clamped to the slider
 * range.
 */
export function setFormat(s: Scene, f: Format, lib: LoadedLibrary | null): Scene {
  const sx = f.width / s.format.width;
  const sy = f.height / s.format.height;
  const pxPerScale = (format: Format) => format.width / refWidth(format, lib);
  const globalScale = clampScale((s.globalScale * pxPerScale(f)) / pxPerScale(s.format));
  return {
    ...s,
    format: { width: f.width, height: f.height },
    globalScale,
    nodes: s.nodes.map((n) => ({ ...n, x: n.x * sx, y: n.y * sy })),
  };
}

export function setPalette(s: Scene, p: Palette): Scene {
  return { ...s, palette: p };
}

export function setBackground(s: Scene, presetId: string | null): Scene {
  return { ...s, backgroundPresetId: presetId };
}
