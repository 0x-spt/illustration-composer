import type { LoadedLibrary } from '../library/load';
import type { Scene, SceneNode } from '../scene/types';
import {
  findNodeAsset,
  fmt,
  indent,
  isBackgroundNode,
  nodeScale,
  nodeTransform,
  nominalWidthOf,
  renderNodeInner,
} from './node';
import { isObjectSlot } from './recolor';

export interface Violation {
  nodeId: string;
  rule: 'object-color-in-background' | 'unknown-asset';
}

export function validateScene(scene: Scene, lib: LoadedLibrary): Violation[] {
  const out: Violation[] = [];
  for (const node of scene.nodes) {
    if (!findNodeAsset(lib, node, scene.detail)) {
      out.push({ nodeId: node.id, rule: 'unknown-asset' });
      continue;
    }
    const targets = Object.values(node.slotMap ?? {});
    if (isBackgroundNode(node) && targets.some((t) => t !== undefined && isObjectSlot(t))) {
      out.push({ nodeId: node.id, rule: 'object-color-in-background' });
    }
  }
  return out;
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nodeGroup(node: SceneNode, scene: Scene, lib: LoadedLibrary): string | null {
  const asset = findNodeAsset(lib, node, scene.detail);
  if (!asset) return null;
  const transform = nodeTransform(
    node,
    asset,
    nominalWidthOf(lib, node, asset),
    nodeScale(node, scene, lib),
  );
  const ref = node.ref;
  const data =
    ref.kind === 'item'
      ? ` data-item="${esc(ref.item)}" data-state="${ref.state}"`
      : ` data-decor="${esc(ref.decorId)}"`;
  return (
    `<g id="${esc(node.id)}"${data} transform="${transform}">\n` +
    `${indent(renderNodeInner(node, scene, lib), '  ')}\n</g>`
  );
}

/**
 * Full SVG document: frame clip, then every node in scene z-order inside
 * `<g clip-path="url(#frame)">`. `<g id="background">` holds the bg1 rect and the decor that sits
 * below the lowest item; decor the user raised above an item is emitted in place, so the file
 * stacks exactly like the editor. Each node is `<g id="<node.id>" data-item data-state transform>`
 * (decor: `data-decor`). Nodes with an unknown asset are skipped (validateScene reports them).
 */
export function exportScene(scene: Scene, lib: LoadedLibrary): string {
  const W = fmt(scene.format.width);
  const H = fmt(scene.format.height);

  const firstItem = scene.nodes.findIndex((n) => n.ref.kind === 'item');
  const split = firstItem < 0 ? scene.nodes.length : firstItem;
  const groups = (nodes: SceneNode[]) => nodes.flatMap((node) => nodeGroup(node, scene, lib) ?? []);
  const decor = groups(scene.nodes.slice(0, split));
  const rest = groups(scene.nodes.slice(split));

  const background = [
    `<rect width="${W}" height="${H}" fill="${scene.palette.slots.bg1}"/>`,
    ...decor,
  ].join('\n');
  const framed = [`<g id="background">\n${indent(background, '  ')}\n</g>`, ...rest].join('\n');
  const body =
    `<defs>\n  <clipPath id="frame"><rect width="${W}" height="${H}"/></clipPath>\n</defs>\n` +
    `<g clip-path="url(#frame)">\n${indent(framed, '  ')}\n</g>`;

  const xlink = body.includes('xlink:href') ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg"${xlink} width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n` +
    `${indent(body, '  ')}\n</svg>\n`
  );
}
