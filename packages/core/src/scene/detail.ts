import type { DetailSize } from '../library/types';
import type { Scene } from './types';

/**
 * Switches the detail variant. Nodes are untouched: the renderer sizes every
 * asset from the item's `nominalWidth`, so the visual size does not change.
 */
export function setDetail(s: Scene, size: DetailSize): Scene {
  return s.detail === size ? s : { ...s, detail: size };
}
