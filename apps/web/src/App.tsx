import { Download, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { Canvas } from './canvas/Canvas';
import { SceneHealth } from './canvas/SceneHealth';
import { downloadSvg } from './export/download';
import { useLibrary } from './library/useLibrary';
import { FormatPanel } from './panels/FormatPanel';
import { PalettePanel } from './panels/PalettePanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { SidePanel } from './panels/SidePanel';
import { ComposeSummary, PromptBar } from './prompt/PromptBar';
import { accentVars } from './shell/accent';
import { Header, type Sheet } from './shell/Header';
import { Toasts } from './shell/Toasts';
import { toast } from './shell/toastStore';
import { COMPACT_QUERY, useMediaQuery } from './shell/useMediaQuery';
import { useShortcuts } from './shortcuts/useShortcuts';
import { nodeLabel, selectScene } from './state/selectors';
import { useEditor } from './state/store';

const RULE_TEXT = {
  'object-color-in-background': 'цвета объектов в фоновом слое',
  'unknown-asset': 'нет такого ассета в библиотеке',
} as const;

function exportNow() {
  const { history, library } = useEditor.getState();
  if (!library) return;
  const scene = history.present;
  try {
    const { fileName, violations } = downloadSvg(scene, library);
    if (violations.length === 0) {
      toast(`Сохранено: ${fileName}`, 'success');
      return;
    }
    const details = violations.map((v) => {
      const node = scene.nodes.find((n) => n.id === v.nodeId);
      return `${node ? nodeLabel(node, library) : v.nodeId}: ${RULE_TEXT[v.rule]}`;
    });
    toast(`Сохранено с замечаниями: ${fileName}`, 'warn', details);
  } catch (e) {
    toast('Не удалось экспортировать SVG', 'error', [e instanceof Error ? e.message : String(e)]);
  }
}

function ExportButton() {
  const canExport = useEditor((s) => s.library !== null && s.history.present.nodes.length > 0);
  return (
    <button
      type="button"
      className="btn btn--primary header__export"
      disabled={!canExport}
      onClick={exportNow}
      title="Скачать редактируемый SVG: предметы — именованные группы, пути без изменений"
    >
      <Download size={16} strokeWidth={2} aria-hidden="true" />
      <span className="header__export-label">Экспорт SVG</span>
    </button>
  );
}

function SheetHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="sheet-head">
      <span className="sheet-head__grip" aria-hidden="true" />
      <h2>{title}</h2>
      <button type="button" className="icon-btn" aria-label="Закрыть панель" onClick={onClose}>
        <X size={18} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/**
 * Editor layout: floating header, library and layers (left), the canvas with the compose
 * summary over it and the prompt dock under it, properties (right). Below COMPACT_QUERY the
 * side panels leave the grid and open as sheets.
 */
export function App() {
  const status = useLibrary();
  const palette = useEditor((s) => selectScene(s).palette);
  const compact = useMediaQuery(COMPACT_QUERY);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  useShortcuts();

  const open = compact ? sheet : null;
  const close = () => setSheet(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // a sheet that is not open is off screen: keep it out of the tab order and the a11y tree
  const offscreen = (side: Sheet) => compact && open !== side;

  return (
    <div
      className="app"
      data-sheet={open ?? undefined}
      style={accentVars(palette) as CSSProperties}
    >
      <Header actions={<ExportButton />} onOpenSheet={compact ? setSheet : undefined} />
      <aside className="panel panel--left" aria-label="Предметы и слои" inert={offscreen('left')}>
        {compact && <SheetHead title="Предметы и слои" onClose={close} />}
        <SidePanel onDone={compact ? close : undefined} />
      </aside>
      <main className="center">
        <div className="summary-slot" aria-live="polite">
          <ComposeSummary />
          <SceneHealth />
        </div>
        {status.state === 'error' ? (
          <div className="boot" role="alert">
            Не удалось загрузить библиотеку: {status.message}
          </div>
        ) : (
          <Canvas />
        )}
        <PromptBar />
        <Toasts />
      </main>
      <aside className="panel panel--right" aria-label="Свойства" inert={offscreen('right')}>
        {compact && <SheetHead title="Холст и палитра" onClose={close} />}
        <div className="panel__scroll">
          <PropertiesPanel />
          <PalettePanel />
          <FormatPanel />
        </div>
      </aside>
      {open && <div className="scrim" aria-hidden="true" onClick={close} />}
    </div>
  );
}
