// Test helper: builds a LoadedLibrary from the real generated files in packages/library.
import { readFileSync } from 'node:fs';
import rawManifest from '../../library/data/manifest.json';
import rawMasks from '../../library/data/masks.json';
import rawPalettes from '../../library/data/palettes.json';
import rawTemplates from '../../library/data/templates.json';
import { createLibrary, type LoadedLibrary } from '../src/library/load';
import type { AssetMask, LayoutTemplate, LibraryManifest } from '../src/library/types';
import type { Palette } from '../src/palette/types';

const libraryRoot = new URL('../../library/', import.meta.url);

export function readAsset(file: string): string {
  return readFileSync(new URL(file, libraryRoot), 'utf8');
}

export function loadRealLibrary(): LoadedLibrary {
  const cache = new Map<string, string>();
  return createLibrary(
    rawManifest as unknown as LibraryManifest,
    rawPalettes as unknown as Palette[],
    rawTemplates as unknown as LayoutTemplate[],
    (file) => {
      let text = cache.get(file);
      if (text === undefined) {
        text = readAsset(file);
        cache.set(file, text);
      }
      return text;
    },
    rawMasks as Record<string, AssetMask>,
  );
}

export function paletteById(lib: LoadedLibrary, id: string): Palette {
  const p = lib.palettes.find((x) => x.id === id);
  if (!p) throw new Error(`no palette ${id}`);
  return p;
}
