import {
  canRedo,
  canUndo,
  findNodeAsset,
  nodeScale,
  nominalWidthOf,
  type LoadedLibrary,
  type Scene,
  type SceneNode,
} from '@ic/core';
import type { EditorState } from './store';

/** Node box in scene px: centre, unrotated size and rotation (degrees, clockwise). */
export interface NodeFrame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The node's box computed from the library, not from the DOM: width = nominalWidth × nodeScale
 * (globalScale for items, decorScale of the format for decor), height from the asset aspect.
 * Matches `nodeTransform`, so it frames exactly what is drawn.
 */
export function nodeFrame(node: SceneNode, scene: Scene, lib: LoadedLibrary): NodeFrame | null {
  const asset = findNodeAsset(lib, node, scene.detail);
  if (!asset || asset.width <= 0) return null;
  const w = nominalWidthOf(lib, node, asset) * nodeScale(node, scene, lib);
  return {
    cx: node.x,
    cy: node.y,
    w,
    h: (w * asset.height) / asset.width,
    rotation: node.rotation,
  };
}

/** Corners top-left, top-right, bottom-right, bottom-left after rotation (SVG y-down). */
export function frameCorners(f: NodeFrame): Point[] {
  const a = (f.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [
    [-f.w / 2, -f.h / 2],
    [f.w / 2, -f.h / 2],
    [f.w / 2, f.h / 2],
    [-f.w / 2, f.h / 2],
  ].map(([x, y]) => ({ x: f.cx + x! * cos - y! * sin, y: f.cy + x! * sin + y! * cos }));
}

export const selectScene = (s: EditorState): Scene => s.history.present;
export const selectCanUndo = (s: EditorState): boolean => canUndo(s.history);
export const selectCanRedo = (s: EditorState): boolean => canRedo(s.history);
export const selectSelectedNode = (s: EditorState): SceneNode | null =>
  s.history.present.nodes.find((n) => n.id === s.selectedId) ?? null;

/** Human label of a node: the item label from the manifest, or «Декор». */
export function nodeLabel(node: SceneNode, lib: LoadedLibrary | null): string {
  if (node.ref.kind === 'decor') return 'Декор';
  const ref = node.ref;
  return lib?.manifest.items.find((i) => i.id === ref.item)?.label ?? ref.item;
}
