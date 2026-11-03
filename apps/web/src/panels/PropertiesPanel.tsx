import type { ObjectSlot, SceneNode } from '@ic/core';
import { Copy, FlipHorizontal2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { nodeLabel, selectScene, selectSelectedNode } from '../state/selectors';
import { useEditor } from '../state/store';
import { AssetPreview } from './AssetPreview';

type SlotMap = Partial<Record<ObjectSlot, ObjectSlot>>;

/** Colouring variants inside the palette: the original and three swaps of object slots. */
export const COLORINGS: { label: string; map: SlotMap | undefined }[] = [
  { label: 'Исходная окраска', map: undefined },
  { label: 'Объект 1 ↔ объект 2', map: { obj1: 'obj2', obj2: 'obj1' } },
  { label: 'Объект 2 ↔ объект 3', map: { obj2: 'obj3', obj3: 'obj2' } },
  { label: 'Объект 1 ↔ объект 3', map: { obj1: 'obj3', obj3: 'obj1' } },
];

const sameMap = (a: SlotMap | undefined, b: SlotMap | undefined) =>
  JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

function AngleField({ node }: { node: SceneNode }) {
  const rotate = useEditor((s) => s.rotate);
  const shown = String(Math.round(node.rotation));
  const [draft, setDraft] = useState(shown);
  const dirty = useRef(false);
  useEffect(() => {
    setDraft(shown);
    dirty.current = false;
  }, [shown, node.id]);

  const apply = () => {
    if (!dirty.current) return;
    dirty.current = false;
    const v = Number(draft.trim().replace(',', '.'));
    const delta = Number.isFinite(v) ? Math.abs(((v - node.rotation + 540) % 360) - 180) : 0;
    if (draft.trim() !== '' && delta > 1e-6) rotate(node.id, v);
    else setDraft(shown);
  };

  return (
    <label className="field" title="Поворот, градусы">
      <span className="field__prefix">
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 12h10M2 12 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M6.2 12a4.3 4.3 0 0 0-1.3-3.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </svg>
      </span>
      <input
        aria-label="Поворот в градусах"
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          dirty.current = true;
        }}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            dirty.current = false;
            setDraft(shown);
            e.currentTarget.blur();
          }
        }}
      />
      <span className="field__suffix">°</span>
    </label>
  );
}

/** Properties of the selected node: rotation, flip, state, colouring, duplicate, delete. */
export function PropertiesPanel() {
  const node = useEditor(selectSelectedNode);
  const lib = useEditor((s) => s.library);
  const scene = useEditor(selectScene);
  const { flip, duplicate, remove, setState, setSlotMap } = useEditor.getState();
  if (!node || !lib) return null;

  const ref = node.ref;
  const isItem = ref.kind === 'item';
  const showColoring = ref.kind === 'item' && ref.state === 'main';

  return (
    <section className="section props" aria-label="Выбранный объект">
      <div className="section__head">
        <h2 className="section__title">{nodeLabel(node, lib)}</h2>
        <div className="section__tools">
          <button
            type="button"
            className="icon-btn"
            aria-label="Дублировать"
            title="Дублировать (Ctrl+D)"
            onClick={() => duplicate(node.id)}
          >
            <Copy size={15} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            aria-label="Удалить"
            title="Удалить (Delete)"
            onClick={() => remove(node.id)}
          >
            <Trash2 size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="row">
        <span className="row__label">Поворот</span>
        <div className="row__controls">
          <AngleField node={node} />
          <button
            type="button"
            className="toggle"
            aria-pressed={node.flipX}
            aria-label="Отразить по горизонтали"
            title="Отразить (H)"
            onClick={() => flip(node.id)}
          >
            <FlipHorizontal2 size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {isItem && (
        <div className="row">
          <span className="row__label">Состояние</span>
          <div
            className="segmented segmented--sm segmented--fill"
            role="group"
            aria-label="Состояние"
          >
            <button
              type="button"
              aria-pressed={ref.state === 'main'}
              onClick={() => setState(node.id, 'main')}
            >
              Главный
            </button>
            <button
              type="button"
              aria-pressed={ref.state === 'background'}
              onClick={() => setState(node.id, 'background')}
            >
              Фоновый
            </button>
          </div>
        </div>
      )}

      {showColoring && (
        <div className="stack">
          <span className="row__label">Окраска</span>
          <div className="colorings" role="radiogroup" aria-label="Окраска">
            {COLORINGS.map((c, i) => (
              <button
                key={c.label}
                type="button"
                role="radio"
                aria-checked={sameMap(node.slotMap, c.map)}
                aria-label={c.label}
                title={c.label}
                className="coloring"
                style={{ background: scene.palette.slots.bg1 }}
                onClick={() => setSlotMap(node.id, c.map)}
              >
                <AssetPreview
                  uid={`pv-sm-${i}`}
                  nodeRef={ref}
                  slotMap={c.map}
                  palette={scene.palette}
                  detail={scene.detail}
                  lib={lib}
                />
              </button>
            ))}
          </div>
        </div>
      )}
      {ref.kind === 'item' && ref.state === 'background' && (
        <p className="section__note">Фоновый предмет рисуется только цветами фона.</p>
      )}
      {ref.kind === 'decor' && (
        <p className="section__note">
          Декор подложки. Пересобирается при смене формата, детализации и подложки.
        </p>
      )}
    </section>
  );
}
