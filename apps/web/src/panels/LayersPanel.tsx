import type { SceneNode } from '@ic/core';
import { GripVertical } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { nodeLabel, selectScene } from '../state/selectors';
import { useEditor } from '../state/store';
import { AssetPreview } from './AssetPreview';

/**
 * «Книга», «Книга 2»: the copy number from the node id. Decor is numbered bottom-up
 * («Декор 1…»), since every decor id ends in -1.
 */
function layerName(node: SceneNode, label: string, decorIndex: number): string {
  if (node.ref.kind === 'decor') return `${label} ${decorIndex + 1}`;
  const n = Number(/-(\d+)$/.exec(node.id)?.[1] ?? 1);
  return n > 1 ? `${label} ${n}` : label;
}

/** Layers from top to bottom; drag a row to change the z-order, click to select. */
export function LayersPanel({ onPicked }: { onPicked?: () => void }) {
  const scene = useEditor(selectScene);
  const lib = useEditor((s) => s.library);
  const selectedId = useEditor((s) => s.selectedId);
  const { select, moveTo } = useEditor.getState();
  const [dragId, setDragId] = useState<string | null>(null);
  /** Insertion gap in display order: 0 = above the first row. */
  const [gap, setGap] = useState<number | null>(null);

  const rows = [...scene.nodes].reverse();
  const decorIds = scene.nodes.filter((n) => n.ref.kind === 'decor').map((n) => n.id);
  const last = rows.length;

  const onDragOver = (e: DragEvent<HTMLLIElement>, i: number) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = e.currentTarget.getBoundingClientRect();
    setGap(e.clientY < r.top + r.height / 2 ? i : i + 1);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (dragId !== null && gap !== null) {
      const from = rows.findIndex((n) => n.id === dragId);
      const display = gap > from ? gap - 1 : gap;
      if (from >= 0 && display !== from) moveTo(dragId, last - 1 - display);
    }
    setDragId(null);
    setGap(null);
  };

  return (
    <section className="layers" aria-label="Слои">
      {rows.length === 0 ? (
        <p className="panel__note layers__empty">
          Здесь появятся предметы и декор с холста. Верхний в списке лежит поверх остальных.
        </p>
      ) : (
        <ul
          className="layers__list"
          onDragLeave={(e) => e.currentTarget === e.target && setGap(null)}
        >
          {rows.map((n, i) => {
            const label = nodeLabel(n, lib);
            const isDecor = n.ref.kind === 'decor';
            const cls = [
              'layer',
              n.id === selectedId ? 'layer--selected' : '',
              isDecor ? 'layer--decor' : '',
              n.id === dragId ? 'layer--dragging' : '',
              gap === i && dragId ? 'layer--gap-before' : '',
              gap === i + 1 && i === last - 1 && dragId ? 'layer--gap-after' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li
                key={n.id}
                className={cls}
                draggable
                data-layer-id={n.id}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', n.id);
                  setDragId(n.id);
                }}
                onDragOver={(e) => onDragOver(e, i)}
                onDrop={onDrop}
                onDragEnd={() => {
                  setDragId(null);
                  setGap(null);
                }}
              >
                <button
                  type="button"
                  className="layer__btn"
                  aria-pressed={n.id === selectedId}
                  onClick={() => {
                    select(n.id);
                    onPicked?.();
                  }}
                >
                  <span className="layer__thumb" style={{ background: scene.palette.slots.bg1 }}>
                    {lib && (
                      <AssetPreview
                        uid={`pv-layer-${n.id}`}
                        nodeRef={n.ref}
                        slotMap={n.slotMap}
                        palette={scene.palette}
                        detail={scene.detail}
                        lib={lib}
                      />
                    )}
                  </span>
                  <span className="layer__name">{layerName(n, label, decorIds.indexOf(n.id))}</span>
                  {n.ref.kind === 'item' && n.ref.state === 'background' && (
                    <span className="layer__tag">фон</span>
                  )}
                </button>
                <GripVertical
                  className="layer__grip"
                  size={14}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
