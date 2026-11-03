import { CornerDownLeft, LoaderCircle, Shuffle, Sparkles } from 'lucide-react';
import type { FormEvent } from 'react';
import { nodeLabel } from '../state/selectors';
import { useEditor } from '../state/store';
import { EXAMPLES, hintFor, type ComposeMode, type UnknownHint } from './composeClient';
import { MAX_PROMPT, useCompose, useVariantProgress } from './useCompose';

const PLACEHOLDER: Record<ComposeMode, string> = {
  metaphor: 'Опишите идею, например «копим на мечту»',
  names: 'Перечислите предметы, например «книга, лампа и ручка»',
};

const MODE_TITLE: Record<ComposeMode, string> = {
  metaphor: 'Подберём 2–3 предмета под смысл фразы',
  names: 'Возьмём из библиотеки предметы, которые вы назвали',
};

/** Replaces the unknown word with the suggested item name (or appends it). */
function withSuggestion(text: string, token: string, label: string): string {
  const name = label.toLowerCase();
  const at = text.toLowerCase().replace(/ё/g, 'е').indexOf(token);
  return at >= 0 ? text.slice(0, at) + name + text.slice(at + token.length) : `${text} ${name}`;
}

/** The dock under the canvas: «Опишите идею», two modes and «Собрать»; examples until a result. */
export function PromptBar() {
  const { text, mode, busy, setText, setMode, submit } = useCompose();
  const ready = useEditor((s) => s.library !== null);
  const canGo = ready && text.trim().length > 0 && !busy;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (canGo) void submit();
  };

  return (
    <form className="prompt" onSubmit={onSubmit} role="search" aria-busy={busy}>
      <div className="prompt__bar">
        <div className="segmented prompt__modes" role="group" aria-label="Режим">
          {(['metaphor', 'names'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              title={MODE_TITLE[m]}
              onClick={() => setMode(m)}
            >
              {m === 'metaphor' ? 'Метафора' : 'Объекты'}
            </button>
          ))}
        </div>
        <input
          className="prompt__input"
          value={text}
          maxLength={MAX_PROMPT}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER[mode]}
          aria-label="Опишите идею"
          enterKeyHint="go"
        />
        <button type="submit" className="btn btn--primary prompt__go" disabled={!canGo}>
          {busy ? (
            <>
              <LoaderCircle className="spin" size={16} strokeWidth={2} aria-hidden="true" />
              Собираем
            </>
          ) : (
            <>
              Собрать
              <CornerDownLeft
                className="prompt__enter"
                size={14}
                strokeWidth={2}
                aria-hidden="true"
              />
            </>
          )}
        </button>
      </div>
      <Examples />
    </form>
  );
}

/** Example metaphors under the dock, while the canvas has no composed scene. */
function Examples() {
  const { result, busy, submit } = useCompose();
  const hasItems = useEditor((s) => s.history.present.nodes.some((n) => n.ref.kind === 'item'));
  const ready = useEditor((s) => s.library !== null);
  if (result && hasItems) return null;
  return (
    <div className="prompt__examples">
      <span className="meta-label">Попробуйте</span>
      {EXAMPLES.map((ex) => (
        <button
          key={ex}
          type="button"
          className="chip"
          disabled={!ready || busy}
          onClick={() => void submit(ex, 'metaphor')}
        >
          {ex}
        </button>
      ))}
    </div>
  );
}

/**
 * What the last «Собрать» did, over the canvas: the phrase and the items it became, whether
 * AI picked them, hints for unknown words, errors and «Другой вариант».
 */
export function ComposeSummary() {
  const { result, error, busy, text, composedText, composedMode, submit, next } = useCompose();
  const lib = useEditor((s) => s.library);
  const nodes = useEditor((s) => s.history.present.nodes);
  const progress = useVariantProgress();
  const unknown: UnknownHint[] = result?.unknown ?? [];

  const items = nodes.filter((n) => n.ref.kind === 'item');
  const names = (state: 'main' | 'background') =>
    items
      .filter((n) => n.ref.kind === 'item' && n.ref.state === state)
      .map((n) => nodeLabel(n, lib).toLowerCase());
  const main = [...new Set(names('main'))];
  const back = [...new Set(names('background'))];

  const showResult = result && (items.length > 0 || unknown.length > 0);
  if (!showResult && !error) return null;

  return (
    <>
      {error && (
        <span className="summary__error" role="alert">
          {error}
        </span>
      )}
      {showResult && (
        <div className="summary__chip">
          {result.source === 'ai' ? (
            <span className="summary__ai">
              <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
              <span className="summary__ai-text">Подобрано AI</span>
            </span>
          ) : null}
          {composedMode === 'metaphor' && composedText && (
            <span className="summary__phrase">«{composedText}» →</span>
          )}
          {main.length > 0 && <strong className="summary__items">{main.join(', ')}</strong>}
          {back.length > 0 && <span className="summary__back">+ {back.join(', ')} на фоне</span>}
        </div>
      )}
      {showResult && progress && (
        <button
          type="button"
          className="variant-btn"
          onClick={next}
          title="Другая раскладка или другой набор предметов"
        >
          <Shuffle size={15} strokeWidth={1.75} aria-hidden="true" />
          <span className="variant-btn__label">Другой вариант</span>
          <span className="variant-btn__count">
            {progress.position} из {progress.total}
          </span>
        </button>
      )}
      {showResult && result.notice && <span className="badge">{result.notice}</span>}
      {unknown.map((u) => (
        <span key={u.token} className="meta-hint">
          {hintFor(u)}
          {u.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="link-btn"
              disabled={busy}
              onClick={() => void submit(withSuggestion(text, u.token, s), 'names')}
            >
              Заменить на «{s}»
            </button>
          ))}
        </span>
      ))}
    </>
  );
}
