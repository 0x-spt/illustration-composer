import type { DetailSize } from '../library/types';
import type { Palette } from '../palette/types';
import type { Format } from '../scene/types';

export interface ComposeOptions {
  format: Format;
  detail: DetailSize;
  palette: Palette;
  /** Preset of either size: it is resolved to `detail` with `resolvePresetForDetail`. */
  backgroundPresetId: string | null;
  /** Picks the template `variant % candidates.length`. */
  variant: number;
  /**
   * Upper bound of the fit (share of the example scale). 1 (default) keeps the designer's
   * size; the names scenario starts smaller (D13).
   */
  maxFit?: number;
}

/** Axis-aligned box on the canvas: centre and size, px. */
export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Hero keeps at least this share of its (rotated) box inside the frame... */
export const HERO_MIN_VISIBLE = 0.6;
/**
 * ...unless the designer's own example shows less of the item in that slot: the template's
 * crop is kept, but never below half the box (which keeps the hero centre in the frame).
 */
export const HERO_MIN_VISIBLE_FLOOR = 0.5;
/**
 * A non-surface item (lamp, vase, phone…) in a slot drawn for another item is kept whole,
 * clear of the frame edge (D13); in its own slot it keeps the designer's crop, up to this.
 */
export const HERO_MIN_VISIBLE_UPRIGHT = 1;
