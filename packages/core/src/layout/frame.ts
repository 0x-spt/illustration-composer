import type { LoadedLibrary } from '../library/load';
import type { Aspect } from '../library/types';
import type { Format } from '../scene/types';

/** ratio > 1.2 landscape, < 0.83 portrait, otherwise square. */
export function aspectOf(f: Format): Aspect {
  const r = f.width / f.height;
  if (r > 1.2) return 'landscape';
  if (r < 0.83) return 'portrait';
  return 'square';
}

/** Reference width when the library has no template of the format's aspect. */
export const DEFAULT_REF_WIDTH = 1000;

/**
 * Width of the designer's example frames of the format's aspect (1000 / 1200 / 800): the
 * canvas width at which scale 1 is «as designed».
 */
export function refWidth(format: Format, lib: LoadedLibrary | null): number {
  const aspect = aspectOf(format);
  return lib?.templates.find((t) => t.aspect === aspect)?.frame.width ?? DEFAULT_REF_WIDTH;
}

/**
 * Scale of the background decor (D7): it frames the canvas, so it depends only on the format,
 * never on the items' globalScale or the support fit. Decor is drawn at `decorUnit × decorScale`.
 */
export function decorScale(format: Format, lib: LoadedLibrary | null): number {
  return format.width / refWidth(format, lib);
}
