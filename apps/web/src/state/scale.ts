import { MAX_SCALE, MIN_SCALE, refWidth, type Format, type LoadedLibrary } from '@ic/core';

// refWidth (the example frame width of the format's aspect) lives in core: decorScale uses it too.

/**
 * «Масштаб сцены» in % relative to the format: 100 % is the example size at any canvas size.
 * The slider range covers exactly the globalScale range [MIN_SCALE, MAX_SCALE].
 */
export interface ScaleView {
  percent: number;
  min: number;
  max: number;
  /** globalScale for a slider value in %. */
  toScale: (percent: number) => number;
}

export function scaleView(
  globalScale: number,
  format: Format,
  lib: LoadedLibrary | null,
): ScaleView {
  const k = (refWidth(format, lib) / format.width) * 100;
  return {
    percent: Math.round(globalScale * k),
    min: Math.ceil(MIN_SCALE * k),
    max: Math.floor(MAX_SCALE * k),
    toScale: (p) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, p / k)),
  };
}
