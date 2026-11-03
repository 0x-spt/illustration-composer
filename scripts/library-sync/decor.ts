import type { DecorDef, DetailSize, Palette, SlotName } from '@ic/core';
import { figmaHex, nodeBox, type FigmaNode, type FigmaRect } from './figma';

export interface DecorPlacement extends Omit<DecorDef, 'asset'> {
  nodeId: string;
  name: string;
  /** Child box relative to the frame's top-left, px. */
  box: FigmaRect;
}

const r2 = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

/** Box of `n` relative to `frame`'s top-left (render bounds: what the SVG export covers). */
export function relativeBox(n: FigmaNode, frame: FigmaNode): FigmaRect {
  const f = frame.absoluteBoundingBox;
  if (!f) throw new Error(`frame ${frame.id} has no bounds`);
  const b = nodeBox(n);
  return { x: r2(b.x - f.x), y: r2(b.y - f.y), width: r2(b.width), height: r2(b.height) };
}

/** Anchor to the frame corner nearest to the box centre; top-left = corner + (dx, dy). */
export function anchorFor(box: FigmaRect, frameW: number, frameH: number): DecorDef['anchor'] {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const right = cx > frameW / 2;
  const bottom = cy > frameH / 2;
  const corner = `${bottom ? 'b' : 't'}${right ? 'r' : 'l'}` as DecorDef['anchor']['corner'];
  return {
    corner,
    dx: r2(box.x - (right ? frameW : 0)),
    dy: r2(box.y - (bottom ? frameH : 0)),
  };
}

/** Every visible direct child of a «Фон» frame becomes one decor element. */
export function extractDecor(frame: FigmaNode, preset: string, size: DetailSize): DecorPlacement[] {
  const f = frame.absoluteBoundingBox;
  if (!f) throw new Error(`frame ${frame.id} has no bounds`);
  return (frame.children ?? [])
    .filter((c) => c.visible !== false)
    .map((c, i) => {
      const box = relativeBox(c, frame);
      return {
        id: `${preset}-${String(i + 1).padStart(2, '0')}`,
        nodeId: c.id,
        name: c.name,
        preset,
        size,
        box,
        anchor: anchorFor(box, f.width, f.height),
      };
    });
}

/** First visible solid fill of a node as `#RRGGBB`. */
export function solidFill(n: FigmaNode): string | undefined {
  const p = (n.fills ?? []).find((x) => x.visible !== false && x.type === 'SOLID' && x.color);
  return p?.color ? figmaHex(p.color) : undefined;
}

const LEFT: SlotName[] = ['bg1', 'bg2', 'bg3', 'ink'];
const RIGHT: SlotName[] = ['obj1', 'obj2', 'obj3', 'paper'];

/**
 * Reads a swatch group: 2 columns × 4 rows, placed by position (not layer name).
 * Left column «Цвета фона» = bg1, bg2, bg3, ink; right «Цвета объектов» = obj1..obj3, paper.
 */
export function readPalette(group: FigmaNode, id: string, name: string): Palette {
  const cells = (group.children ?? [])
    .filter((c) => c.visible !== false && c.absoluteBoundingBox)
    .map((c) => ({ box: c.absoluteBoundingBox!, color: solidFill(c) }));
  if (cells.length !== 8)
    throw new Error(`palette ${group.id}: expected 8 swatches, got ${cells.length}`);
  const xs = [...new Set(cells.map((c) => Math.round(c.box.x)))].sort((a, b) => a - b);
  const ys = [...new Set(cells.map((c) => Math.round(c.box.y)))].sort((a, b) => a - b);
  if (xs.length !== 2 || ys.length !== 4) {
    throw new Error(`palette ${group.id}: expected a 2×4 grid, got ${xs.length}×${ys.length}`);
  }
  const slots = {} as Palette['slots'];
  for (const c of cells) {
    const col = xs.indexOf(Math.round(c.box.x));
    const row = ys.indexOf(Math.round(c.box.y));
    if (!c.color) throw new Error(`palette ${group.id}: swatch without solid fill`);
    slots[(col === 0 ? LEFT : RIGHT)[row]!] = c.color;
  }
  return { id, name, slots };
}
