import type { Scene } from './types';

export const HISTORY_LIMIT = 100;

export interface History {
  past: Scene[];
  present: Scene;
  future: Scene[];
}

export function createHistory(initial: Scene): History {
  return { past: [], present: initial, future: [] };
}

export function canUndo(h: History): boolean {
  return h.past.length > 0;
}

export function canRedo(h: History): boolean {
  return h.future.length > 0;
}

export function push(h: History, scene: Scene): History {
  if (scene === h.present) return h;
  const past = [...h.past, h.present].slice(-HISTORY_LIMIT);
  return { past, present: scene, future: [] };
}

export function undo(h: History): History {
  if (!canUndo(h)) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1]!,
    future: [h.present, ...h.future],
  };
}

export function redo(h: History): History {
  if (!canRedo(h)) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0]!,
    future: h.future.slice(1),
  };
}
