import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { anchorFor, extractDecor, readPalette } from '../decor';
import type { FigmaNode } from '../figma';
import { SPEC_PALETTES } from '../library.config';

const nodes: FigmaNode[] = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/background-frames.json', import.meta.url)),
    'utf8',
  ),
);
const node = (id: string) => nodes.find((n) => n.id === id)!;

describe('anchorFor', () => {
  it('picks the corner nearest to the centre and offsets the top-left from it', () => {
    expect(anchorFor({ x: 10, y: 20, width: 30, height: 30 }, 1000, 1000)).toEqual({
      corner: 'tl',
      dx: 10,
      dy: 20,
    });
    expect(anchorFor({ x: 900, y: 850, width: 50, height: 100 }, 1000, 1000)).toEqual({
      corner: 'br',
      dx: -100,
      dy: -150,
    });
  });
});

describe('extractDecor', () => {
  it('turns each child of the peach frame into an anchored decor element', () => {
    const decor = extractDecor(node('21:25399'), 'corner-L', 'L');
    expect(decor.map((d) => d.nodeId)).toEqual(['21:25471', '21:25465', '21:25786']);
    expect(decor.map((d) => d.anchor.corner)).toEqual(['br', 'tr', 'br']);
    expect(decor[0]!.id).toBe('corner-L-01');
    const triangle = decor[0]!;
    expect(triangle.anchor.dx).toBeCloseTo(triangle.box.x - 1000, 5);
    expect(triangle.anchor.dy).toBeCloseTo(triangle.box.y - 1000, 5);
  });
});

describe('readPalette', () => {
  it('reads slots by grid position and matches the spec table', () => {
    expect(readPalette(node('21:29569'), 'lilac', 'Сиреневая')).toEqual(SPEC_PALETTES[0]);
  });
});
