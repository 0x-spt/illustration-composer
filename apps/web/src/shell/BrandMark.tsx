import type { Palette } from '@ic/core';

/** Product mark: an ink tile with two shapes, the round one in the active palette. */
export function BrandMark({ palette }: { palette: Palette }) {
  const s = palette.slots;
  return (
    <svg className="brand-mark" width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="10" fill={s.ink} />
      <rect
        x="9"
        y="16"
        width="11"
        height="11"
        rx="2.5"
        fill="none"
        stroke={s.paper}
        strokeWidth="1.8"
      />
      <circle cx="22" cy="14" r="5.5" fill="none" stroke={s.bg1} strokeWidth="1.8" />
    </svg>
  );
}
