import { BringToFront, Copy, FlipHorizontal2, SendToBack, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { nodeLabel, selectSelectedNode } from '../state/selectors';
import { useEditor } from '../state/store';
import { IconButton } from './IconButton';
import { mod } from './keys';

/** Floating actions for the selected object, under the canvas. */
/** `hidden` hides the bar during a canvas gesture without unmounting it (keeps a draft angle). */
export function SelectionBar({ hidden = false }: { hidden?: boolean }) {
  const node = useEditor(selectSelectedNode);
  const lib = useEditor((s) => s.library);
  const { rotate, flip, duplicate, remove, reorder } = useEditor.getState();
  const [angle, setAngle] = useState('');
  // true once the user typed in the field: blur without typing must not rotate
  // (a ref: Escape resets it and blurs in the same event, before a re-render)
  const dirty = useRef(false);

  const exact = node?.rotation ?? 0;
  const rotation = Math.round(exact);
  useEffect(() => {
    setAngle(String(rotation));
    dirty.current = false;
  }, [rotation, node?.id]);

  if (!node) return null;
  const id = node.id;

  const resetAngle = () => {
    setAngle(String(rotation));
    dirty.current = false;
  };

  const applyAngle = () => {
    if (!dirty.current) return;
    const v = Number(angle.trim().replace(',', '.'));
    // compare on the circle: the store keeps rotation in [0, 360) with float noise
    const delta = Number.isFinite(v) ? Math.abs(((v - exact + 540) % 360) - 180) : 0;
    if (angle.trim() !== '' && Number.isFinite(v) && delta > 1e-6) rotate(id, v);
    resetAngle();
  };

  return (
    <div
      className={hidden ? 'selbar selbar--hidden' : 'selbar'}
      aria-hidden={hidden || undefined}
      role="toolbar"
      aria-label="Выбранный объект"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="selbar__name">
        <span className="selbar__dot" />
        {nodeLabel(node, lib)}
      </div>
      <div className="selbar__sep" />
      <label className="angle" title="Поворот, градусы. Shift при повороте рукояткой — шаг 15°">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 12h10M2 12 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M6.2 12a4.3 4.3 0 0 0-1.3-3.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
        <input
          aria-label="Поворот в градусах"
          inputMode="decimal"
          value={angle}
          onChange={(e) => {
            setAngle(e.target.value);
            dirty.current = true;
          }}
          onBlur={applyAngle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              resetAngle();
              e.currentTarget.blur();
            }
          }}
        />
        °
      </label>
      <div className="selbar__sep" />
      <IconButton label="Отразить" shortcut="H" onClick={() => flip(id)}>
        <FlipHorizontal2 size={16} strokeWidth={1.75} />
      </IconButton>
      <IconButton label="Дублировать" shortcut={mod('D')} onClick={() => duplicate(id)}>
        <Copy size={16} strokeWidth={1.75} />
      </IconButton>
      <div className="selbar__sep" />
      <IconButton label="Слой ниже" shortcut={mod('[')} onClick={() => reorder(id, 'down')}>
        <SendToBack size={16} strokeWidth={1.75} />
      </IconButton>
      <IconButton label="Слой выше" shortcut={mod(']')} onClick={() => reorder(id, 'up')}>
        <BringToFront size={16} strokeWidth={1.75} />
      </IconButton>
      <div className="selbar__sep" />
      <IconButton label="Удалить" shortcut="Delete" danger onClick={() => remove(id)}>
        <Trash2 size={16} strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}
