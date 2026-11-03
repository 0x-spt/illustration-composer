import type { DetailSize, ItemId, ItemState, Palette, Stacking } from '@ic/core';

/** Figma file the library is synced from (spec §2). Token comes from env FIGMA_TOKEN only. */
export const FIGMA_FILE_KEY = 'aOU1ip0vht8BGoNJi2e0dc';

/**
 * ΔE (CIEDE2000) above which an off-palette colour stays pinned. 8 (D2) binds the
 * vase tint #EEE2F6 to bg1 (ΔE 7.94); greys such as #757575 and #D9D9D9 (8.08) stay pinned.
 */
export const COLOR_THRESHOLD = 8;

export interface ItemConfig {
  label: string;
  /**
   * Names the item's group carries in Figma: the layer name of the named groups
   * and the `Group 21361363xx` names of the unnamed ones (spec §2 table).
   */
  figmaNames: string[];
  nodes: Record<DetailSize, Record<ItemState, string>>;
  /** D13: read off the designer's examples (a phone lies on the book, a coin on the wallet). */
  stacking: Stacking;
}

/** Spec §2 node table. */
export const ITEMS: Record<ItemId, ItemConfig> = {
  book: {
    label: 'Книга',
    stacking: 'surface',
    figmaNames: ['Книга', 'Group 2136136335', 'Group 2136136341'],
    nodes: {
      L: { main: '21:29965', background: '24:6273' },
      S: { main: '24:3810', background: '24:6934' },
    },
  },
  phone: {
    label: 'Телефон',
    stacking: 'flat',
    figmaNames: ['Телефон'],
    nodes: {
      L: { main: '21:25472', background: '24:6327' },
      S: { main: '24:4746', background: '24:6990' },
    },
  },
  puzzle: {
    label: 'Пазлы',
    stacking: 'flat',
    figmaNames: ['Пазлы'],
    nodes: {
      L: { main: '21:417', background: '24:6214' },
      S: { main: '24:4903', background: '24:7147' },
    },
  },
  coin: {
    label: 'Монета',
    stacking: 'flat',
    figmaNames: ['Монета'],
    nodes: {
      L: { main: '24:2207', background: '24:6795' },
      S: { main: '24:5345', background: '24:7205' },
    },
  },
  headphones: {
    label: 'Наушники',
    stacking: 'standing',
    figmaNames: ['Наушники'],
    nodes: {
      L: { main: '23:122', background: '24:6484' },
      S: { main: '24:5089', background: '24:7344' },
    },
  },
  lamp: {
    label: 'Лампа',
    stacking: 'standing',
    figmaNames: ['Лампа'],
    nodes: {
      L: { main: '23:121', background: '24:6569' },
      S: { main: '24:5485', background: '24:7429' },
    },
  },
  vase: {
    label: 'Ваза с тюльпанами',
    stacking: 'standing',
    figmaNames: ['Group 2136136344', 'Group 2136136345', 'Group 2136136346', 'Group 2136136347'],
    nodes: {
      L: { main: '28:11628', background: '30:11902' },
      S: { main: '28:11629', background: '28:11766' },
    },
  },
  wallet: {
    label: 'Кошелёк',
    stacking: 'surface',
    figmaNames: ['Кошелек', 'Кошелёк'],
    nodes: {
      L: { main: '23:211', background: '24:6660' },
      S: { main: '24:4594', background: '24:7568' },
    },
  },
  folder: {
    label: 'Папка',
    stacking: 'surface',
    figmaNames: ['Папка', 'Group 2136136337', 'Group 2136136342'],
    nodes: {
      L: { main: '24:1899', background: '24:6772' },
      S: { main: '24:4430', background: '24:7520' },
    },
  },
  pen: {
    label: 'Ручка',
    stacking: 'flat',
    figmaNames: ['Ручка', 'Group 2136136336', 'Group 2136136343'],
    nodes: {
      L: { main: '24:1734', background: '24:6747' },
      S: { main: '24:4287', background: '24:7543' },
    },
  },
};

/** Figma layer name → item, used to recognise copies in the example frames. */
export const NAME_TO_ITEM: Record<string, ItemId> = Object.fromEntries(
  (Object.entries(ITEMS) as Array<[ItemId, ItemConfig]>).flatMap(([id, c]) =>
    c.figmaNames.map((n) => [n, id] as const),
  ),
);

/**
 * Palette swatch groups: a 2×4 grid, left column «Цвета фона» (bg1..bg3, ink),
 * right column «Цвета объектов» (obj1..obj3, paper). Slots are read by grid position.
 */
export const PALETTE_SWATCHES: Array<{ id: string; name: string; L: string; S: string }> = [
  { id: 'lilac', name: 'Сиреневая', L: '21:29569', S: '24:6124' },
  { id: 'peach', name: 'Персиковая', L: '21:29570', S: '24:6133' },
  { id: 'mint', name: 'Бирюзовая', L: '21:29579', S: '24:6142' },
];

/** Spec §2 palette table — the sync checks the Figma swatches against it. */
export const SPEC_PALETTES: Palette[] = [
  {
    id: 'lilac',
    name: 'Сиреневая',
    slots: {
      bg1: '#D7CDF5',
      bg2: '#AA9BF0',
      bg3: '#7864D7',
      obj1: '#F9ECB0',
      obj2: '#F9A3AA',
      obj3: '#FFE3E1',
      ink: '#181817',
      paper: '#FFFFFF',
    },
  },
  {
    id: 'peach',
    name: 'Персиковая',
    slots: {
      bg1: '#FDD7B9',
      bg2: '#FAC896',
      bg3: '#D27532',
      obj1: '#F9ECB0',
      obj2: '#80DADA',
      obj3: '#BEEBEB',
      ink: '#181817',
      paper: '#FFFFFF',
    },
  },
  {
    id: 'mint',
    name: 'Бирюзовая',
    slots: {
      bg1: '#BEEBEB',
      bg2: '#80DADA',
      bg3: '#5ABEBE',
      obj1: '#FFD4F2',
      obj2: '#6D7BFC',
      obj3: '#B6C6FE',
      ink: '#181817',
      paper: '#FFFFFF',
    },
  },
];

export interface BackgroundFrameConfig {
  node: string;
  size: DetailSize;
  /** Preset id; `null` = a duplicate of another frame, not exported (reason in `note`). */
  preset: string | null;
  label: string;
  note?: string;
}

/**
 * «Фон» frames (spec §2/§5.9). Decided from the file (see sync-report.md):
 * L lilac 21:25258 and L mint 21:29593 carry identical decor geometry and identical
 * slot colours (bg1 fill, bg2/bg3/paper confetti, bg3 lines), so the mint copy is
 * a duplicate. In S the lilac (24:5990) and mint (24:6055) copies differ in line
 * stroke width (2 vs 1), so both are kept; the 1 px one is halved like the rest
 * of S and becomes `confetti-S`.
 */
export const BACKGROUND_FRAMES: BackgroundFrameConfig[] = [
  { node: '21:25258', size: 'L', preset: 'confetti-L', label: 'Конфетти и линии' },
  {
    node: '21:29593',
    size: 'L',
    preset: null,
    label: 'Конфетти и линии (бирюзовая копия)',
    note: 'дубликат 21:25258: та же геометрия декора и те же места цветов',
  },
  { node: '21:25399', size: 'L', preset: 'corner-L', label: 'Угол и линии' },
  {
    node: '24:5990',
    size: 'S',
    preset: 'confetti-bold-S',
    label: 'Конфетти и толстые линии',
    note: 'та же геометрия, что у 24:6055, но толщина линий 2 (как в L) вместо 1 — оставлен отдельным пресетом',
  },
  {
    node: '24:6055',
    size: 'S',
    preset: 'confetti-S',
    label: 'Конфетти и линии',
    note: 'линии 1 px — уменьшены вдвое, как во всём S (ср. 24:6120); поэтому это основной S-вариант confetti',
  },
  { node: '24:6120', size: 'S', preset: 'corner-S', label: 'Угол и линии' },
];

/** Example frames: children of this section named `Фон` (page «Примеры композиций»). */
export const EXAMPLES_SECTION = '25:11069';
export const EXAMPLE_FRAME_NAME = 'Фон';

/** Pages/frames that are explicitly not part of the library. */
export const IGNORED_NAME_PREFIXES = ['SVG-drop · '];
