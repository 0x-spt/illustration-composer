import type { AssetFile } from '../library/types';
import { OBJECT_SLOTS, type ObjectSlot, type Palette, type SlotName } from '../palette/types';
import type { SceneNode } from '../scene/types';

/** `fill|stroke|stop-color="#RRGGBB"` as produced by the library sync (no `style`). */
const COLOR_ATTR = /(\s(?:fill|stroke|stop-color)=")(#[0-9A-Fa-f]{6})(")/g;

export function isObjectSlot(slot: SlotName): slot is ObjectSlot {
  return (OBJECT_SLOTS as readonly string[]).includes(slot);
}

/**
 * Replaces colour attribute values along «source hex → slot → (slotMap) → palette hex».
 * Pinned and unmapped colours are left as they are; nothing but those values changes.
 */
export function recolorMarkup(
  markup: string,
  asset: AssetFile,
  palette: Palette,
  slotMap?: SceneNode['slotMap'],
): string {
  const pinned = new Set(asset.pinned.map((h) => h.toUpperCase()));
  return markup.replace(COLOR_ATTR, (whole, pre: string, hex: string, post: string) => {
    const key = hex.toUpperCase();
    if (pinned.has(key)) return whole;
    const slot = asset.colorMap[key];
    if (!slot) return whole;
    const target = (isObjectSlot(slot) && slotMap?.[slot]) || slot;
    return pre + palette.slots[target] + post;
  });
}
