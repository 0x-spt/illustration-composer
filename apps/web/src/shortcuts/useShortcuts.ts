import { useEffect } from 'react';
import { useEditor } from '../state/store';

/** Arrow nudge, scene px; with Shift ×10. */
const NUDGE = 1;
const NUDGE_SHIFT = 10;

function isTyping(target: EventTarget | null): boolean {
  return (
    typeof HTMLElement !== 'undefined' &&
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** Arrow nudges in a row are one undo step: committed this long after the last press, or on keyup. */
export const NUDGE_COMMIT_MS = 400;
let nudgeTimer: ReturnType<typeof setTimeout> | null = null;

export function commitNudge(): void {
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = null;
  useEditor.getState().endGesture();
}

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/**
 * Editor shortcuts. Keys are matched by `code`, so they work in the Russian layout too.
 * Ctrl and ⌘ are interchangeable. Returns true when the browser default must be prevented.
 */
export function handleShortcut(e: KeyboardEvent): boolean {
  if (isTyping(e.target)) return false;
  const st = useEditor.getState();
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.code === 'KeyZ') {
    if (e.shiftKey) st.redo();
    else st.undo();
    return true;
  }
  if (mod && e.code === 'KeyY') {
    st.redo();
    return true;
  }

  const id = st.selectedId;
  const node = id ? st.history.present.nodes.find((n) => n.id === id) : undefined;

  // editor commands own these keys even with nothing selected (no bookmark dialog etc.)
  if (mod && e.code === 'KeyD') {
    if (node && !e.repeat) st.duplicate(node.id);
    return true;
  }
  if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
    if (node) {
      const up = e.code === 'BracketRight';
      st.reorder(node.id, up ? (e.shiftKey ? 'top' : 'up') : e.shiftKey ? 'bottom' : 'down');
    }
    return true;
  }

  if (!node) return false;

  if (e.code === 'Escape') {
    st.select(null);
    return true;
  }
  if ((e.code === 'Delete' || e.code === 'Backspace') && !mod) {
    st.remove(node.id);
    return true;
  }
  if (!mod && !e.altKey && e.code === 'KeyH') {
    if (!e.repeat) st.flip(node.id);
    return true;
  }
  if (!mod && ARROWS.has(e.code)) {
    const step = e.shiftKey ? NUDGE_SHIFT : NUDGE;
    const dx = e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0;
    const dy = e.code === 'ArrowUp' ? -step : e.code === 'ArrowDown' ? step : 0;
    st.move(node.id, node.x + dx, node.y + dy, { commit: false });
    if (nudgeTimer) clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(commitNudge, NUDGE_COMMIT_MS);
    return true;
  }
  return false;
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleShortcut(e)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (ARROWS.has(e.code) && nudgeTimer) commitNudge();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      commitNudge();
    };
  }, []);
}
