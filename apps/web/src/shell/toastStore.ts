import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  /** Secondary lines, e.g. validation details. */
  details?: string[];
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone?: ToastTone, details?: string[]) => void;
  dismiss: (id: number) => void;
}

/** Info and success close on their own; warn and error stay until closed (null). */
const LIFETIME: Record<ToastTone, number | null> = {
  info: 4000,
  success: 3500,
  warn: null,
  error: null,
};
/** Detail lines shown; the rest collapse into «и ещё N». */
export const MAX_DETAILS = 5;

/** First MAX_DETAILS lines, then «и ещё N» for the rest. */
export function capDetails(details: string[] | undefined): string[] | undefined {
  if (!details || details.length <= MAX_DETAILS) return details;
  return [...details.slice(0, MAX_DETAILS), `и ещё ${details.length - MAX_DETAILS}`];
}
const MAX_TOASTS = 3;
let seq = 0;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (text, tone = 'info', details) => {
    const id = ++seq;
    const toast = { id, text, tone, details: capDetails(details) };
    set({ toasts: [...get().toasts, toast].slice(-MAX_TOASTS) });
    const life = LIFETIME[tone];
    if (life !== null) setTimeout(() => get().dismiss(id), life);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (text: string, tone?: ToastTone, details?: string[]) =>
  useToasts.getState().push(text, tone, details);
