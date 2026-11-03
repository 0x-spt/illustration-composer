import rawManifest from '@ic/library/data/manifest.json';
import rawMasks from '@ic/library/data/masks.json';
import rawPalettes from '@ic/library/data/palettes.json';
import rawTemplates from '@ic/library/data/templates.json';
import {
  createLibrary,
  type AssetMask,
  type DetailSize,
  type LayoutTemplate,
  type LibraryManifest,
  type LoadedLibrary,
  type Palette,
} from '@ic/core';
import { useEffect, useState } from 'react';
import { useEditor } from '../state/store';

const manifest = rawManifest as unknown as LibraryManifest;
const palettes = rawPalettes as unknown as Palette[];
const templates = rawTemplates as unknown as LayoutTemplate[];

// One lazy chunk per SVG. Keys are paths from this file; the manifest uses `assets/...`.
const loaders = import.meta.glob<string>('../../../../packages/library/assets/**/*.svg', {
  query: '?raw',
  import: 'default',
});

const loaderByFile = new Map<string, () => Promise<string>>(
  Object.entries(loaders).map(([key, load]) => [key.slice(key.indexOf('assets/')), load]),
);

const markupCache = new Map<string, string>();
const loadedSizes = new Map<DetailSize, Promise<void>>();

/** Every asset file a detail size needs: item variants of that size and its decor. */
export function filesForDetail(m: LibraryManifest, size: DetailSize): string[] {
  const items = m.items.flatMap((i) => [
    i.variants[size].main.file,
    i.variants[size].background.file,
  ]);
  const decor = m.decor.filter((d) => d.size === size).map((d) => d.asset.file);
  return [...new Set([...items, ...decor])];
}

/** Loads all SVGs of a detail size into the markup cache (once per size). */
export function ensureDetail(size: DetailSize): Promise<void> {
  let pending = loadedSizes.get(size);
  if (!pending) {
    pending = Promise.all(
      filesForDetail(manifest, size).map(async (file) => {
        const load = loaderByFile.get(file);
        if (!load) throw new Error(`Нет файла ассета: ${file}`);
        markupCache.set(file, await load());
      }),
    ).then(() => undefined);
    pending.catch(() => loadedSizes.delete(size));
    loadedSizes.set(size, pending);
  }
  return pending;
}

const library: LoadedLibrary = createLibrary(
  manifest,
  palettes,
  templates,
  (file) => {
    const text = markupCache.get(file);
    if (text === undefined) throw new Error(`Ассет ещё не загружен: ${file}`);
    return text;
  },
  rawMasks as Record<string, AssetMask>,
);

export type LibraryStatus =
  { state: 'loading' } | { state: 'ready' } | { state: 'error'; message: string };

/** Loads the library for the scene's current detail and puts it into the editor store. */
export function useLibrary(): LibraryStatus {
  const [status, setStatus] = useState<LibraryStatus>({ state: 'loading' });
  useEffect(() => {
    let alive = true;
    const detail = useEditor.getState().history.present.detail;
    ensureDetail(detail)
      .then(() => {
        if (!alive) return;
        useEditor.getState().setLibrary(library);
        setStatus({ state: 'ready' });
      })
      .catch((e: unknown) => {
        if (alive)
          setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

/** Switches the scene to `size` after its assets are loaded. */
export async function switchDetail(size: DetailSize): Promise<void> {
  await ensureDetail(size);
  useEditor.getState().setDetail(size);
}
