import type { Palette } from '../palette/types';
import type { NodeRef } from '../scene/types';
import type { AssetFile, AssetMask, DetailSize, LayoutTemplate, LibraryManifest } from './types';

export interface LoadedLibrary {
  manifest: LibraryManifest;
  palettes: Palette[];
  templates: LayoutTemplate[];
  /** Returns the SVG markup of an asset by its `AssetFile.file` path. */
  markup: (file: string) => string;
  /** Silhouettes by `AssetFile.file`; an asset without one counts as its full box. */
  masks: Readonly<Record<string, AssetMask>>;
}

export function createLibrary(
  manifest: LibraryManifest,
  palettes: Palette[],
  templates: LayoutTemplate[],
  markup: (file: string) => string,
  masks: Readonly<Record<string, AssetMask>> = {},
): LoadedLibrary {
  return { manifest, palettes, templates, markup, masks };
}

/** Asset for a node ref at the given detail size. Throws if the library has no such asset. */
export function getAsset(lib: LoadedLibrary, ref: NodeRef, size: DetailSize): AssetFile {
  if (ref.kind === 'item') {
    const def = lib.manifest.items.find((i) => i.id === ref.item);
    if (!def) throw new Error(`Unknown item: ${ref.item}`);
    return def.variants[size][ref.state];
  }
  const decor = lib.manifest.decor.find((d) => d.id === ref.decorId);
  if (!decor) throw new Error(`Unknown decor: ${ref.decorId}`);
  return decor.asset;
}

/** Side of the L background frames, used when the manifest has no L preset. */
export const L_DECOR_FRAME = 1000;

/**
 * Source-frame px of a decor element per L px: `L frame / preset.frameSize` (2 for S, 1 for L).
 * S presets are drawn in 500 px frames at half the L size, while items keep their L size
 * at every detail. Decor is therefore drawn at `asset.width × unit × decorScale(format)`, and its
 * anchor offsets are scaled the same way. The L frame is the frameSize of the manifest's
 * L presets (all L backgrounds share one frame), or L_DECOR_FRAME. Unknown decor → 1.
 */
export function decorUnit(lib: LoadedLibrary, decorId: string): number {
  const def = lib.manifest.decor.find((d) => d.id === decorId);
  const preset = def && lib.manifest.backgrounds.find((b) => b.id === def.preset);
  if (!preset || preset.frameSize <= 0) return 1;
  const lFrame = lib.manifest.backgrounds.find((b) => b.size === 'L')?.frameSize ?? L_DECOR_FRAME;
  return lFrame / preset.frameSize;
}
