import {
  findNodeAsset,
  nodeScale,
  nodeTransform,
  nominalWidthOf,
  placeDecor,
  renderNodeInner,
  type BackgroundPreset,
  type DetailSize,
  type LoadedLibrary,
  type NodeRef,
  type Palette,
  type Scene,
  type SceneNode,
} from '@ic/core';
import { memo, useMemo } from 'react';

/** A scene shell for core's renderer: only palette and detail matter for a single node. */
const shell = (palette: Palette, detail: DetailSize): Scene => ({
  format: { width: 1000, height: 1000 },
  detail,
  palette,
  backgroundPresetId: null,
  globalScale: 1,
  nodes: [],
});

function safeInner(node: SceneNode, scene: Scene, lib: LoadedLibrary): string {
  try {
    return renderNodeInner(node, scene, lib);
  } catch {
    return ''; // assets of this detail not loaded yet
  }
}

interface AssetProps {
  /** Unique prefix for scoped ids: previews must not clash with canvas nodes. */
  uid: string;
  nodeRef: NodeRef;
  slotMap?: SceneNode['slotMap'];
  palette: Palette;
  detail: DetailSize;
  lib: LoadedLibrary;
  className?: string;
}

/** One asset as vector markup in the given palette, through the same renderer as the canvas. */
export const AssetPreview = memo(function AssetPreview({
  uid,
  nodeRef,
  slotMap,
  palette,
  detail,
  lib,
  className,
}: AssetProps) {
  const node = useMemo<SceneNode>(
    () => ({
      id: uid,
      ref: nodeRef,
      x: 0,
      y: 0,
      rotation: 0,
      flipX: false,
      ...(slotMap ? { slotMap } : {}),
    }),
    [uid, nodeRef, slotMap],
  );
  const html = useMemo(
    () => safeInner(node, shell(palette, detail), lib),
    [node, palette, detail, lib],
  );
  const asset = findNodeAsset(lib, node, detail);
  if (!asset) return null;
  return (
    <svg
      className={className}
      viewBox={asset.viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

/** Whole scene as a static thumbnail (ids prefixed with `uid`). */
export const SceneSnippet = memo(function SceneSnippet({
  scene,
  lib,
  uid,
  className,
}: {
  scene: Scene;
  lib: LoadedLibrary;
  uid: string;
  className?: string;
}) {
  const html = useMemo(
    () =>
      scene.nodes
        .map((n0) => {
          const n = { ...n0, id: `${uid}-${n0.id}` };
          const asset = findNodeAsset(lib, n, scene.detail);
          if (!asset) return '';
          const t = nodeTransform(
            n,
            asset,
            nominalWidthOf(lib, n, asset),
            nodeScale(n, scene, lib),
          );
          return `<g transform="${t}">${safeInner(n, scene, lib)}</g>`;
        })
        .join(''),
    [scene, lib, uid],
  );
  const { width: W, height: H } = scene.format;
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <rect width={W} height={H} fill={scene.palette.slots.bg1} />
      <g dangerouslySetInnerHTML={{ __html: html }} />
    </svg>
  );
});

interface BackgroundProps {
  preset: BackgroundPreset | null;
  palette: Palette;
  lib: LoadedLibrary;
}

/** 16:10 like the tile; decor is laid out for this format exactly as on a real canvas:
 * it depends only on the format (D7). */
const BG_FRAME = { width: 1600, height: 1000 };

/** Square thumbnail of a background preset: bg1 fill plus its decor, laid out by core. */
export const BackgroundPreview = memo(function BackgroundPreview({
  preset,
  palette,
  lib,
}: BackgroundProps) {
  const html = useMemo(() => {
    if (!preset) return '';
    const scene = { ...shell(palette, preset.size), format: BG_FRAME };
    return placeDecor(preset, BG_FRAME, lib)
      .map((n) => ({ ...n, id: `pv-bg-${n.id}` }))
      .map((n) => {
        const asset = findNodeAsset(lib, n, preset.size);
        if (!asset) return '';
        const t = nodeTransform(n, asset, nominalWidthOf(lib, n, asset), nodeScale(n, scene, lib));
        return `<g transform="${t}">${safeInner(n, scene, lib)}</g>`;
      })
      .join('');
  }, [preset, palette, lib]);
  return (
    <svg viewBox={`0 0 ${BG_FRAME.width} ${BG_FRAME.height}`} aria-hidden="true">
      <rect width={BG_FRAME.width} height={BG_FRAME.height} fill={palette.slots.bg1} />
      <g dangerouslySetInnerHTML={{ __html: html }} />
    </svg>
  );
});
