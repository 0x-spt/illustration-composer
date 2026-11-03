import { useState } from 'react';
import { selectScene } from '../state/selectors';
import { useEditor } from '../state/store';
import { LayersPanel } from './LayersPanel';
import { LibraryPanel } from './LibraryPanel';

type Tab = 'library' | 'layers';

interface Props {
  /** Called after an item is added or a layer picked: a sheet closes to show the canvas. */
  onDone?: () => void;
}

/** Left card: the library and the layers of the scene, one tab at a time. */
export function SidePanel({ onDone }: Props) {
  const [tab, setTab] = useState<Tab>('library');
  const count = useEditor((s) => selectScene(s).nodes.length);

  return (
    <div className="side">
      <div className="tabs" role="tablist" aria-label="Левая панель">
        <button
          type="button"
          role="tab"
          id="tab-library"
          aria-controls="tabpanel-library"
          aria-selected={tab === 'library'}
          onClick={() => setTab('library')}
        >
          Предметы
        </button>
        <button
          type="button"
          role="tab"
          id="tab-layers"
          aria-controls="tabpanel-layers"
          aria-selected={tab === 'layers'}
          onClick={() => setTab('layers')}
        >
          Слои
          {count > 0 && <span className="tabs__count">{count}</span>}
        </button>
      </div>
      <div
        className="side__body"
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'library' ? <LibraryPanel onAdded={onDone} /> : <LayersPanel onPicked={onDone} />}
      </div>
    </div>
  );
}
