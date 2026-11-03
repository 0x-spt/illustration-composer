import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { SelectionBar } from '../shell/SelectionBar';
import { nodeFrame, nodeLabel, selectScene, type Point } from '../state/selectors';
import { useEditor } from '../state/store';
import { NodeView } from './NodeView';
import { HoverOutline, SelectionHandles } from './SelectionHandles';
import { usePointerDrag } from './usePointerDrag';

/** Free space around the frame, screen px: room for the size label above and the toolbar below. */
const WIDE_INSET = { top: 32, right: 40, bottom: 76, left: 40 };
/** The same on a narrow stage (phones): the frame takes the width. */
const NARROW_INSET = { top: 28, right: 8, bottom: 68, left: 8 };
const NARROW_STAGE = 560;
/** Rotation step with Shift held, degrees. */
export const ROTATE_SNAP = 15;

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const nodeIdAt = (target: EventTarget | null): string | null =>
  target instanceof Element
    ? (target.closest('[data-node-id]')?.getAttribute('data-node-id') ?? null)
    : null;

/** The scene frame fitted into the workspace, with selection, drag and rotate. */
export function Canvas() {
  const scene = useEditor(selectScene);
  const lib = useEditor((s) => s.library);
  const selectedId = useEditor((s) => s.selectedId);
  const [stageRef, size] = useSize<HTMLDivElement>();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [gesture, setGesture] = useState<'drag' | 'rotate' | null>(null);
  const beginDrag = usePointerDrag();

  const { width: W, height: H } = scene.format;
  const inset = size.w < NARROW_STAGE ? NARROW_INSET : WIDE_INSET;
  const availW = Math.max(1, size.w - inset.left - inset.right);
  const availH = Math.max(1, size.h - inset.top - inset.bottom);
  const zoom = Math.max(0.02, Math.min(availW / W, availH / H));
  const ox = Math.round(inset.left + (availW - W * zoom) / 2);
  const oy = Math.round(inset.top + (availH - H * zoom) / 2);

  const toScreen = useCallback(
    (p: Point): Point => ({ x: ox + p.x * zoom, y: oy + p.y * zoom }),
    [ox, oy, zoom],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const id = nodeIdAt(e.target);
    const { select, move } = useEditor.getState();
    if (!id) {
      select(null);
      return;
    }
    select(id);
    const start = useEditor.getState().history.present.nodes.find((n) => n.id === id);
    if (!start) return;
    setGesture('drag');
    beginDrag(
      e,
      {
        onMove: (dx, dy, ev) => {
          // Shift locks the drag to the dominant axis
          const lock = ev.shiftKey ? (Math.abs(dx) > Math.abs(dy) ? 'x' : 'y') : null;
          const x = start.x + (lock === 'y' ? 0 : dx / zoom);
          const y = start.y + (lock === 'x' ? 0 : dy / zoom);
          move(id, x, y, { commit: false });
        },
        onEnd: () => {
          setGesture(null);
          useEditor.getState().endGesture();
        },
      },
      e.currentTarget,
    );
  };

  const selected = scene.nodes.find((n) => n.id === selectedId) ?? null;
  const selFrame = selected && lib ? nodeFrame(selected, scene, lib) : null;
  const hovered = hoverId !== selectedId ? scene.nodes.find((n) => n.id === hoverId) : undefined;
  const hoverFrame = hovered && lib && !gesture ? nodeFrame(hovered, scene, lib) : null;

  const onRotateStart = (e: ReactPointerEvent<SVGElement>) => {
    if (e.button !== 0 || !selected || !selFrame || !stageRef.current) return;
    e.stopPropagation();
    const id = selected.id;
    const rect = stageRef.current.getBoundingClientRect();
    const c = toScreen({ x: selFrame.cx, y: selFrame.cy });
    const cx = rect.left + c.x;
    const cy = rect.top + c.y;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    const r0 = selected.rotation;
    setGesture('rotate');
    beginDrag(
      e,
      {
        onMove: (_dx, _dy, ev) => {
          const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
          let deg = r0 + ((a - a0) * 180) / Math.PI;
          if (ev.shiftKey) deg = Math.round(deg / ROTATE_SNAP) * ROTATE_SNAP;
          useEditor.getState().rotate(id, deg, { commit: false });
        },
        onEnd: () => {
          setGesture(null);
          useEditor.getState().endGesture();
        },
      },
      stageRef.current,
    );
  };

  const ready = lib !== null && size.w > 0;
  // ids are prefixed so the ghost's scoped gradient/clip ids never collide with the real node
  const ghost = gesture === 'drag' && selected ? { ...selected, id: `ghost-${selected.id}` } : null;
  const empty = ready && scene.nodes.length === 0;
  const tag = selected
    ? gesture === 'rotate'
      ? `${Math.round(selected.rotation)}°`
      : nodeLabel(selected, lib)
    : '';

  return (
    <div
      ref={stageRef}
      className={`stage${gesture === 'drag' ? ' stage--dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerOver={(e) => setHoverId(nodeIdAt(e.target))}
      onPointerLeave={() => setHoverId(null)}
    >
      {ready && (
        <svg aria-label="Холст" role="img">
          {/* the shadow sits on its own rect: a filter on the clipped svg would let content spill */}
          <rect
            className="stage__frame"
            x={ox}
            y={oy}
            width={W * zoom}
            height={H * zoom}
            fill={scene.palette.slots.bg1}
          />
          <svg
            x={ox}
            y={oy}
            width={W * zoom}
            height={H * zoom}
            viewBox={`0 0 ${W} ${H}`}
            overflow="visible"
          >
            <defs>
              <clipPath id="stage-frame">
                <rect width={W} height={H} />
              </clipPath>
            </defs>
            {ghost && (
              // while dragging: the part of the object outside the frame, faintly
              <g className="stage__ghost">
                <NodeView node={ghost} scene={scene} lib={lib} />
              </g>
            )}
            <g clipPath="url(#stage-frame)">
              <rect width={W} height={H} fill={scene.palette.slots.bg1} />
              {scene.nodes.map((n) => (
                <NodeView key={n.id} node={n} scene={scene} lib={lib} />
              ))}
            </g>
          </svg>
          {hoverFrame && <HoverOutline frame={hoverFrame} toScreen={toScreen} />}
          {selFrame && (
            <SelectionHandles
              frame={selFrame}
              toScreen={toScreen}
              tag={tag}
              onRotateStart={onRotateStart}
            />
          )}
        </svg>
      )}
      {ready && (
        <div className="frame-label" style={{ left: ox, top: oy - 20 }}>
          {W} × {H}
        </div>
      )}
      {empty && (
        <div
          className="stage__empty"
          style={{ left: ox, top: oy, width: W * zoom, height: H * zoom }}
        >
          <strong>
            <span>Опишите идею —</span> <span>соберём иллюстрацию</span>
          </strong>
          <span>
            Из предметов библиотеки: пропорции, цвета и пути остаются как у дизайнера. Можно и
            вручную — добавьте предмет из панели «Предметы».
          </span>
        </div>
      )}
      {ready && <div className="zoom-chip">{Math.round(zoom * 100)} %</div>}
      <SelectionBar hidden={gesture !== null} />
    </div>
  );
}
