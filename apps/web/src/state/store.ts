import {
  addItem,
  composeScene,
  createHistory,
  duplicateNode,
  flipNode,
  moveNode,
  placeDecor,
  push,
  redo as redoHistory,
  removeNode,
  reorderNode,
  resolvePresetForDetail,
  rotateNode,
  setBackground as setBackgroundOp,
  setDetail as setDetailOp,
  setFormat as setFormatOp,
  setGlobalScale,
  setNodeState,
  setPalette as setPaletteOp,
  setSlotMap as setSlotMapOp,
  undo as undoHistory,
  type CompositionIntent,
  type DetailSize,
  type Format,
  type History,
  type ItemId,
  type ItemState,
  type LoadedLibrary,
  type ObjectSlot,
  type Palette,
  type Scene,
  type SceneNode,
} from '@ic/core';
import { create } from 'zustand';
import { isSafePalette } from '../palette/customPalettes';

/** Live gestures (drag, rotate, scale slider) send `commit: false` while moving, `true` at the end. */
export interface GestureOptions {
  commit?: boolean;
}

export type LayerDirection = 'up' | 'down' | 'top' | 'bottom';

/** The last composition: what a format change re-lays while the user has not edited it. */
export interface Composition {
  intent: CompositionIntent;
  template: number;
  /** Upper bound of the scene scale (share of the example size); see ComposeOptions.maxFit. */
  maxFit?: number;
  /** Node lists this composition produced (per format); an edit or a new compose replaces them. */
  layouts: WeakSet<SceneNode[]>;
}

export interface EditorState {
  history: History;
  selectedId: string | null;
  library: LoadedLibrary | null;
  /** Scene before the running gesture; null when no gesture is in progress. */
  gestureBase: Scene | null;
  composition: Composition | null;

  setLibrary: (lib: LoadedLibrary) => void;
  select: (id: string | null) => void;
  add: (item: ItemId, state: ItemState, at?: { x: number; y: number }) => void;
  move: (id: string, x: number, y: number, opts?: GestureOptions) => void;
  rotate: (id: string, deg: number, opts?: GestureOptions) => void;
  flip: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  reorder: (id: string, dir: LayerDirection) => void;
  /** Moves a node to z-index `index` (0 = bottom, clamped): one history step. */
  moveTo: (id: string, index: number) => void;
  setState: (id: string, state: ItemState) => void;
  setSlotMap: (id: string, map: Partial<Record<ObjectSlot, ObjectSlot>> | undefined) => void;
  setScale: (k: number, opts?: GestureOptions) => void;
  /**
   * Changes the frame. An untouched composition is re-composed for the new format (same intent
   * and template); any other scene is transformed, keeping the relative scale %.
   */
  setFormat: (f: Format) => void;
  /** Switch S/L. The caller loads the assets of `size` first (see `ensureDetail`). */
  setDetail: (size: DetailSize) => void;
  /** Applies only palettes of plain `#RRGGBB` slots (see customPalettes.ts). */
  setPalette: (p: Palette) => void;
  setBackground: (presetId: string | null) => void;
  replaceScene: (scene: Scene) => void;
  /** Lays `intent` out with the scene's format, detail, palette and background: one step. */
  compose: (intent: CompositionIntent, template: number, maxFit?: number) => void;
  /** Ends a running gesture: one history step, or none if the scene came back unchanged. */
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
}

export const DEFAULT_FORMAT: Format = { width: 1000, height: 1000 };
/**
 * 100 % relative scale: the default square is as wide as the designer's square examples, so
 * hand-added items come out at the size a composed scene gives them at fit 1.
 */
export const DEFAULT_SCALE = 1;

export function createInitialScene(palette: Palette): Scene {
  return {
    format: { ...DEFAULT_FORMAT },
    detail: 'L',
    palette,
    backgroundPresetId: null,
    globalScale: DEFAULT_SCALE,
    nodes: [],
  };
}

/**
 * Re-lays the background decor: drops all decor nodes and places the preset's decor
 * (resolved to the scene's detail) under the items, for the current format. Decor ignores
 * globalScale: it frames the canvas, not the items (D7).
 */
export function relayDecor(scene: Scene, lib: LoadedLibrary | null): Scene {
  const items = scene.nodes.filter((n) => n.ref.kind === 'item');
  const presetId =
    scene.backgroundPresetId && lib
      ? resolvePresetForDetail(scene.backgroundPresetId, scene.detail, lib.manifest)
      : null;
  const preset = presetId ? lib?.manifest.backgrounds.find((b) => b.id === presetId) : undefined;
  const decor = preset && lib ? placeDecor(preset, scene.format, lib) : [];
  return { ...scene, backgroundPresetId: presetId, nodes: [...decor, ...items] };
}

/**
 * True when the decor on the canvas is not what the preset lays out for this scene, i.e. the
 * user moved, rotated or deleted decor. Rebuilding the decor would then lose those edits.
 */
export function decorEdited(scene: Scene, lib: LoadedLibrary | null): boolean {
  if (!lib || scene.backgroundPresetId === null) return false;
  const decorOf = (s: Scene) => s.nodes.filter((n) => n.ref.kind === 'decor');
  return JSON.stringify(decorOf(scene)) !== JSON.stringify(decorOf(relayDecor(scene, lib)));
}

/** Structural equality: a gesture that returns to its start leaves an equal, not identical, scene. */
export function sameScene(a: Scene, b: Scene): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

const exists = (scene: Scene, id: string | null) =>
  id !== null && scene.nodes.some((n) => n.id === id);

// Placeholder palette until the library loads; replaced in setLibrary.
const BOOT_PALETTE: Palette = {
  id: 'boot',
  name: '',
  slots: {
    bg1: '#EDEDF0',
    bg2: '#D9D9DE',
    bg3: '#8B8B94',
    obj1: '#FFFFFF',
    obj2: '#FFFFFF',
    obj3: '#FFFFFF',
    ink: '#18181B',
    paper: '#FFFFFF',
  },
};

export const useEditor = create<EditorState>()((set, get) => {
  /** Pushes `next` as one history step; a running gesture is folded into it. */
  const commit = (next: Scene, selectedId?: string | null) => {
    const { history, gestureBase } = get();
    const base = gestureBase ? { ...history, present: gestureBase } : history;
    const nextHistory = push(base, next);
    set({
      history: nextHistory,
      gestureBase: null,
      ...(selectedId !== undefined ? { selectedId } : {}),
    });
  };

  /** Applies `f` live (no history) during a gesture, or as a step when `commit` is not false. */
  const gesture = (f: (s: Scene) => Scene, opts?: GestureOptions) => {
    const { history, gestureBase } = get();
    const next = f(history.present);
    if (opts?.commit === false) {
      set({ history: { ...history, present: next }, gestureBase: gestureBase ?? history.present });
      return;
    }
    finish(next);
  };

  /** Records `next`; when a gesture is running and `next` equals its start, records nothing. */
  const finish = (next: Scene) => {
    const { history, gestureBase } = get();
    if (gestureBase && sameScene(next, gestureBase)) {
      set({ history: { ...history, present: gestureBase }, gestureBase: null });
      return;
    }
    commit(next);
  };

  const apply = (f: (s: Scene) => Scene) => commit(f(get().history.present));

  /** Composes `c` with the format, detail, palette and background of `s`; one history step. */
  const layOut = (c: Composition, s: Scene, lib: LoadedLibrary) => {
    const next = composeScene(
      c.intent,
      {
        format: s.format,
        detail: s.detail,
        palette: s.palette,
        backgroundPresetId: s.backgroundPresetId,
        variant: c.template,
        maxFit: c.maxFit,
      },
      lib,
    );
    c.layouts.add(next.nodes);
    set({ composition: c });
    commit(next, null);
  };

  const travel = (step: (h: History) => History) => {
    // a running gesture (e.g. an arrow-key nudge) becomes its own step first, so undo reverts it
    if (get().gestureBase) finish(get().history.present);
    const { history, selectedId } = get();
    const next = step(history);
    set({
      history: next,
      selectedId: exists(next.present, selectedId) ? selectedId : null,
    });
  };

  return {
    history: createHistory(createInitialScene(BOOT_PALETTE)),
    selectedId: null,
    library: null,
    gestureBase: null,
    composition: null,

    setLibrary: (lib) => {
      const present = get().history.present;
      const palette = present.palette.id === BOOT_PALETTE.id ? lib.palettes[0] : undefined;
      set({
        library: lib,
        // the boot scene is not an edit: swap its palette in place, not as a history step
        ...(palette ? { history: createHistory({ ...present, palette }) } : {}),
      });
    },

    select: (id) => set({ selectedId: exists(get().history.present, id) ? id : null }),

    add: (item, state, at) => {
      const next = addItem(get().history.present, item, state, at);
      commit(next, next.nodes[next.nodes.length - 1]!.id);
    },

    move: (id, x, y, opts) => gesture((s) => moveNode(s, id, x, y), opts),
    rotate: (id, deg, opts) => gesture((s) => rotateNode(s, id, deg), opts),
    flip: (id) => apply((s) => flipNode(s, id)),

    duplicate: (id) => {
      const s = get().history.present;
      const i = s.nodes.findIndex((n) => n.id === id);
      if (i < 0) return;
      const next = duplicateNode(s, id);
      commit(next, next.nodes[i + 1]!.id);
    },

    remove: (id) => {
      const next = removeNode(get().history.present, id);
      commit(next, get().selectedId === id ? null : get().selectedId);
    },

    reorder: (id, dir) => apply((s) => reorderNode(s, id, dir)),
    moveTo: (id, index) => {
      const s = get().history.present;
      const from = s.nodes.findIndex((n) => n.id === id);
      const to = Math.max(0, Math.min(s.nodes.length - 1, Math.round(index)));
      if (from < 0 || from === to) return;
      const nodes = s.nodes.slice();
      const [node] = nodes.splice(from, 1);
      nodes.splice(to, 0, node!);
      commit({ ...s, nodes });
    },
    setState: (id, state) => apply((s) => setNodeState(s, id, state)),
    setSlotMap: (id, map) => apply((s) => setSlotMapOp(s, id, map)),

    // decor frames the canvas and depends only on the format (D7): the slider never moves it
    setScale: (k, opts) => gesture((s) => setGlobalScale(s, k), opts),

    setFormat: (f) => {
      const { history, library, composition } = get();
      if (library && composition?.layouts.has(history.present.nodes)) {
        layOut(composition, { ...history.present, format: { ...f } }, library);
        return;
      }
      apply((s) => relayDecor(setFormatOp(s, f, library), library));
    },

    setDetail: (size) => {
      const lib = get().library;
      if (!lib) return;
      apply((s) => {
        const next = setDetailOp(s, size);
        return next === s ? s : relayDecor(next, lib);
      });
    },

    setPalette: (p) => {
      if (!isSafePalette(p)) {
        console.warn('Палитра отклонена: места должны быть цветами #RRGGBB');
        return;
      }
      apply((s) => setPaletteOp(s, p));
    },
    setBackground: (presetId) =>
      apply((s) => relayDecor(setBackgroundOp(s, presetId), get().library)),

    replaceScene: (scene) => commit(scene, null),
    compose: (intent, template, maxFit) => {
      const { history, library, composition } = get();
      if (!library) return;
      const same =
        composition?.intent === intent &&
        composition.template === template &&
        composition.maxFit === maxFit;
      const next = same
        ? composition
        : { intent, template, maxFit, layouts: new WeakSet<SceneNode[]>() };
      layOut(next, history.present, library);
    },
    endGesture: () => {
      if (get().gestureBase) finish(get().history.present);
    },
    undo: () => travel(undoHistory),
    redo: () => travel(redoHistory),
  };
});
