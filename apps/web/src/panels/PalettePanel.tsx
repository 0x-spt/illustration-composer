import type { Palette } from '@ic/core';
import { Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { loadCustomPalettes, sanitizePalette, saveCustomPalettes } from '../palette/customPalettes';
import { selectScene } from '../state/selectors';
import { useEditor } from '../state/store';
import { toast } from '../shell/toastStore';
import { PaletteDialog } from './PaletteDialog';

const STRIP = ['bg1', 'bg2', 'bg3', 'obj1', 'obj2', 'obj3', 'ink'] as const;

const sameSlots = (a: Palette, b: Palette) => JSON.stringify(a.slots) === JSON.stringify(b.slots);

function PaletteRow({
  palette,
  active,
  onPick,
  onDelete,
}: {
  palette: Palette;
  active: boolean;
  onPick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={`pal${active ? ' pal--active' : ''}`}>
      <button
        type="button"
        className="pal__btn"
        role="radio"
        aria-checked={active}
        data-palette={palette.id}
        onClick={onPick}
      >
        <span className="pal__strip" aria-hidden="true">
          {STRIP.map((k) => (
            <span key={k} style={{ background: palette.slots[k] }} />
          ))}
        </span>
        <span className="pal__name">{palette.name}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          className="icon-btn icon-btn--danger pal__del"
          aria-label={`Удалить палитру «${palette.name}»`}
          title="Удалить палитру"
          onClick={onDelete}
        >
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

/** Built-in schemes, the user's own palettes (localStorage) and the upload dialog. */
export function PalettePanel() {
  const lib = useEditor((s) => s.library);
  const current = useEditor((s) => selectScene(s).palette);
  const setPalette = useEditor((s) => s.setPalette);
  const [custom, setCustom] = useState<Palette[]>(() => loadCustomPalettes());
  const [open, setOpen] = useState(false);
  const builtins = lib?.palettes ?? [];

  const pick = (p: Palette) => {
    if (p.id !== current.id) setPalette(p);
  };

  const persist = (list: Palette[]) => {
    setCustom(list);
    saveCustomPalettes(list);
  };

  const onApply = (raw: Palette) => {
    // re-validated here too: nothing unchecked reaches the store
    const p = sanitizePalette(raw);
    if (!p) return toast('Палитра не применена: цвета некорректны', 'error');
    const dupe = [...builtins, ...custom].find((q) => sameSlots(q, p));
    if (dupe) {
      setPalette(dupe);
      toast(`Такая палитра уже есть: «${dupe.name}»`, 'info');
    } else {
      persist([p, ...custom]);
      setPalette(p);
      toast(`Палитра «${p.name}» применена`, 'success');
    }
    setOpen(false);
  };

  const onDelete = (p: Palette) => {
    persist(custom.filter((q) => q.id !== p.id));
    if (current.id === p.id && builtins[0]) setPalette(builtins[0]);
  };

  return (
    <section className="section" aria-label="Палитра">
      <div className="section__head">
        <h2 className="section__title">Палитра</h2>
      </div>
      <div className="pals" role="radiogroup" aria-label="Цветовая схема">
        {builtins.map((p) => (
          <PaletteRow key={p.id} palette={p} active={current.id === p.id} onPick={() => pick(p)} />
        ))}
        {custom.map((p) => (
          <PaletteRow
            key={p.id}
            palette={p}
            active={current.id === p.id}
            onPick={() => pick(p)}
            onDelete={() => onDelete(p)}
          />
        ))}
      </div>
      <button type="button" className="btn btn--block" onClick={() => setOpen(true)}>
        <Upload size={14} strokeWidth={1.75} aria-hidden="true" />
        Загрузить палитру
      </button>
      <PaletteDialog open={open} onClose={() => setOpen(false)} onApply={onApply} />
    </section>
  );
}
