import type { CompositionIntent } from '@ic/core';
import { create } from 'zustand';
import { warnDecorRebuild } from '../state/rebuild';
import { useEditor } from '../state/store';
import { ComposeError, requestIntents, type ComposeMode, type IntentResult } from './composeClient';
import {
  comboPosition,
  nextCombo,
  templateCount,
  totalCombos,
  uniqueVariants,
  type Combo,
} from './variants';

export const MAX_PROMPT = 300;

/**
 * Scene scale a names composition starts at, as a share of the example size (D13): listed
 * items are not a designed metaphor, so they start a size smaller with room between them.
 */
export const NAMES_SCENE_SCALE = 0.7;

const maxFitFor = (mode: ComposeMode) => (mode === 'names' ? NAMES_SCENE_SCALE : undefined);

interface ComposeState {
  text: string;
  mode: ComposeMode;
  busy: boolean;
  /** Last answer; null before the first «Собрать». */
  result: IntentResult | null;
  /** Text the result was built from (the document name in the header). */
  composedText: string;
  /** Mode the result was built in: «Другой вариант» keeps it when the toggle has moved. */
  composedMode: ComposeMode;
  combo: Combo;
  error: string | null;

  setText: (text: string) => void;
  setMode: (mode: ComposeMode) => void;
  submit: (text?: string, mode?: ComposeMode) => Promise<void>;
  /** «Другой вариант»: next template, then next variant; no new request. */
  next: () => void;
}

/** Template counts of every variant for the scene's current format. */
function countsFor(variants: CompositionIntent[]): number[] {
  const { history, library } = useEditor.getState();
  if (!library) return variants.map(() => 1);
  return variants.map((v) => templateCount(v, history.present.format, library));
}

/** Lays `intent` out with the scene's format, detail, palette and background; one history step. */
function apply(intent: CompositionIntent, template: number, mode: ComposeMode): void {
  // the new scene re-lays the decor: say so if the user had edited it
  warnDecorRebuild();
  useEditor.getState().compose(intent, template, maxFitFor(mode));
}

let inflight: AbortController | null = null;

export const useCompose = create<ComposeState>()((set, get) => ({
  text: '',
  mode: 'metaphor',
  busy: false,
  result: null,
  composedText: '',
  composedMode: 'metaphor',
  combo: { variant: 0, template: 0 },
  error: null,

  setText: (text) => set({ text: text.slice(0, MAX_PROMPT) }),
  setMode: (mode) => set({ mode }),

  submit: async (textArg, modeArg) => {
    const text = (textArg ?? get().text).trim().slice(0, MAX_PROMPT);
    const mode = modeArg ?? get().mode;
    if (!text || !useEditor.getState().library) return;
    // a newer «Собрать» supersedes the running request
    inflight?.abort();
    const ctrl = new AbortController();
    inflight = ctrl;
    set({ text, mode, busy: true, error: null });
    try {
      const raw = await requestIntents(text, mode, { signal: ctrl.signal });
      const result = { ...raw, variants: uniqueVariants(raw.variants) };
      if (ctrl.signal.aborted) return;
      inflight = null;
      set({ busy: false, result, combo: { variant: 0, template: 0 } });
      const first = result.variants[0];
      if (first) {
        apply(first, 0, mode);
        set({ composedText: text, composedMode: mode });
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      inflight = null;
      const message =
        e instanceof ComposeError
          ? e.message
          : 'Не удалось собрать иллюстрацию, попробуйте ещё раз';
      set({ busy: false, error: message });
    }
  },

  next: () => {
    const { result, combo, composedMode } = get();
    if (!result || result.variants.length === 0) return;
    const counts = countsFor(result.variants);
    const safe = {
      variant: Math.min(combo.variant, counts.length - 1),
      template: Math.min(combo.template, (counts[combo.variant] ?? 1) - 1),
    };
    const c = nextCombo(safe, counts);
    set({ combo: c });
    apply(result.variants[c.variant]!, c.template, composedMode);
  },
}));

/** «2 из 5» for the variant button, or null when there is nothing to switch to. */
export function useVariantProgress(): { position: number; total: number } | null {
  const result = useCompose((s) => s.result);
  const combo = useCompose((s) => s.combo);
  // recount when the format changes: another aspect has other templates
  useEditor((s) => s.history.present.format);
  if (!result || result.variants.length === 0) return null;
  const counts = countsFor(result.variants);
  const total = totalCombos(counts);
  return total > 1 ? { position: Math.min(comboPosition(combo, counts), total), total } : null;
}
