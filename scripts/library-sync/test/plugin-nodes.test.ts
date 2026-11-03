import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '@ic/core';
import { BACKGROUND_FRAMES, ITEMS } from '../library.config';
import { BEGIN, END, PLUGIN_DIR, pluginNodes, renderNodesBlock } from '../plugin-nodes';

describe('plugin node list', () => {
  const nodes = pluginNodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  it('covers every item variant as SVG + PNG', () => {
    for (const item of ITEM_IDS) {
      for (const size of ['L', 'S'] as const) {
        for (const state of ['main', 'background'] as const) {
          expect(byId.get(ITEMS[item].nodes[size][state])).toMatchObject({ svg: true, png: true });
        }
      }
    }
  });

  it('covers every background frame (PNG preview + decor children)', () => {
    for (const f of BACKGROUND_FRAMES) {
      expect(byId.get(f.node)).toMatchObject({ png: true, childrenSvg: true });
    }
    expect(nodes).toHaveLength(40 + BACKGROUND_FRAMES.length);
  });

  it('committed nodes.generated.js and code.js match library.config.ts', () => {
    const block = renderNodesBlock();
    expect(readFileSync(join(PLUGIN_DIR, 'nodes.generated.js'), 'utf8')).toBe(`${block}\n`);
    const code = readFileSync(join(PLUGIN_DIR, 'code.js'), 'utf8');
    expect(code.slice(code.indexOf(BEGIN), code.indexOf(END) + END.length)).toBe(block);
  });
});
