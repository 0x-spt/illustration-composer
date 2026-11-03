import { FORMAT_PRESETS, type DetailSize, type Format } from '@ic/core';
import { Ban } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { switchDetail } from '../library/useLibrary';
import { warnDecorRebuild } from '../state/rebuild';
import { scaleView } from '../state/scale';
import { selectScene } from '../state/selectors';
import { useEditor } from '../state/store';
import { toast } from '../shell/toastStore';
import { BackgroundPreview } from './AssetPreview';

export const MIN_SIDE = 100;
export const MAX_SIDE = 4000;

const PRESET_NAMES = ['Квадрат', 'Обложка', 'Вертикаль'];

const clampSide = (v: number) => Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(v)));

function SideField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Number(draft.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(v) || draft.trim() === '') return setDraft(String(value));
    const rounded = Math.round(v);
    const side = clampSide(rounded);
    if (side !== rounded) toast(`Сторона кадра: от ${MIN_SIDE} до ${MAX_SIDE} px`, 'info');
    setDraft(String(side));
    if (side !== value) onCommit(side);
  };
  return (
    <label className="field field--side" title={`От ${MIN_SIDE} до ${MAX_SIDE} px`}>
      <span className="field__prefix">{label}</span>
      <input
        aria-label={label === 'Ш' ? 'Ширина, px' : 'Высота, px'}
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/** Frame format, detail size L/S, scene scale and the background preset. */
export function FormatPanel() {
  const scene = useEditor(selectScene);
  const lib = useEditor((s) => s.library);
  const { setFormat, setScale, setBackground } = useEditor.getState();
  const [switching, setSwitching] = useState(false);
  const { width: W, height: H } = scene.format;

  const applyFormat = (f: Format) => {
    if (f.width === W && f.height === H) return;
    warnDecorRebuild();
    setFormat(f);
  };

  const applyDetail = (size: DetailSize) => {
    if (size === scene.detail || switching) return;
    warnDecorRebuild();
    setSwitching(true);
    switchDetail(size)
      .catch(() => toast('Не удалось загрузить предметы этой детализации', 'error'))
      .finally(() => setSwitching(false));
  };

  const presets = lib?.manifest.backgrounds.filter((b) => b.size === scene.detail) ?? [];
  const scale = scaleView(scene.globalScale, scene.format, lib);
  const fill = ((scale.percent - scale.min) / Math.max(1, scale.max - scale.min)) * 100;
  const endScale = () => useEditor.getState().endGesture();

  return (
    <>
      <section className="section" aria-label="Холст">
        <div className="section__head">
          <h2 className="section__title">Холст</h2>
        </div>
        <div className="formats" role="radiogroup" aria-label="Формат">
          {FORMAT_PRESETS.map((f, i) => {
            const k = 18 / Math.max(f.width, f.height);
            return (
              <button
                key={`${f.width}x${f.height}`}
                type="button"
                role="radio"
                aria-checked={f.width === W && f.height === H}
                className="format"
                onClick={() => applyFormat(f)}
              >
                <span className="format__glyph" aria-hidden="true">
                  <span style={{ width: f.width * k, height: f.height * k }} />
                </span>
                <span className="format__name">{PRESET_NAMES[i]}</span>
                <span className="format__size">
                  {f.width}×{f.height}
                </span>
              </button>
            );
          })}
        </div>
        <div className="row">
          <span className="row__label">Свой размер</span>
          <div className="row__controls">
            <SideField label="Ш" value={W} onCommit={(w) => applyFormat({ width: w, height: H })} />
            <SideField label="В" value={H} onCommit={(h) => applyFormat({ width: W, height: h })} />
          </div>
        </div>
        <div className="row">
          <span
            className="row__label"
            title="L — подробные предметы, S — упрощённые для небольших размеров"
          >
            Детализация
          </span>
          <div className="segmented segmented--sm" role="group" aria-label="Детализация">
            {(['L', 'S'] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={scene.detail === d}
                disabled={switching}
                title={d === 'L' ? 'Подробные предметы' : 'Упрощённые, для небольших размеров'}
                onClick={() => applyDetail(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="stack">
          <div className="row row--tight">
            <label className="row__label" htmlFor="scene-scale">
              Масштаб сцены
            </label>
            <span className="row__value">{scale.percent} %</span>
          </div>
          <input
            id="scene-scale"
            className="slider"
            type="range"
            min={scale.min}
            max={scale.max}
            step={1}
            value={scale.percent}
            title="100 %: размер предметов как в примерах дизайнера"
            style={{ '--fill': `${fill}%` } as CSSProperties}
            onChange={(e) => {
              setScale(scale.toScale(Number(e.target.value)), { commit: false });
            }}
            onPointerUp={endScale}
            onKeyUp={endScale}
            onBlur={endScale}
          />
        </div>
      </section>

      <section className="section" aria-label="Подложка">
        <div className="section__head">
          <h2 className="section__title">Подложка</h2>
          <span className="section__hint">детализация {scene.detail}</span>
        </div>
        <div className="backgrounds" role="radiogroup" aria-label="Подложка">
          <button
            type="button"
            role="radio"
            aria-checked={scene.backgroundPresetId === null}
            className="bg-tile"
            title="Без подложки"
            onClick={() => {
              if (scene.backgroundPresetId === null) return;
              setBackground(null);
            }}
          >
            <span
              className="bg-tile__img bg-tile__img--none"
              style={{ background: scene.palette.slots.bg1 }}
            >
              <Ban size={16} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="bg-tile__name">Без подложки</span>
          </button>
          {lib &&
            presets.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={scene.backgroundPresetId === p.id}
                className="bg-tile"
                title={p.label}
                onClick={() => {
                  if (scene.backgroundPresetId === p.id) return;
                  warnDecorRebuild();
                  setBackground(p.id);
                }}
              >
                <span className="bg-tile__img">
                  <BackgroundPreview preset={p} palette={scene.palette} lib={lib} />
                </span>
                <span className="bg-tile__name">{p.label}</span>
              </button>
            ))}
        </div>
      </section>
    </>
  );
}
