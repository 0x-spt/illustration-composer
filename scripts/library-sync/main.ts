/**
 * `FIGMA_TOKEN=… npm run library:sync`
 * Figma file → SVG assets + manifest/palettes/templates + PNG previews + sync-report.md
 * in packages/library. Exit code 1 when a configured node is missing.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ITEM_IDS,
  OBJECT_SLOTS,
  SLOT_NAMES,
  type AssetFile,
  type BackgroundPreset,
  type DecorDef,
  type DetailSize,
  type ItemDef,
  type ItemId,
  type ItemState,
  type LayoutTemplate,
  type LibraryManifest,
  type Palette,
} from '@ic/core';
import { buildColorMap, collectColors, type ColorMapResult } from './colors';
import { extractDecor, readPalette, solidFill, type DecorPlacement } from './decor';
import { createFigmaClient, indexNodes, nodeColors, type FigmaFile, type FigmaNode } from './figma';
import {
  BACKGROUND_FRAMES,
  COLOR_THRESHOLD,
  EXAMPLE_FRAME_NAME,
  EXAMPLES_SECTION,
  FIGMA_FILE_KEY,
  ITEMS,
  PALETTE_SWATCHES,
  SPEC_PALETTES,
} from './library.config';
import { exportJsonImageSource, restImageSource, type ImageSource } from './images';
import { normalizeSvg } from './normalize';
import { analyzeExample, type ExampleAnalysis } from './templates';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const LIB = join(ROOT, 'packages/library');
const SIZES: DetailSize[] = ['L', 'S'];
const STATES: ItemState[] = ['main', 'background'];
const PREVIEW_SCALE = 0.5;

interface ExportJob {
  nodeId: string;
  assetId: string;
  file: string;
  /** Background-ish assets (background state, decor) may not use obj* slots. */
  backgroundOnly: boolean;
  fallbackPalette?: string;
}

function svgRoot(svg: string) {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const attr = (n: string) => new RegExp(`\\s${n}="([^"]*)"`).exec(root)?.[1];
  const width = Number(attr('width'));
  const height = Number(attr('height'));
  const viewBox = attr('viewBox') ?? `0 0 ${width} ${height}`;
  if (!Number.isFinite(width) || !Number.isFinite(height))
    throw new Error('SVG without width/height');
  return { width, height, viewBox };
}

function write(rel: string, data: string | Uint8Array) {
  const abs = join(LIB, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, data);
}

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const fmt = (n: number) => String(Math.round(n * 100) / 100);

async function main() {
  // GET /v1/files and /v1/images are heavily rate-limited on Figma's lower plans (days-long
  // retry-after). FIGMA_FILE_JSON=<saved tree> replaces the file call, FIGMA_EXPORT_JSON=<plugin
  // export> replaces the images calls; with both set the run makes no network calls at all.
  // `--from-plugin` (npm run library:sync:plugin) defaults both inputs to .figma-export/.
  const fromPlugin = process.argv.includes('--from-plugin');
  const exportDir = join(ROOT, '.figma-export');
  const cachedTree =
    process.env.FIGMA_FILE_JSON ??
    (fromPlugin && existsSync(join(exportDir, 'figma-file.json'))
      ? join(exportDir, 'figma-file.json')
      : undefined);
  const exportJson =
    process.env.FIGMA_EXPORT_JSON ??
    (fromPlugin ? join(exportDir, 'figma-export.json') : undefined);
  const token = process.env.FIGMA_TOKEN;
  if ((!cachedTree || !exportJson) && !token) {
    console.error(
      'FIGMA_TOKEN is not set (needed unless both FIGMA_FILE_JSON and FIGMA_EXPORT_JSON are given)',
    );
    process.exitCode = 2;
    return;
  }
  const figma = token ? createFigmaClient({ token, log: (m) => console.log(`  ${m}`) }) : null;
  const images: ImageSource = exportJson
    ? exportJsonImageSource(exportJson, FIGMA_FILE_KEY)
    : restImageSource(figma!, FIGMA_FILE_KEY);
  const missing: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  // 1. file
  console.log(cachedTree ? `· file (saved tree ${cachedTree})` : '· file');
  const file: FigmaFile = cachedTree
    ? (JSON.parse(readFileSync(cachedTree, 'utf8')) as FigmaFile)
    : await figma!.getFile(FIGMA_FILE_KEY);
  notes.push(
    `Дерево файла: ${cachedTree ? 'сохранённый ответ GET /v1/files' : 'Figma REST /v1/files'} (версия ${file.version}). SVG и PNG: ${images.label}.`,
  );
  const idx = indexNodes(file.document);
  const need = (id: string, what: string): FigmaNode | undefined => {
    const n = idx.get(id);
    if (!n) missing.push(`${id} (${what}) не найден`);
    return n;
  };

  // palettes: read by grid position, checked against the spec table
  for (const sw of PALETTE_SWATCHES) {
    const spec = SPEC_PALETTES.find((p) => p.id === sw.id)!;
    for (const size of SIZES) {
      const g = need(sw[size], `палитра ${sw.id} ${size}`);
      if (!g) continue;
      const read = readPalette(g, sw.id, sw.name);
      for (const s of SLOT_NAMES) {
        if (read.slots[s] !== spec.slots[s]) {
          errors.push(
            `палитра ${sw.id} ${size} (${sw[size]}): место ${s} = ${read.slots[s]}, в спеке ${spec.slots[s]}`,
          );
        }
      }
    }
  }
  const palettes: Palette[] = SPEC_PALETTES;

  // item nodes
  const jobs: ExportJob[] = [];
  for (const item of ITEM_IDS) {
    const cfg = ITEMS[item];
    for (const size of SIZES) {
      for (const state of STATES) {
        const nodeId = cfg.nodes[size][state];
        const n = need(nodeId, `${item} ${size} ${state}`);
        if (!n) continue;
        if (!cfg.figmaNames.includes(n.name)) {
          warnings.push(
            `${item} ${size} ${state} (${nodeId}) называется «${n.name}», ожидалось одно из ${cfg.figmaNames.join(', ')}`,
          );
        }
        jobs.push({
          nodeId,
          assetId: `${item}-${size}-${state}`,
          file: `assets/${size}/${item}.${state}.svg`,
          backgroundOnly: state === 'background',
        });
      }
    }
  }

  // background frames → presets + decor placements
  const placements: DecorPlacement[] = [];
  const backgrounds: BackgroundPreset[] = [];
  const bgFrameInfo: string[] = [];
  for (const bf of BACKGROUND_FRAMES) {
    const frame = need(bf.node, `фон ${bf.size}`);
    if (!frame) continue;
    const fill = solidFill(frame);
    const frameColors = buildColorMap(nodeColors(frame), palettes, COLOR_THRESHOLD);
    const fillSlot = fill ? frameColors.colorMap[fill] : undefined;
    if (fillSlot !== 'bg1') {
      errors.push(
        `фон ${bf.node}: заливка ${fill} попадает в место ${fillSlot ?? '—'}, а должна в bg1`,
      );
    }
    bgFrameInfo.push(
      `| ${bf.node} | ${bf.size} | ${frame.absoluteBoundingBox?.width}×${frame.absoluteBoundingBox?.height} | ${fill} → ${fillSlot} (${frameColors.sourcePalette}) | ${bf.preset ?? '— (не выгружается)'} | ${bf.note ?? ''} |`,
    );
    if (!bf.preset) continue;
    const decor = extractDecor(frame, bf.preset, bf.size);
    placements.push(...decor);
    backgrounds.push({
      id: bf.preset,
      label: bf.label,
      size: bf.size,
      frameSize: frame.absoluteBoundingBox!.width,
      decorIds: decor.map((d) => d.id),
    });
    for (const d of decor) {
      jobs.push({
        nodeId: d.nodeId,
        assetId: d.id,
        file: `assets/decor/${d.id}.svg`,
        backgroundOnly: true,
        fallbackPalette: frameColors.sourcePalette,
      });
    }
  }

  // examples
  const section = need(EXAMPLES_SECTION, 'секция примеров');
  const exampleFrames = (section?.children ?? []).filter(
    (c) => c.type === 'FRAME' && c.name === EXAMPLE_FRAME_NAME,
  );

  if (missing.length > 0) {
    writeReport({
      missing,
      errors,
      warnings,
      notes,
      file,
      assets: [],
      bgFrameInfo,
      templates: [],
      backgrounds,
      decorCount: 0,
    });
    console.error(missing.join('\n'));
    process.exitCode = 1;
    return;
  }

  // 2–4. export → normalise → colours
  console.log(`· export ${jobs.length} SVG`);
  const raw = await images.svgs(jobs.map((j) => j.nodeId));
  for (const dir of ['assets', 'previews'])
    rmSync(join(LIB, dir), { recursive: true, force: true });
  const assets = new Map<string, { asset: AssetFile; job: ExportJob; colors: ColorMapResult }>();
  for (const job of jobs) {
    const svg = normalizeSvg(raw[job.nodeId]!, { idPrefix: job.assetId });
    for (const bad of ['<image', '<foreignObject', '<style', 'filter=', '<filter', 'var(']) {
      if (svg.includes(bad)) errors.push(`${job.file}: содержит ${bad}`);
    }
    const colors = buildColorMap(
      collectColors(svg),
      palettes,
      COLOR_THRESHOLD,
      job.fallbackPalette,
    );
    if (job.backgroundOnly) {
      const objUse = Object.entries(colors.colorMap).filter(([, s]) =>
        (OBJECT_SLOTS as readonly string[]).includes(s),
      );
      if (objUse.length)
        errors.push(
          `${job.file}: фоновый ассет использует места объектов: ${objUse.map(([c, s]) => `${c}→${s}`).join(', ')}`,
        );
    }
    write(job.file, svg);
    assets.set(job.assetId, {
      job,
      colors,
      asset: {
        file: job.file,
        ...svgRoot(svg),
        sourcePalette: colors.sourcePalette,
        colorMap: colors.colorMap,
        pinned: colors.pinned,
      },
    });
  }

  // 5. manifest
  const items: ItemDef[] = ITEM_IDS.map((id: ItemId) => {
    const v = (size: DetailSize, state: ItemState) => assets.get(`${id}-${size}-${state}`)!.asset;
    const main = v('L', 'main');
    return {
      id,
      label: ITEMS[id].label,
      nominalWidth: main.width,
      nominalHeight: main.height,
      stacking: ITEMS[id].stacking,
      variants: {
        L: { main, background: v('L', 'background') },
        S: { main: v('S', 'main'), background: v('S', 'background') },
      },
    };
  });
  // 6. decor
  const decor: DecorDef[] = placements.map((p) => ({
    id: p.id,
    preset: p.preset,
    size: p.size,
    asset: assets.get(p.id)!.asset,
    anchor: p.anchor,
  }));
  for (const p of placements) {
    const a = assets.get(p.id)!.asset;
    if (Math.abs(a.width - p.box.width) > 2 || Math.abs(a.height - p.box.height) > 2) {
      warnings.push(
        `декор ${p.id}: SVG ${a.width}×${a.height}, бокс узла ${fmt(p.box.width)}×${fmt(p.box.height)}`,
      );
    }
  }
  const manifest: LibraryManifest = {
    version: 1,
    figmaFileKey: FIGMA_FILE_KEY,
    syncedAt: new Date().toISOString(),
    items,
    decor,
    backgrounds,
  };

  // 7. templates
  const analyses: ExampleAnalysis[] = exampleFrames.map((f) =>
    analyzeExample(f, manifest, { palettes }),
  );
  const templates: LayoutTemplate[] = analyses.map((a) => a.template);
  for (const a of analyses) {
    if (a.items.length === 0) warnings.push(`пример ${a.template.sourceFrame}: ни одного предмета`);
    for (const r of a.items) {
      if (Math.abs(r.scale - 1) > 0.02)
        warnings.push(`пример ${a.template.sourceFrame}: ${r.item} в масштабе ${r.scale}`);
    }
  }

  write('data/manifest.json', json(manifest));
  write('data/palettes.json', json(palettes));
  write('data/templates.json', json(templates));

  // 8. previews
  const previewJobs: Array<{ nodeId: string; file: string }> = [
    ...jobs
      .filter((j) => !j.file.startsWith('assets/decor/'))
      .map((j) => ({
        nodeId: j.nodeId,
        file: j.file.replace(/^assets\//, 'previews/').replace(/\.svg$/, '.png'),
      })),
    ...BACKGROUND_FRAMES.map((b) => ({
      nodeId: b.node,
      file: `previews/backgrounds/${b.size}-${b.node.replace(':', '-')}.png`,
    })),
  ];
  console.log(`· previews ${previewJobs.length} PNG`);
  const pngs = await images.pngs(
    previewJobs.map((p) => p.nodeId),
    PREVIEW_SCALE,
  );
  for (const p of previewJobs) write(p.file, pngs[p.nodeId]!);

  // 9. report
  writeReport({
    missing,
    errors,
    warnings,
    notes,
    file,
    assets: [...assets.values()],
    bgFrameInfo,
    templates: analyses,
    backgrounds,
    decorCount: decor.length,
  });
  console.log(
    `✓ ${items.length * 4} item files, ${decor.length} decor, ${backgrounds.length} presets, ${templates.length} templates; ${errors.length} errors, ${warnings.length} warnings`,
  );
  if (errors.length) process.exitCode = 3;
}

interface ReportInput {
  missing: string[];
  errors: string[];
  warnings: string[];
  notes: string[];
  file: { name: string; version: string; lastModified: string };
  assets: Array<{ asset: AssetFile; job: ExportJob; colors: ColorMapResult }>;
  bgFrameInfo: string[];
  templates: ExampleAnalysis[];
  backgrounds: BackgroundPreset[];
  decorCount: number;
}

function writeReport(r: ReportInput) {
  const L: string[] = [];
  const list = (xs: string[], empty: string) =>
    xs.length ? xs.map((x) => `- ${x}`) : [`- ${empty}`];
  L.push('# Отчёт синхронизации библиотеки', '');
  L.push('Сгенерировано `npm run library:sync`. Не редактировать руками.', '');
  L.push(
    `- Файл Figma: «${r.file.name}» \`${FIGMA_FILE_KEY}\`, версия ${r.file.version}, изменён ${r.file.lastModified}`,
  );
  L.push(`- Порог ΔE (CIEDE2000) для привязки цветов вне палитры: **${COLOR_THRESHOLD}**`);
  const itemFiles = r.assets.filter((a) => !a.job.file.startsWith('assets/decor/')).length;
  L.push(
    `- Файлов предметов: **${itemFiles}**, элементов декора: **${r.decorCount}**, пресетов подложки: **${r.backgrounds.length}**, шаблонов: **${r.templates.length}**`,
    '',
  );

  L.push('## Узлы', '', ...list(r.missing, 'все узлы из конфига на месте'), '');
  L.push('## Ошибки', '', ...list(r.errors, 'нет'), '');
  L.push('## Предупреждения', '', ...list(r.warnings, 'нет'), '');

  L.push('## Цвета вне палитры', '');
  const approx = new Map<string, { slot: string; de: number; files: string[] }>();
  const pinned = new Map<string, { nearest: string; de: number; files: string[] }>();
  for (const a of r.assets) {
    for (const x of a.colors.approximations) {
      const e = approx.get(x.color) ?? { slot: x.slot, de: x.deltaE, files: [] };
      e.files.push(a.job.file);
      approx.set(x.color, e);
    }
    for (const x of a.colors.pinnedDetails) {
      const e = pinned.get(x.color) ?? { nearest: x.nearest, de: x.deltaE, files: [] };
      e.files.push(a.job.file);
      pinned.set(x.color, e);
    }
  }
  L.push('Привязаны к ближайшему месту (ΔE ≤ порога, перекрашиваются вместе с местом):', '');
  L.push(
    ...(approx.size
      ? [...approx].map(
          ([c, e]) => `- \`${c}\` → ${e.slot} (ΔE ${e.de.toFixed(2)}): ${e.files.join(', ')}`,
        )
      : ['- нет']),
    '',
  );
  L.push('Закреплены (ΔE > порога, не перекрашиваются):', '');
  L.push(
    ...(pinned.size
      ? [...pinned].map(
          ([c, e]) =>
            `- \`${c}\` (ближайшее ${e.nearest}, ΔE ${e.de.toFixed(2)}): ${e.files.join(', ')}`,
        )
      : ['- нет']),
    '',
  );

  L.push(
    '## Ассеты',
    '',
    '| Файл | Узел | Размер | Схема | Места | Закреплены |',
    '|---|---|---|---|---|---|',
  );
  for (const a of r.assets) {
    const slots = [...new Set(Object.values(a.asset.colorMap))].sort(
      (x, y) => SLOT_NAMES.indexOf(x) - SLOT_NAMES.indexOf(y),
    );
    L.push(
      `| ${a.job.file} | ${a.job.nodeId} | ${a.asset.width}×${a.asset.height} | ${a.asset.sourcePalette} | ${slots.join(' ')} | ${a.asset.pinned.join(' ')} |`,
    );
  }
  L.push('');

  L.push(
    '## Подложки',
    '',
    '| Фрейм | Размер | Кадр | Заливка → место (схема) | Пресет | Примечание |',
    '|---|---|---|---|---|---|',
    ...r.bgFrameInfo,
    '',
  );
  L.push(
    ...r.backgrounds.map(
      (b) => `- \`${b.id}\` «${b.label}» ${b.size}, кадр ${b.frameSize}: ${b.decorIds.join(', ')}`,
    ),
    '',
  );
  L.push('## Решения', '', ...list(r.notes, 'нет'), '');

  L.push(
    '## Шаблоны',
    '',
    '| Шаблон | Кадр | Масштаб примера | Предметы (роль, состояние, размер, масштаб) | Пропущено |',
    '|---|---|---|---|---|',
  );
  for (const a of r.templates) {
    const t = a.template;
    const its = a.items
      .map((i) => `${i.item}: ${i.slot.role}, ${i.state}, ${i.size}, ×${i.scale}`)
      .join('; ');
    L.push(
      `| ${t.id} | ${t.aspect} ${t.frame.width}×${t.frame.height} | ${t.scale} | ${its} | ${a.ignored.length} |`,
    );
  }
  L.push('');
  write('sync-report.md', `${L.join('\n')}\n`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
