/**
 * `npm run library:masks`
 * Item SVGs → coarse silhouettes in packages/library/data/masks.json (D13). The layout uses
 * them to tell real collisions from overlapping bounding boxes. Run after `library:sync`;
 * the core tests fail when an asset changed since its mask was rendered (sha1 check).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import type { AssetMask, LibraryManifest } from '@ic/core';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '../../packages/library');
/** Cells along the longer side of an asset. */
const GRID = 64;
/** A cell is solid when the asset covers at least this share of it. */
const COVERAGE = 0.5;

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

/** Packs row-major booleans MSB-first into base64. */
export function packBits(bits: boolean[]): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((b, i) => {
    if (b) bytes[i >> 3]! |= 0x80 >> (i & 7);
  });
  return Buffer.from(bytes).toString('base64');
}

async function main() {
  const manifest = JSON.parse(
    readFileSync(join(LIB, 'data/manifest.json'), 'utf8'),
  ) as LibraryManifest;
  const files = [
    ...new Set(
      manifest.items.flatMap((i) =>
        (['L', 'S'] as const).flatMap((d) => [i.variants[d].main, i.variants[d].background]),
      ),
    ),
  ];

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const masks: Record<string, AssetMask> = {};
  for (const asset of files) {
    const svg = readFileSync(join(LIB, asset.file), 'utf8');
    const k = GRID / Math.max(asset.width, asset.height);
    const cols = Math.max(1, Math.round(asset.width * k));
    const rows = Math.max(1, Math.round(asset.height * k));
    // the browser averages coverage when it draws the SVG straight into a cols × rows canvas
    const alpha = await page.evaluate(
      async ({ svg, cols, rows }) => {
        const img = new Image();
        img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = cols;
        canvas.height = rows;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, cols, rows);
        const data = ctx.getImageData(0, 0, cols, rows).data;
        return Array.from({ length: cols * rows }, (_, i) => data[i * 4 + 3]!);
      },
      { svg, cols, rows },
    );
    masks[asset.file] = {
      cols,
      rows,
      bits: packBits(alpha.map((a) => a >= COVERAGE * 255)),
      sha1: sha1(svg),
    };
  }
  await browser.close();

  const sorted = Object.fromEntries(Object.entries(masks).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(LIB, 'data/masks.json'), `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`masks.json: ${files.length} silhouettes, ${GRID} cells on the long side`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
