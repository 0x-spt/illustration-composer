import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name and tooltip. */
  label: string;
  /** Shortcut shown in the tooltip, e.g. «Ctrl+D». */
  shortcut?: string;
  danger?: boolean;
  children: ReactNode;
}

export function IconButton({ label, shortcut, danger, children, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={['icon-btn', danger ? 'icon-btn--danger' : '', className ?? ''].join(' ').trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
