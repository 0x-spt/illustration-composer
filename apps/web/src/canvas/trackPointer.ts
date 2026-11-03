/** The pointer fields a gesture reads (a DOM PointerEvent in the app, a plain event in tests). */
export interface PointerLike {
  clientX: number;
  clientY: number;
  pointerId: number;
  buttons: number;
  shiftKey: boolean;
}

export interface DragHandlers {
  /** Pointer offset from the gesture start, in screen px. */
  onMove: (dx: number, dy: number, e: PointerLike) => void;
  /** `moved` is false for a click (the pointer never left the dead zone). */
  onEnd: (moved: boolean) => void;
}

/** Below this distance a press is a click, not a drag. */
export const DEAD_ZONE = 3;

/**
 * Follows one pointer from its pointerdown on `win` (the window). The gesture ends on
 * pointerup / pointercancel, and also when it can no longer see the release: window blur
 * (Alt+Tab, context menu), a move with no button held, or lost capture on `captureEl`.
 * Returns a function that stops listening without calling onEnd.
 */
export function trackPointer(
  win: EventTarget,
  start: { clientX: number; clientY: number; pointerId: number },
  h: DragHandlers,
  captureEl?: EventTarget,
): () => void {
  let moved = false;
  const mine = (e: Event) => (e as unknown as PointerLike).pointerId === start.pointerId;

  const move = (e: Event) => {
    if (!mine(e)) return;
    const p = e as unknown as PointerLike;
    if (p.buttons === 0) {
      end();
      return;
    }
    const dx = p.clientX - start.clientX;
    const dy = p.clientY - start.clientY;
    if (!moved && Math.hypot(dx, dy) < DEAD_ZONE) return;
    moved = true;
    h.onMove(dx, dy, p);
  };
  const up = (e: Event) => {
    if (mine(e)) end();
  };
  const end = () => {
    stop();
    h.onEnd(moved);
  };
  const stop = () => {
    win.removeEventListener('pointermove', move);
    win.removeEventListener('pointerup', up);
    win.removeEventListener('pointercancel', up);
    win.removeEventListener('blur', end);
    captureEl?.removeEventListener('lostpointercapture', up);
  };
  win.addEventListener('pointermove', move);
  win.addEventListener('pointerup', up);
  win.addEventListener('pointercancel', up);
  win.addEventListener('blur', end);
  captureEl?.addEventListener('lostpointercapture', up);
  return stop;
}
