import type { Hex } from '../color/hex';

export type SlotName = 'bg1' | 'bg2' | 'bg3' | 'obj1' | 'obj2' | 'obj3' | 'ink' | 'paper';

export const SLOT_NAMES: readonly SlotName[] = [
  'bg1',
  'bg2',
  'bg3',
  'obj1',
  'obj2',
  'obj3',
  'ink',
  'paper',
];

export const BG_SLOTS = ['bg1', 'bg2', 'bg3'] as const;
export const OBJECT_SLOTS = ['obj1', 'obj2', 'obj3'] as const;
export type ObjectSlot = (typeof OBJECT_SLOTS)[number];

export interface Palette {
  id: string;
  name: string;
  slots: Record<SlotName, Hex>;
}
