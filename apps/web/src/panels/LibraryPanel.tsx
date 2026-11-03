import rawCatalog from '@ic/library/data/catalog.ru.json';
import type { CatalogEntry, ItemDef, ItemState } from '@ic/core';
import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { selectScene } from '../state/selectors';
import { useEditor } from '../state/store';
import { plural } from '../shell/plural';
import { AssetPreview } from './AssetPreview';

const ITEM_FORMS = ['предмет', 'предмета', 'предметов'] as const;

const catalog = rawCatalog as CatalogEntry[];
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

/** Item matches a query by its label or any of its catalog names. */
function matches(item: ItemDef, q: string): boolean {
  if (!q) return true;
  const names = catalog.find((c) => c.item === item.id)?.names ?? [];
  return [item.label, ...names].some((n) => norm(n).includes(q));
}

/** The ten items as live vector previews in the current palette; a click adds one to the centre. */
export function LibraryPanel({ onAdded }: { onAdded?: () => void }) {
  const lib = useEditor((s) => s.library);
  const scene = useEditor(selectScene);
  const add = useEditor((s) => s.add);
  const [state, setState] = useState<ItemState>('main');
  const [query, setQuery] = useState('');
  const q = norm(query);
  const items = useMemo(() => lib?.manifest.items.filter((i) => matches(i, q)) ?? [], [lib, q]);
  const refs = useMemo(
    () =>
      new Map(lib?.manifest.items.map((i) => [i.id, { kind: 'item' as const, item: i.id, state }])),
    [lib, state],
  );

  return (
    <section className="lib" aria-label="Библиотека">
      <div className="lib__search">
        <Search size={15} strokeWidth={1.75} aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти предмет"
          aria-label="Найти предмет"
        />
        {query && (
          <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}>
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="lib__bar">
        <span className="eyebrow">
          {lib ? `${items.length} ${plural(items.length, ITEM_FORMS)}` : 'Загрузка'}
        </span>
        <div className="segmented segmented--sm" role="group" aria-label="Состояние предмета">
          <button
            type="button"
            aria-pressed={state === 'main'}
            onClick={() => setState('main')}
            title="Предмет в цветах объектов"
          >
            Главный
          </button>
          <button
            type="button"
            aria-pressed={state === 'background'}
            onClick={() => setState('background')}
            title="Предмет в цветах фона, для заднего плана"
          >
            Фоновый
          </button>
        </div>
      </div>
      <div className="lib__grid">
        {lib &&
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="lib__tile"
              title={`Добавить «${item.label}» в центр кадра`}
              onClick={() => {
                add(item.id, state, { x: scene.format.width / 2, y: scene.format.height / 2 });
                onAdded?.();
              }}
            >
              <span
                className="lib__thumb"
                style={{ background: scene.palette.slots[state === 'main' ? 'bg1' : 'bg2'] }}
              >
                <AssetPreview
                  uid={`pv-lib-${item.id}-${state}`}
                  nodeRef={refs.get(item.id)!}
                  palette={scene.palette}
                  detail={scene.detail}
                  lib={lib}
                />
              </span>
              <span className="lib__label">{item.label}</span>
            </button>
          ))}
        {lib && items.length === 0 && <p className="panel__note lib__empty">Ничего не нашлось</p>}
      </div>
    </section>
  );
}
