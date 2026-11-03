import { LayoutGrid, Redo2, SlidersHorizontal, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { selectCanRedo, selectCanUndo, selectScene } from '../state/selectors';
import { useEditor } from '../state/store';
import { useCompose } from '../prompt/useCompose';
import { BrandMark } from './BrandMark';
import { IconButton } from './IconButton';
import { mod } from './keys';

export type Sheet = 'left' | 'right';

interface Props {
  /** Right-hand actions (export). */
  actions?: ReactNode;
  /** Set on narrow screens, where the side panels open as sheets from these buttons. */
  onOpenSheet?: (sheet: Sheet) => void;
}

/** Floating islands over the workspace: brand and document, undo/redo, export. */
export function Header({ actions, onOpenSheet }: Props) {
  const palette = useEditor((s) => selectScene(s).palette);
  const title = useCompose((s) => s.composedText);
  const canUndo = useEditor(selectCanUndo);
  const canRedo = useEditor(selectCanRedo);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);

  return (
    <header className="header">
      <div className="island island--brand">
        <BrandMark palette={palette} />
        <span className="brand">Композитор</span>
        <span className="header__doc" title={title || undefined}>
          {title ? `«${title}»` : 'Без названия'}
        </span>
      </div>
      {onOpenSheet && (
        <div className="island island--tools">
          <IconButton label="Предметы и слои" onClick={() => onOpenSheet('left')}>
            <LayoutGrid size={18} strokeWidth={1.75} />
          </IconButton>
          <IconButton label="Холст и палитра" onClick={() => onOpenSheet('right')}>
            <SlidersHorizontal size={18} strokeWidth={1.75} />
          </IconButton>
        </div>
      )}
      <div className="header__spacer" />
      <div className="island island--tools">
        <IconButton label="Отменить" shortcut={mod('Z')} disabled={!canUndo} onClick={undo}>
          <Undo2 size={18} strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Повторить" shortcut={mod('Z', true)} disabled={!canRedo} onClick={redo}>
          <Redo2 size={18} strokeWidth={1.75} />
        </IconButton>
      </div>
      {actions}
    </header>
  );
}
