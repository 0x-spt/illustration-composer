import { useSyncExternalStore } from 'react';

/** Below this width the side panels leave the grid and open as sheets (keep in sync with app.css). */
export const COMPACT_QUERY = '(max-width: 1023.98px)';

/** Live result of a CSS media query; false where `matchMedia` is missing (tests, SSR). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof matchMedia === 'undefined') return () => {};
      const mql = matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => typeof matchMedia !== 'undefined' && matchMedia(query).matches,
    () => false,
  );
}
