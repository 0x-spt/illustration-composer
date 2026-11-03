import { useCallback, useEffect, useRef } from 'react';
import { trackPointer, type DragHandlers } from './trackPointer';

export type { DragHandlers } from './trackPointer';

/**
 * Starts a window-level pointer gesture from a pointerdown and captures the pointer on
 * `captureEl`. Listeners are removed when the gesture ends and when the component unmounts.
 */
export function usePointerDrag() {
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  return useCallback(
    (
      start: { clientX: number; clientY: number; pointerId: number },
      h: DragHandlers,
      captureEl?: Element | null,
    ) => {
      stopRef.current?.();
      try {
        captureEl?.setPointerCapture(start.pointerId);
      } catch {
        // the pointer is already gone (released before this handler ran): window events still end it
      }
      const stop = trackPointer(
        window,
        start,
        {
          ...h,
          onEnd: (moved) => {
            stopRef.current = null;
            h.onEnd(moved);
          },
        },
        captureEl ?? undefined,
      );
      stopRef.current = stop;
    },
    [],
  );
}
