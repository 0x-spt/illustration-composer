import type { ItemId, ItemState, DetailSize } from '../library/types';
import type { ObjectSlot, Palette } from '../palette/types';

export interface Format {
  width: number;
  height: number;
}

export const FORMAT_PRESETS: readonly Format[] = [
  { width: 1000, height: 1000 },
  { width: 1200, height: 630 },
  { width: 800, height: 1200 },
];

export type NodeRef =
  { kind: 'item'; item: ItemId; state: ItemState } | { kind: 'decor'; decorId: string };

export interface SceneNode {
  id: string;
  ref: NodeRef;
  /** Centre in px of the frame. */
  x: number;
  y: number;
  /** Degrees. */
  rotation: number;
  flipX: boolean;
  slotMap?: Partial<Record<ObjectSlot, ObjectSlot>>;
}

export interface Scene {
  format: Format;
  detail: DetailSize;
  palette: Palette;
  backgroundPresetId: string | null;
  globalScale: number;
  /** Z-order, bottom to top. */
  nodes: SceneNode[];
}
