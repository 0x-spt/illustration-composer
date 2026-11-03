import { decorUnit, type LoadedLibrary } from '../library/load';
import type { BackgroundPreset, DetailSize, LibraryManifest } from '../library/types';
import type { Format, SceneNode } from '../scene/types';
import { decorScale } from './frame';

/**
 * Decor nodes of a preset, anchored to their corner of the format. With
 * k = decorUnit × decorScale(format) (decorUnit is 2 for S presets, 1 for L; no globalScale, decor frames the canvas, D7):
 * top-left = corner + (dx, dy) × k, size = asset size × k, the scale the renderer draws decor at.
 */
export function placeDecor(
  preset: BackgroundPreset,
  format: Format,
  lib: LoadedLibrary,
): SceneNode[] {
  const scale = decorScale(format, lib);
  const out: SceneNode[] = [];
  for (const decorId of preset.decorIds) {
    const def = lib.manifest.decor.find((d) => d.id === decorId);
    if (!def) continue;
    const k = decorUnit(lib, decorId) * scale;
    const { corner, dx, dy } = def.anchor;
    const x0 = (corner.endsWith('r') ? format.width : 0) + dx * k;
    const y0 = (corner.startsWith('b') ? format.height : 0) + dy * k;
    out.push({
      id: `${decorId}-1`,
      ref: { kind: 'decor', decorId },
      x: x0 + (def.asset.width * k) / 2,
      y: y0 + (def.asset.height * k) / 2,
      rotation: 0,
      flipX: false,
    });
  }
  return out;
}

/**
 * Preset ids do not pair between sizes (confetti-bold-S has no L). Returns the preset itself
 * when it has that size, else `<family>-<detail>` (family = id without its `-L`/`-S`), else the
 * first preset of that size. null for an unknown id or when no preset of that size exists.
 */
export function resolvePresetForDetail(
  presetId: string,
  detail: DetailSize,
  manifest: LibraryManifest,
): string | null {
  const preset = manifest.backgrounds.find((b) => b.id === presetId);
  if (!preset) return null;
  if (preset.size === detail) return preset.id;
  const family = preset.id.replace(/-(?:L|S)$/, '');
  const same = manifest.backgrounds.find(
    (b) => b.size === detail && b.id === `${family}-${detail}`,
  );
  return (same ?? manifest.backgrounds.find((b) => b.size === detail))?.id ?? null;
}
