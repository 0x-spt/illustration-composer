/**
 * Node list for tools/figma-export-plugin, generated from library.config.ts so the config
 * stays the single source of truth: `npm run library:plugin-nodes`.
 *
 * Figma plugins load exactly one main script, so the list is written to
 * `nodes.generated.js` and the same text is spliced into `code.js` between the
 * GENERATED markers. A test keeps both in sync with the config.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEM_IDS } from '@ic/core';
import { BACKGROUND_FRAMES, ITEMS } from './library.config';

export interface PluginNode {
  id: string;
  what: string;
  /** Export this node as SVG_STRING. */
  svg: boolean;
  /** Export this node as PNG at scale 0.5. */
  png: boolean;
  /** Also export every visible direct child as SVG (decor of background frames). */
  childrenSvg: boolean;
}

/** Everything main.ts asks the image source for (SVG assets, decor, PNG previews). */
export function pluginNodes(): PluginNode[] {
  const out: PluginNode[] = [];
  for (const item of ITEM_IDS) {
    for (const size of ['L', 'S'] as const) {
      for (const state of ['main', 'background'] as const) {
        out.push({
          id: ITEMS[item].nodes[size][state],
          what: `${item} ${size} ${state}`,
          svg: true,
          png: true,
          childrenSvg: false,
        });
      }
    }
  }
  for (const f of BACKGROUND_FRAMES) {
    out.push({
      id: f.node,
      what: `фон ${f.size} ${f.preset ?? 'дубликат'}`,
      svg: false,
      png: true,
      childrenSvg: true,
    });
  }
  return out;
}

export const BEGIN = '// <GENERATED nodes: npm run library:plugin-nodes>';
export const END = '// </GENERATED nodes>';

export function renderNodesBlock(): string {
  const rows = pluginNodes().map((n) => `  ${JSON.stringify(n)},`);
  return [BEGIN, 'var EXPORT_NODES = [', ...rows, '];', END].join('\n');
}

export const PLUGIN_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../tools/figma-export-plugin',
);

/** Replaces the generated block inside code.js text. */
export function spliceBlock(code: string, block: string): string {
  const a = code.indexOf(BEGIN);
  const b = code.indexOf(END);
  if (a < 0 || b < a) throw new Error('code.js: GENERATED markers not found');
  return code.slice(0, a) + block + code.slice(b + END.length);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const block = renderNodesBlock();
  writeFileSync(join(PLUGIN_DIR, 'nodes.generated.js'), `${block}\n`);
  const codePath = join(PLUGIN_DIR, 'code.js');
  writeFileSync(codePath, spliceBlock(readFileSync(codePath, 'utf8'), block));
  console.log(`✓ ${pluginNodes().length} nodes → nodes.generated.js, code.js`);
}
