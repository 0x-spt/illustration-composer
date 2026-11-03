import type { PointerEvent as ReactPointerEvent } from 'react';
import { frameCorners, type NodeFrame, type Point } from '../state/selectors';

/** Distance from the top edge to the rotation knob, screen px. */
const KNOB_OFFSET = 22;

interface Props {
  frame: NodeFrame;
  toScreen: (p: Point) => Point;
  /** Text under the box: the item name, or the angle while rotating. */
  tag: string;
  onRotateStart: (e: ReactPointerEvent<SVGElement>) => void;
}

const pts = (ps: Point[]) => ps.map((p) => `${p.x},${p.y}`).join(' ');

/**
 * Selection box from the library geometry (see nodeFrame), drawn in screen space so the
 * stroke and knob keep their size at any zoom. No resize handles: objects have no own scale.
 */
export function SelectionHandles({ frame, toScreen, tag, onRotateStart }: Props) {
  const c = frameCorners(frame).map(toScreen);
  const [tl, tr, br, bl] = c as [Point, Point, Point, Point];
  const a = (frame.rotation * Math.PI) / 180;
  const up = { x: Math.sin(a), y: -Math.cos(a) };
  const top = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
  const knob = { x: top.x + up.x * KNOB_OFFSET, y: top.y + up.y * KNOB_OFFSET };

  // the tag sits upright under the lowest point of the box
  const lowest = Math.max(tl.y, tr.y, br.y, bl.y);
  const centre = toScreen({ x: frame.cx, y: frame.cy });
  const tagW = Math.max(28, tag.length * 6.6 + 14);

  return (
    <g>
      <polygon className="sel-outline" points={pts(c)} />
      <line className="rot-stem" x1={top.x} y1={top.y} x2={knob.x} y2={knob.y} />
      <circle
        className="rot-hit"
        data-handle="rotate"
        cx={knob.x}
        cy={knob.y}
        r={11}
        onPointerDown={onRotateStart}
      >
        <title>Повернуть (Shift — шаг 15°)</title>
      </circle>
      <circle className="rot-handle" cx={knob.x} cy={knob.y} r={5} pointerEvents="none" />
      <g className="sel-tag" transform={`translate(${centre.x - tagW / 2} ${lowest + 8})`}>
        <rect width={tagW} height={18} rx={4} />
        <text x={tagW / 2} y={12.5} textAnchor="middle">
          {tag}
        </text>
      </g>
    </g>
  );
}

export function HoverOutline({
  frame,
  toScreen,
}: {
  frame: NodeFrame;
  toScreen: (p: Point) => Point;
}) {
  return <polygon className="hover-outline" points={pts(frameCorners(frame).map(toScreen))} />;
}
