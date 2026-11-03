/**
 * `npm run examples`
 * Builds examples/: one composition per format, each with an SVG (the service's own export)
 * and a PNG preview. The scenes go through the same core and layout as the editor; a scene
 * whose items overlap by the layout rule (D13) fails the run instead of landing in the repo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  composeScene,
  createLibrary,
  exportScene,
  sceneCollisions,
  validateScene,
  type AssetMask,
  type CompositionIntent,
  type Format,
  type ItemId,
  type LayoutTemplate,
  type LibraryManifest,
  type Palette,
} from '@ic/core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const LIB = join(ROOT, 'packages/library');
const OUT = join(ROOT, 'examples');

type Role = 'hero' | 'support' | 'backdrop';
/** A backdrop is drawn in its background state, everything else as a main item. */
const item = (id: ItemId, role: Role): CompositionIntent['items'][number] => ({
  item: id,
  role,
  state: role === 'backdrop' ? 'background' : 'main',
});

interface Example {
  file: string;
  /** The phrase the scene illustrates (README caption). */
  title: string;
  format: Format;
  palette: string;
  background: string | null;
  intent: CompositionIntent;
  /** Layout template, as «Другой вариант» counts it. */
  variant: number;
}

export const EXAMPLES: Example[] = [
  {
    file: 'financial-cushion',
    title: 'Финансовая подушка',
    format: { width: 1200, height: 630 },
    palette: 'lilac',
    background: 'confetti-L',
    intent: {
      items: [item('wallet', 'hero'), item('coin', 'support'), item('phone', 'support')],
      rationale: 'Кошелёк — запас, монета — накопления, телефон — банк в кармане.',
    },
    variant: 0,
  },
  {
    file: 'online-learning',
    title: 'Учёба онлайн',
    format: { width: 1000, height: 1000 },
    palette: 'peach',
    background: 'corner-L',
    intent: {
      items: [
        item('book', 'hero'),
        item('phone', 'support'),
        item('headphones', 'support'),
        item('lamp', 'backdrop'),
      ],
      rationale: 'Книга — учёба, телефон и наушники — уроки онлайн, лампа — вечер за занятиями.',
    },
    variant: 0,
  },
  {
    file: 'quiet-focus',
    title: 'Тишина для фокуса',
    format: { width: 800, height: 1200 },
    palette: 'mint',
    background: 'confetti-L',
    intent: {
      items: [item('headphones', 'hero'), item('vase', 'support'), item('lamp', 'backdrop')],
      rationale: 'Наушники отрезают шум, ваза и лампа — спокойный рабочий угол.',
    },
    variant: 1,
  },
];

const json = <T>(file: string) => JSON.parse(readFileSync(join(LIB, 'data', file), 'utf8')) as T;

async function main() {
  const palettes = json<Palette[]>('palettes.json');
  const lib = createLibrary(
    json<LibraryManifest>('manifest.json'),
    palettes,
    json<LayoutTemplate[]>('templates.json'),
    (file) => readFileSync(join(LIB, file), 'utf8'),
    json<Record<string, AssetMask>>('masks.json'),
  );

  const browser = await chromium.launch();
  for (const ex of EXAMPLES) {
    const palette = palettes.find((p) => p.id === ex.palette);
    if (!palette) throw new Error(`${ex.file}: no palette ${ex.palette}`);
    const scene = composeScene(
      ex.intent,
      {
        format: ex.format,
        detail: 'L',
        palette,
        backgroundPresetId: ex.background,
        variant: ex.variant,
      },
      lib,
    );
    const overlaps = sceneCollisions(scene, lib);
    if (overlaps.length) throw new Error(`${ex.file}: items overlap: ${JSON.stringify(overlaps)}`);
    const violations = validateScene(scene, lib);
    if (violations.length) throw new Error(`${ex.file}: ${JSON.stringify(violations)}`);

    const svg = exportScene(scene, lib);
    writeFileSync(join(OUT, `${ex.file}.svg`), svg);

    // the preview is Chromium's rendering of the exported file itself, at its own size
    const page = await browser.newPage({ viewport: ex.format });
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    await page.screenshot({ path: join(OUT, `${ex.file}.png`) });
    await page.close();
    console.log(`${ex.file}: ${ex.format.width}×${ex.format.height}, ${ex.palette}`);
  }
  await browser.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
