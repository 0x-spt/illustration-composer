import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useToasts, type ToastTone } from './toastStore';

const ICON: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CircleCheck,
  warn: TriangleAlert,
  error: CircleAlert,
};

/** Small, non-blocking messages over the bottom of the workspace. */
export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div
            key={t.id}
            className={`toast toast--${t.tone}`}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            <Icon className="toast__icon" size={16} strokeWidth={1.75} aria-hidden="true" />
            <div className="toast__body">
              <div className="toast__text">{t.text}</div>
              {t.details?.map((d) => (
                <div key={d} className="toast__detail">
                  {d}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="toast__close"
              aria-label="Закрыть"
              onClick={() => dismiss(t.id)}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
