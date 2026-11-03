// Public API of @ic/core: what the editor, the compose-intent function and the library sync use.
// Tests import internals by path.

export { normalizeHex, type Hex } from './color/hex';
export { deltaE } from './color/distance';

export {
  ITEM_IDS,
  type AssetFile,
  type AssetMask,
  type Aspect,
  type BackgroundPreset,
  type DecorDef,
  type DetailSize,
  type ItemDef,
  type ItemId,
  type ItemState,
  type LayoutTemplate,
  type LibraryManifest,
  type Stacking,
  type TemplateSlot,
} from './library/types';
export { createLibrary, type LoadedLibrary } from './library/load';

export {
  BG_SLOTS,
  OBJECT_SLOTS,
  SLOT_NAMES,
  type ObjectSlot,
  type Palette,
  type SlotName,
} from './palette/types';
export { BUILTIN_PALETTES } from './palette/builtin';
export { parseAsePalette, parsePaletteText, type PaletteParseResult } from './palette/parse';

export {
  FORMAT_PRESETS,
  type Format,
  type NodeRef,
  type Scene,
  type SceneNode,
} from './scene/types';
export {
  MAX_SCALE,
  MIN_SCALE,
  addItem,
  duplicateNode,
  flipNode,
  moveNode,
  removeNode,
  reorderNode,
  rotateNode,
  setBackground,
  setFormat,
  setGlobalScale,
  setNodeState,
  setPalette,
  setSlotMap,
} from './scene/ops';
export { setDetail } from './scene/detail';
export { canRedo, canUndo, createHistory, push, redo, undo, type History } from './scene/history';

export {
  DEFAULT_INTENT,
  IntentResponseSchema,
  type CatalogEntry,
  type CompositionIntent,
} from './intent/schema';
export { intentFromNames, matchByNames } from './intent/byNames';
export { matchByMetaphor } from './intent/byMetaphor';

export { refWidth } from './layout/frame';
export { composeScene, countTemplateCandidates, sceneCollisions } from './layout/compose';
export { placeDecor, resolvePresetForDetail } from './layout/decor';

export {
  findNodeAsset,
  nodeScale,
  nodeTransform,
  nominalWidthOf,
  renderNodeInner,
} from './render/node';
export { exportScene, validateScene, type Violation } from './render/export';
