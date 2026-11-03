import type { LoadedLibrary } from '../library/load';
import type { AssetFile, AssetMask } from '../library/types';
import type { Format } from '../scene/types';
import type { Box } from './types';

/**
 * Silhouettes on a coarse frame grid (D13). Bounding boxes cannot tell a coin lying beside
 * a lamp from a coin inside its shade: the boxes of isometric items are mostly empty.
 */

/** Cells along the longer side of the frame. */
const FRAME_CELLS = 96;

export interface FrameGrid {
  cols: number;
  rows: number;
  /** Side of a cell, px. */
  cell: number;
}

export function frameGrid(f: Format): FrameGrid {
  const cell = Math.max(f.width, f.height) / FRAME_CELLS;
  return { cols: Math.ceil(f.width / cell), rows: Math.ceil(f.height / cell), cell };
}

interface DecodedMask {
  cols: number;
  rows: number;
  bytes: Uint8Array;
}

const decoded = new WeakMap<AssetMask, DecodedMask>();

function decode(m: AssetMask): DecodedMask {
  let d = decoded.get(m);
  if (!d) {
    const bin = atob(m.bits);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    d = { cols: m.cols, rows: m.rows, bytes };
    decoded.set(m, d);
  }
  return d;
}

const solid = (m: DecodedMask, c: number, r: number) => {
  const i = r * m.cols + c;
  return (m.bytes[i >> 3]! & (0x80 >> (i & 7))) !== 0;
};

/** The visible part of a placed item: the frame cells its silhouette covers. */
export interface Footprint {
  /** Indices into the frame grid, `row × cols + col`. */
  cells: Uint32Array;
  /** The same cells as a frame-grid bitmap (1 = covered). */
  covered: Uint8Array;
  /** Centroid of the covered cells, px; the box centre when nothing is visible. */
  cx: number;
  cy: number;
}

/**
 * Frame cells whose centre falls on the asset's silhouette when the asset is drawn into
 * `box` (rotated by `rotation`° about its centre, mirrored when `flipX`). An asset without
 * a mask covers its whole box.
 */
export function footprint(
  grid: FrameGrid,
  lib: LoadedLibrary,
  asset: AssetFile,
  box: Box,
  rotation: number,
  flipX: boolean,
): Footprint {
  const mask = lib.masks[asset.file];
  const m = mask ? decode(mask) : null;
  const a = (rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const half = (Math.abs(box.w * cos) + Math.abs(box.h * sin)) / 2;
  const halfY = (Math.abs(box.w * sin) + Math.abs(box.h * cos)) / 2;
  const c0 = Math.max(0, Math.floor((box.cx - half) / grid.cell));
  const c1 = Math.min(grid.cols - 1, Math.floor((box.cx + half) / grid.cell));
  const r0 = Math.max(0, Math.floor((box.cy - halfY) / grid.cell));
  const r1 = Math.min(grid.rows - 1, Math.floor((box.cy + halfY) / grid.cell));

  const out: number[] = [];
  let sx = 0;
  let sy = 0;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const dx = (c + 0.5) * grid.cell - box.cx;
      const dy = (r + 0.5) * grid.cell - box.cy;
      // into the asset's own axes: undo the rotation, then the flip
      let u = (dx * cos + dy * sin) / box.w + 0.5;
      const v = (-dx * sin + dy * cos) / box.h + 0.5;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      if (flipX) u = 1 - u;
      if (
        m &&
        !solid(m, Math.min(m.cols - 1, (u * m.cols) | 0), Math.min(m.rows - 1, (v * m.rows) | 0))
      )
        continue;
      out.push(r * grid.cols + c);
      sx += c;
      sy += r;
    }
  }
  const n = out.length;
  const covered = new Uint8Array(grid.cols * grid.rows);
  for (const i of out) covered[i] = 1;
  return {
    cells: Uint32Array.from(out),
    covered,
    cx: n ? (sx / n + 0.5) * grid.cell : box.cx,
    cy: n ? (sy / n + 0.5) * grid.cell : box.cy,
  };
}

/**
 * Cells of `a` within `margin` cells (Chebyshev distance) of `b`: with margin 0 the cells
 * the two share, with margin > 0 also the ones too close for a visible gap.
 */
export function cellsNear(grid: FrameGrid, a: Footprint, b: Footprint, margin = 0): number {
  let n = 0;
  for (const i of a.cells) {
    if (margin === 0) {
      n += b.covered[i]!;
      continue;
    }
    const r = Math.floor(i / grid.cols);
    const c = i - r * grid.cols;
    const y1 = Math.min(grid.rows - 1, r + margin);
    const x0 = Math.max(0, c - margin);
    const x1 = Math.min(grid.cols - 1, c + margin);
    search: for (let y = Math.max(0, r - margin); y <= y1; y++) {
      const row = y * grid.cols;
      for (let x = x0; x <= x1; x++) {
        if (b.covered[row + x]) {
          n++;
          break search;
        }
      }
    }
  }
  return n;
}
