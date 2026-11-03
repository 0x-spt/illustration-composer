import {
  findNodeAsset,
  nodeScale,
  nodeTransform,
  nominalWidthOf,
  renderNodeInner,
  type LoadedLibrary,
  type Scene,
  type SceneNode,
} from '@ic/core';
import { memo, useMemo } from 'react';

interface Props {
  node: SceneNode;
  scene: Scene;
  lib: LoadedLibrary;
}

function render(node: SceneNode, scene: Scene, lib: LoadedLibrary): string {
  try {
    return renderNodeInner(node, scene, lib);
  } catch (e) {
    // an asset of another detail size not loaded yet: draw nothing rather than crash
    console.warn(e);
    return '';
  }
}

/**
 * One scene node as `<g transform>` with the recoloured asset markup inside. The markup
 * depends only on the node, palette and detail, so moving a node never re-renders its SVG.
 */
function NodeViewImpl({ node, scene, lib }: Props) {
  const asset = findNodeAsset(lib, node, scene.detail);
  const { palette, detail } = scene;
  const html = useMemo(
    () => render(node, scene, lib),
    // the markup ignores position, rotation and scale
    [node.id, node.ref, node.slotMap, palette, detail, lib],
  );
  if (!asset) return null;
  return (
    <g
      data-node-id={node.id}
      transform={nodeTransform(
        node,
        asset,
        nominalWidthOf(lib, node, asset),
        nodeScale(node, scene, lib),
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export const NodeView = memo(
  NodeViewImpl,
  (a, b) =>
    a.node === b.node &&
    a.lib === b.lib &&
    a.scene.palette === b.scene.palette &&
    a.scene.detail === b.scene.detail &&
    a.scene.globalScale === b.scene.globalScale &&
    a.scene.format === b.scene.format,
);
