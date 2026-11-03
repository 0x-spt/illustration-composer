import type {
  Aspect,
  DetailSize,
  ItemId,
  ItemState,
  LayoutTemplate,
  LibraryManifest,
  Palette,
  TemplateSlot,
} from '@ic/core';
import { BG_SLOTS } from '@ic/core';
import { buildColorMap } from './colors';
import { nodeColors, type FigmaNode } from './figma';
import { NAME_TO_ITEM, SPEC_PALETTES } from './library.config';

export type { FigmaNode } from './figma';

export interface TemplateOptions {
  palettes?: Palette[];
  nameToItem?: Record<string, ItemId>;
}

export interface RecognisedItem {
  nodeId: string;
  item: ItemId;
  state: ItemState;
  size: DetailSize;
  /** bbox.width / variant.width — expected ≈ 1 (examples use the library at 1:1). */
  scale: number;
  slot: TemplateSlot;
}

export interface ExampleAnalysis {
  template: LayoutTemplate;
  items: RecognisedItem[];
  /** Visible children that are not library items (decor drawn into the example). */
  ignored: string[];
}

export function aspectOf(width: number, height: number): Aspect {
  if (Math.abs(width - height) < 0.5) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

const NEUTRAL = new Set<string>([...BG_SLOTS, 'ink', 'paper']);
const round = (v: number, digits = 4) => {
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return Object.is(r, -0) ? 0 : r;
};

/**
 * `background` when every colour sits in a bg1-3, ink or paper slot. Each colour is
 * classified by its nearest slot regardless of the pinning threshold: copies in the
 * examples carry off-palette tints (headphones use #F5EFC9 ≈ obj1) that must still count.
 */
export function stateOf(node: FigmaNode, palettes: Palette[]): ItemState {
  const { colorMap } = buildColorMap(nodeColors(node), palettes, Infinity);
  return Object.values(colorMap).every((slot) => NEUTRAL.has(slot)) ? 'background' : 'main';
}

export function analyzeExample(
  frame: FigmaNode,
  manifest: LibraryManifest,
  opts: TemplateOptions = {},
): ExampleAnalysis {
  const palettes = opts.palettes ?? SPEC_PALETTES;
  const nameToItem = opts.nameToItem ?? NAME_TO_ITEM;
  const fb = frame.absoluteBoundingBox;
  if (!fb) throw new Error(`frame ${frame.id} has no bounds`);

  const items: RecognisedItem[] = [];
  const ignored: string[] = [];
  for (const child of frame.children ?? []) {
    if (child.visible === false) continue;
    const itemId = nameToItem[child.name];
    const def = itemId && manifest.items.find((i) => i.id === itemId);
    const box = child.absoluteBoundingBox;
    if (!itemId || !def || !box) {
      ignored.push(`${child.id} ${child.type} «${child.name}»`);
      continue;
    }
    const state = stateOf(child, palettes);
    // detail size: the variant whose width is closest (in ratio) to the drawn width
    const sizes: DetailSize[] = ['L', 'S'];
    const ratio = (s: DetailSize) => Math.abs(Math.log(box.width / def.variants[s][state].width));
    const size = sizes.reduce((a, b) => (ratio(b) < ratio(a) ? b : a));
    items.push({
      nodeId: child.id,
      item: itemId,
      state,
      size,
      scale: round(box.width / def.variants[size][state].width, 3),
      slot: {
        role: state === 'background' ? 'backdrop' : 'support',
        cx: round((box.x - fb.x + box.width / 2) / fb.width),
        cy: round((box.y - fb.y + box.height / 2) / fb.height),
        z: items.length,
        rotation: round(((child.rotation ?? 0) * 180) / Math.PI, 2),
        sourceItem: itemId,
      },
    });
  }

  // hero: the largest by visible size (bbox.width = scale × nominal) among main items
  const width = (r: RecognisedItem) => r.scale * nominalOf(manifest, r);
  const pool = items.some((r) => r.state === 'main')
    ? items.filter((r) => r.state === 'main')
    : items;
  const hero = pool.reduce<RecognisedItem | undefined>(
    (a, b) => (!a || width(b) > width(a) ? b : a),
    undefined,
  );
  if (hero) hero.slot.role = 'hero';

  return {
    template: {
      id: `${aspectOf(fb.width, fb.height)}-${frame.id.replace(':', '-')}`,
      aspect: aspectOf(fb.width, fb.height),
      // the renderer draws every item at nominalWidth × globalScale
      scale: hero ? round(width(hero) / heroNominal(manifest, hero)) : 1,
      frame: { width: fb.width, height: fb.height },
      slots: items.map((r) => r.slot),
      sourceFrame: frame.id,
    },
    items,
    ignored,
  };
}

function heroNominal(manifest: LibraryManifest, r: RecognisedItem): number {
  return manifest.items.find((i) => i.id === r.item)!.nominalWidth;
}

function nominalOf(manifest: LibraryManifest, r: RecognisedItem): number {
  return manifest.items.find((i) => i.id === r.item)!.variants[r.size][r.state].width;
}

export function extractTemplate(
  frame: FigmaNode,
  manifest: LibraryManifest,
  opts: TemplateOptions = {},
): LayoutTemplate {
  return analyzeExample(frame, manifest, opts).template;
}
