import { decorUnit, type LoadedLibrary } from '../library/load';
import { decorScale } from '../layout/frame';
import type { AssetFile } from '../library/types';
import type { Scene, SceneNode } from '../scene/types';
import { scopeIds } from './ids';
import { recolorMarkup } from './recolor';

/** Number for SVG attributes: at most 4 decimals, no trailing zeros, no `-0`. */
export function fmt(n: number): string {
  const r = +n.toFixed(4);
  return String(r === 0 ? 0 : r);
}

/** Asset of a node at the scene's detail size, or null if the library has none. */
export function findNodeAsset(
  lib: LoadedLibrary,
  node: SceneNode,
  detail: Scene['detail'],
): AssetFile | null {
  const ref = node.ref;
  if (ref.kind === 'decor') {
    return lib.manifest.decor.find((d) => d.id === ref.decorId)?.asset ?? null;
  }
  return lib.manifest.items.find((i) => i.id === ref.item)?.variants[detail]?.[ref.state] ?? null;
}

/**
 * Width at scale 1 (see nodeScale). Items: their nominal width (L-main). Decor: its asset width in L px
 * (`asset.width × decorUnit`, so S decor is drawn at its L size).
 */
export function nominalWidthOf(lib: LoadedLibrary, node: SceneNode, asset: AssetFile): number {
  const ref = node.ref;
  if (ref.kind === 'decor') return asset.width * decorUnit(lib, ref.decorId);
  return lib.manifest.items.find((i) => i.id === ref.item)?.nominalWidth ?? asset.width;
}

/**
 * Scale a node is drawn at: items use the scene's globalScale, decor the format's decorScale
 * (decor frames the canvas, D7). Pass it to `nodeTransform` together with `nominalWidthOf`.
 */
export function nodeScale(node: SceneNode, scene: Scene, lib: LoadedLibrary): number {
  return node.ref.kind === 'decor' ? decorScale(scene.format, lib) : scene.globalScale;
}

/** Nodes where `obj*` slots are forbidden: decor and items in the `background` state. */
export function isBackgroundNode(node: SceneNode): boolean {
  return node.ref.kind === 'decor' || node.ref.state === 'background';
}

/**
 * `translate(x y) rotate(r) scale(sx, s) translate(-w/2 -h/2)`: the asset centre goes
 * to 0,0, is scaled (sx = -s when flipped), rotated and placed at the node centre.
 * s = nominalWidth × scale / asset.width, where scale = nodeScale(): globalScale for items,
 * decorScale(format) for decor (D7).
 */
export function nodeTransform(
  node: SceneNode,
  asset: AssetFile,
  nominalWidth: number,
  scale: number,
): string {
  const s = (nominalWidth * scale) / asset.width;
  const sx = node.flipX ? -s : s;
  return (
    `translate(${fmt(node.x)} ${fmt(node.y)}) rotate(${fmt(node.rotation)}) ` +
    `scale(${fmt(sx)}, ${fmt(s)}) translate(${fmt(-asset.width / 2)} ${fmt(-asset.height / 2)})`
  );
}

const ROOT = /^\s*(?:<\?xml[^>]*>\s*)?<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/;
const ATTR = /([\w:-]+)="([^"]*)"/g;
/** Root attributes that describe the document rather than the drawing. */
const STRUCTURAL = new Set(['width', 'height', 'viewBox', 'xmlns', 'xmlns:xlink', 'version']);
const TAG_LINE = /^(\s*)</;

/**
 * Prefixes every element line with `prefix` and drops blank lines. Lines that do not
 * start with `<` (continuations of a multi-line attribute value) stay byte-for-byte.
 */
export function indent(markup: string, prefix: string): string {
  return markup
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => (TAG_LINE.test(l) ? prefix + l : l))
    .join('\n');
}

/** Removes the common indentation of element lines. */
function dedent(markup: string): string {
  const lines = markup.split('\n').filter((l) => l.trim() !== '');
  const tagIndents = lines.flatMap((l) => {
    const m = TAG_LINE.exec(l);
    return m ? [m[1]!.length] : [];
  });
  const min = tagIndents.length ? Math.min(...tagIndents) : 0;
  return lines.map((l) => (TAG_LINE.test(l) ? l.slice(min) : l)).join('\n');
}

/**
 * Inner markup of a node (no root `<svg>`): recoloured with the scene palette and the
 * node's slotMap, ids scoped to the node, decor clipped to its own viewBox.
 * Shared by the editor and the export. An unknown asset renders as '' (validateScene reports it).
 */
export function renderNodeInner(node: SceneNode, scene: Scene, lib: LoadedLibrary): string {
  const asset = findNodeAsset(lib, node, scene.detail);
  if (!asset) return '';
  const root = ROOT.exec(lib.markup(asset.file));
  if (!root) throw new Error(`Not an SVG document: ${asset.file}`);
  const [, rootAttrs = '', body = ''] = root;

  // obj* slots are forbidden in background/decor: their slotMap is never applied
  const slotMap = isBackgroundNode(node) ? undefined : node.slotMap;
  let content = dedent(scopeIds(recolorMarkup(body, asset, scene.palette, slotMap), node.id));

  // keep the root's inherited presentation attributes (e.g. fill="none")
  const inherited = [...rootAttrs.matchAll(ATTR)]
    .filter((m) => !STRUCTURAL.has(m[1]!))
    .map((m) => ` ${m[1]}="${m[2]}"`)
    .join('');
  if (inherited) content = `<g${inherited}>\n${indent(content, '  ')}\n</g>`;

  if (node.ref.kind === 'decor') {
    // decor paths run past their box (the plugin clips at the frame): clip to the asset box
    const [vx = 0, vy = 0, vw = asset.width, vh = asset.height] = asset.viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const xy = (vx ? ` x="${fmt(vx)}"` : '') + (vy ? ` y="${fmt(vy)}"` : '');
    const clipId = `${node.id}__clip`;
    content =
      `<defs>\n  <clipPath id="${clipId}"><rect${xy} width="${fmt(vw)}" height="${fmt(vh)}"/></clipPath>\n</defs>\n` +
      `<g clip-path="url(#${clipId})">\n${indent(content, '  ')}\n</g>`;
  }
  return content;
}
