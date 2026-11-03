import { composeScene, type Palette, type SlotName } from '@ic/core';
import { ArrowLeftRight, FileUp, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { paletteFromUpload, swapSlots, type UploadInput } from '../palette/customPalettes';
import { selectScene } from '../state/selectors';
import { useEditor } from '../state/store';
import { SceneSnippet } from './AssetPreview';

const SLOT_GROUPS: { title: string; slots: { slot: SlotName; label: string }[] }[] = [
  {
    title: 'Фон',
    slots: [
      { slot: 'bg1', label: 'Фон 1' },
      { slot: 'bg2', label: 'Фон 2' },
      { slot: 'bg3', label: 'Фон 3' },
    ],
  },
  {
    title: 'Объекты',
    slots: [
      { slot: 'obj1', label: 'Объект 1' },
      { slot: 'obj2', label: 'Объект 2' },
      { slot: 'obj3', label: 'Объект 3' },
    ],
  },
  {
    title: 'Линии и блики',
    slots: [
      { slot: 'ink', label: 'Контур' },
      { slot: 'paper', label: 'Белый' },
    ],
  },
];

const SAMPLE_FORMAT = { width: 640, height: 400 };
const PLACEHOLDER =
  'Вставьте hex-цвета через пробел или запятую, например:\n#BEEBEB #80DADA #5ABEBE #FFD4F2 #6D7BFC #B6C6FE #181817 #FFFFFF\n\nПодойдёт и JSON схемы с местами bg1…paper.';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Parsed = { palette: Palette; warnings: string[] } | { error: string } | null;

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (p: Palette) => void;
}

/** Upload or paste a palette, check the automatic slot split, swap slots, apply. */
export function PaletteDialog({ open, onClose, onApply }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  /** Only the latest picked file may set the result (reads are async). */
  const fileSeq = useRef(0);
  const lib = useEditor((s) => s.library);
  const detail = useEditor((s) => selectScene(s).detail);
  const [source, setSource] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<Parsed>(null);
  const [pick, setPick] = useState<SlotName | null>(null);
  const [name, setName] = useState('');
  const [over, setOver] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setText('');
      setFileName('');
      setParsed(null);
      setPick(null);
      setName('');
      setSource('text');
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  // after showModal() (and on switching back to text) the paste field takes focus
  useEffect(() => {
    if (open && source === 'text') textRef.current?.focus();
  }, [open, source]);

  /** Closing always goes through the dialog's own `close` event, which calls onClose once. */
  const close = () => ref.current?.close();

  const run = (input: UploadInput) => {
    const r = paletteFromUpload(input);
    setPick(null);
    setParsed(r.ok ? { palette: r.palette, warnings: r.warnings } : { error: capitalize(r.error) });
  };

  const onText = (v: string) => {
    setText(v);
    if (v.trim()) run({ text: v });
    else setParsed(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const seq = ++fileSeq.current;
    setFileName(file.name);
    const base = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
    if (!name) setName(base);
    try {
      const input: UploadInput = /\.ase$/i.test(file.name)
        ? { ase: await file.arrayBuffer() }
        : { text: await file.text() };
      if (seq === fileSeq.current) run(input);
    } catch {
      if (seq === fileSeq.current) {
        setPick(null);
        setParsed({ error: `Не удалось прочитать файл «${file.name}»` });
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void onFile(e.dataTransfer.files[0]);
  };

  const palette = parsed && 'palette' in parsed ? parsed.palette : null;

  const sample = useMemo(() => {
    if (!palette || !lib) return null;
    const bg = lib.manifest.backgrounds.find((b) => b.size === detail)?.id ?? null;
    try {
      return composeScene(
        {
          items: [
            { item: 'vase', state: 'main', role: 'hero' },
            { item: 'book', state: 'main', role: 'support' },
            { item: 'coin', state: 'main', role: 'support' },
          ],
          rationale: '',
        },
        { format: SAMPLE_FORMAT, detail, palette, backgroundPresetId: bg, variant: 0 },
        lib,
      );
    } catch {
      return null;
    }
  }, [palette, lib, detail]);

  const clickSlot = (slot: SlotName) => {
    if (!palette) return;
    if (pick === null) return setPick(slot);
    if (pick !== slot) setParsed({ palette: swapSlots(palette, pick, slot), warnings: [] });
    setPick(null);
  };

  const apply = () => {
    if (!palette) return;
    onApply({ ...palette, name: name.trim().slice(0, 40) || palette.name });
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="palette-dialog-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && close()}
      // a file dropped anywhere in the dialog must not make the browser open it
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <div className="dialog__inner">
        <header className="dialog__head">
          <h2 id="palette-dialog-title">Загрузить палитру</h2>
          <button type="button" className="icon-btn" aria-label="Закрыть" onClick={close}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>

        <div className="dialog__body">
          <div className="dialog__col">
            <div className="segmented segmented--sm" role="group" aria-label="Источник">
              <button
                type="button"
                aria-pressed={source === 'text'}
                onClick={() => setSource('text')}
              >
                Вставить текст
              </button>
              <button
                type="button"
                aria-pressed={source === 'file'}
                onClick={() => setSource('file')}
              >
                Файл
              </button>
            </div>
            {source === 'text' ? (
              <textarea
                ref={textRef}
                className="paste"
                value={text}
                onChange={(e) => onText(e.target.value)}
                placeholder={PLACEHOLDER}
                aria-label="Цвета палитры"
                spellCheck={false}
              />
            ) : (
              <div
                className={`drop${over ? ' drop--over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
              >
                <FileUp size={20} strokeWidth={1.5} aria-hidden="true" />
                <span>{fileName || 'Перетащите файл .json, .txt или .ase'}</span>
                <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                  Выбрать файл
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,.txt,.ase,application/json,text/plain"
                  hidden
                  onChange={(e) => {
                    void onFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
            {parsed && 'error' in parsed && (
              <p className="dialog__error" role="alert">
                {parsed.error}
              </p>
            )}
            {palette && parsed && 'warnings' in parsed && parsed.warnings.length > 0 && (
              <ul className="dialog__warnings">
                {parsed.warnings.map((w) => (
                  <li key={w}>{capitalize(w)}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="dialog__col dialog__col--preview">
            <div className="sample">
              {sample && lib ? (
                <SceneSnippet scene={sample} lib={lib} uid="pv-sample" />
              ) : (
                <span className="sample__empty">
                  Здесь появится превью иллюстрации в новых цветах
                </span>
              )}
            </div>
            <div className={`slots${palette ? '' : ' slots--off'}`}>
              {SLOT_GROUPS.map((g) => (
                <div key={g.title} className="slots__group">
                  <span className="slots__title">{g.title}</span>
                  <div className="slots__row">
                    {g.slots.map(({ slot, label }) => (
                      <button
                        key={slot}
                        type="button"
                        className="slot"
                        disabled={!palette}
                        aria-pressed={pick === slot}
                        data-slot={slot}
                        title={
                          pick && pick !== slot
                            ? `Поменять с «${label}»`
                            : `${label}: выбрать для замены`
                        }
                        onClick={() => clickSlot(slot)}
                      >
                        <span
                          className="slot__color"
                          style={{ background: palette?.slots[slot] ?? 'transparent' }}
                        />
                        <span className="slot__label">{label}</span>
                        <span className="slot__hex">{palette?.slots[slot] ?? '—'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="slots__hint">
              <ArrowLeftRight size={12} strokeWidth={1.75} aria-hidden="true" />
              {pick
                ? 'Теперь выберите место, с которым поменять цвет'
                : 'Места разложены автоматически. Нажмите на два цвета, чтобы поменять их местами'}
            </p>
          </div>
        </div>

        <footer className="dialog__foot">
          <label className="field field--name">
            <span className="field__prefix">Название</span>
            <input
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Своя палитра"
              aria-label="Название палитры"
            />
          </label>
          <span className="prompt__spacer" />
          <button type="button" className="btn" onClick={close}>
            Отмена
          </button>
          <button type="button" className="btn btn--primary" disabled={!palette} onClick={apply}>
            Применить
          </button>
        </footer>
      </div>
    </dialog>
  );
}
