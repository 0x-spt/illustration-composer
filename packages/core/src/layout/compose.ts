import type { CompositionIntent, IntentItem } from '../intent/schema';
import { getAsset, type LoadedLibrary } from '../library/load';
import type {
  AssetFile,
  Aspect,
  DetailSize,
  ItemDef,
  LayoutTemplate,
  TemplateSlot,
} from '../library/types';
import { addItem, rotateNode } from '../scene/ops';
import type { Format, Scene } from '../scene/types';
import { placeDecor, resolvePresetForDetail } from './decor';
import { aspectOf } from './frame';
import { cellsNear, footprint, frameGrid, type FrameGrid, type Footprint } from './silhouette';
import {
  HERO_MIN_VISIBLE,
  HERO_MIN_VISIBLE_FLOOR,
  HERO_MIN_VISIBLE_UPRIGHT,
  type Box,
  type ComposeOptions,
} from './types';

type Role = IntentItem['role'];
const ROLES: Role[] = ['hero', 'support', 'backdrop'];
const EPS = 1e-9;

const widthOf = (lib: LoadedLibrary, item: IntentItem['item']): number =>
  lib.manifest.items.find((i) => i.id === item)?.nominalWidth ?? 0;

/**
 * Roles follow visible size, so a small hero never sits among bigger supports (D4). The intent decides which items appear and in which state;
 * the slot geometry follows size: the widest main-state item is the hero, the other main items
 * are supports, background-state items are backdrops. With no main item at all, the widest
 * item takes the hero role. Order of the intent is kept.
 */
export function normalizeRoles(items: IntentItem[], lib: LoadedLibrary): IntentItem[] {
  const pool = items.some((i) => i.state === 'main')
    ? items.filter((i) => i.state === 'main')
    : items;
  let hero: IntentItem | undefined;
  for (const i of pool) if (!hero || widthOf(lib, i.item) > widthOf(lib, hero.item)) hero = i;
  return items.map((i) => ({
    ...i,
    role: i === hero ? 'hero' : i.state === 'main' ? 'support' : 'backdrop',
  }));
}

const count = (roles: Role[], r: Role) => roles.filter((x) => x === r).length;

/** Items that find no slot of their role in the template. */
function unplaced(t: LayoutTemplate, items: IntentItem[]): number {
  const slots = t.slots.map((s) => s.role);
  const want = items.map((i) => i.role);
  return ROLES.reduce((n, r) => n + Math.max(0, count(want, r) - count(slots, r)), 0);
}

/**
 * Templates of that aspect whose role composition equals the intent's. Without an exact
 * match: those with the nearest number of slots (ties: fewest items left without a slot).
 * Order follows `lib.templates`.
 */
export function selectTemplates(
  intent: CompositionIntent,
  aspect: Aspect,
  lib: LoadedLibrary,
): LayoutTemplate[] {
  const items = normalizeRoles(intent.items, lib);
  const pool = lib.templates.filter((t) => t.aspect === aspect);
  const exact = pool.filter((t) => t.slots.length === items.length && unplaced(t, items) === 0);
  if (exact.length > 0 || pool.length === 0) return exact;
  const dist = (t: LayoutTemplate) => Math.abs(t.slots.length - items.length);
  const minDist = Math.min(...pool.map(dist));
  const near = pool.filter((t) => dist(t) === minDist);
  const minLeft = Math.min(...near.map((t) => unplaced(t, items)));
  return near.filter((t) => unplaced(t, items) === minLeft);
}

/** Axis-aligned bounds of a box rotated by `rotation` degrees about its centre. */
function rotatedBounds(b: Box, rotation: number): Box {
  const a = (rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { cx: b.cx, cy: b.cy, w: b.w * c + b.h * s, h: b.w * s + b.h * c };
}

const overlap = (c: number, size: number, frame: number) =>
  Math.max(0, Math.min(frame, c + size / 2) - Math.max(0, c - size / 2));

/** Share of the (rotated) box area that lies inside the frame, 0..1. */
export function visibleFraction(b: Box, rotation: number, f: Format): number {
  const r = rotatedBounds(b, rotation);
  if (r.w <= 0 || r.h <= 0) return 0;
  return ((overlap(r.cx, r.w, f.width) / r.w) * overlap(r.cy, r.h, f.height)) / r.h;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Nearest centre with the largest overlap on one axis (inside if it fits, else covering the frame). */
const bestCentre = (c: number, size: number, frame: number) =>
  clamp(c, Math.min(size / 2, frame - size / 2), Math.max(size / 2, frame - size / 2));

/**
 * Moves a box (the hero, or a support under the fit floor) from its slot straight toward the most visible position until at least
 * `minVisible` of its box is inside. The overlap on each axis only grows along that segment,
 * so a bisection finds the smallest move.
 */
function clampVisible(b: Box, rotation: number, f: Format, minVisible: number): Box {
  if (visibleFraction(b, rotation, f) >= minVisible - EPS) return b;
  const r = rotatedBounds(b, rotation);
  const tx = bestCentre(b.cx, r.w, f.width);
  const ty = bestCentre(b.cy, r.h, f.height);
  const at = (t: number): Box => ({ ...b, cx: b.cx + (tx - b.cx) * t, cy: b.cy + (ty - b.cy) * t });
  if (visibleFraction(at(1), rotation, f) < minVisible) return at(1);
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (visibleFraction(at(mid), rotation, f) >= minVisible) hi = mid;
    else lo = mid;
  }
  return at(hi);
}

/** Gap a support keeps from the frame edge, as a share of the frame's short side (D13). */
export const FRAME_MARGIN = 0.03;

/**
 * Inside the frame on every axis the box fits, FRAME_MARGIN away from the edges when there
 * is room for it (an item flush with the edge reads as cut); on an axis it does not fit, it
 * stays on its slot.
 */
function clampSupport(b: Box, rotation: number, f: Format): Box {
  const r = rotatedBounds(b, rotation);
  const m = FRAME_MARGIN * Math.min(f.width, f.height);
  const axis = (c: number, size: number, frame: number) => {
    if (size > frame) return c;
    const pad = Math.min(m, (frame - size) / 2);
    return clamp(c, size / 2 + pad, frame - size / 2 - pad);
  };
  return { ...b, cx: axis(b.cx, r.w, f.width), cy: axis(b.cy, r.h, f.height) };
}

/** Canvas box of an item: `nominalWidth × globalScale` wide, the variant's aspect. */
function itemBox(def: ItemDef, asset: AssetFile, globalScale: number, cx: number, cy: number): Box {
  const w = def.nominalWidth * globalScale;
  return { cx, cy, w, h: (w * asset.height) / asset.width };
}

/** How much of the source item the designer showed in that slot, at the template's own frame. */
function sourceVisible(t: LayoutTemplate, slot: TemplateSlot, lib: LoadedLibrary): number {
  const def = lib.manifest.items.find((i) => i.id === slot.sourceItem);
  if (!def) return 1;
  const w = def.nominalWidth * t.scale;
  const b = {
    cx: slot.cx * t.frame.width,
    cy: slot.cy * t.frame.height,
    w,
    h: (w * def.nominalHeight) / def.nominalWidth,
  };
  return visibleFraction(b, slot.rotation, t.frame);
}

const CORNERS = [
  { cx: 0.2, cy: 0.2 },
  { cx: 0.8, cy: 0.2 },
  { cx: 0.2, cy: 0.8 },
  { cx: 0.8, cy: 0.8 },
];
const quadrant = (p: { cx: number; cy: number }) =>
  `${p.cx < 0.5 ? 'l' : 'r'}${p.cy < 0.5 ? 't' : 'b'}`;

interface Placement {
  item: IntentItem;
  slot: TemplateSlot;
  /** Placed in a free corner because the template has no slot left for its role. */
  extra: boolean;
}

/**
 * Items take the slots of their role in size order (widest item → slot of the widest source item). Items left over go to free corners
 * (no hero/support slot centre in that quadrant), farthest from the hero first; extra slots stay empty.
 */
function assign(t: LayoutTemplate, items: IntentItem[], lib: LoadedLibrary): Placement[] {
  const out: Placement[] = [];
  const left: IntentItem[] = [];
  for (const role of ROLES) {
    // within a role, the widest item takes the slot whose source item was the widest
    const mine = items
      .filter((i) => i.role === role)
      .map((item, k) => ({ item, k }))
      .sort((a, b) => widthOf(lib, b.item.item) - widthOf(lib, a.item.item) || a.k - b.k)
      .map((x) => x.item);
    const slots = t.slots
      .filter((s) => s.role === role)
      .map((slot, k) => ({ slot, k }))
      .sort(
        (a, b) => widthOf(lib, b.slot.sourceItem) - widthOf(lib, a.slot.sourceItem) || a.k - b.k,
      )
      .map((x) => x.slot);
    mine.forEach((item, k) => {
      const slot = slots[k];
      if (slot) out.push({ item, slot, extra: false });
      else left.push(item);
    });
  }
  if (left.length === 0) return out;

  const hero = out.find((p) => p.item.role === 'hero')?.slot ?? { cx: 0.5, cy: 0.5 };
  const taken = new Set(out.filter((p) => p.item.role !== 'backdrop').map((p) => quadrant(p.slot)));
  const byFar = [...CORNERS].sort(
    (a, b) =>
      Math.hypot(b.cx - hero.cx, b.cy - hero.cy) - Math.hypot(a.cx - hero.cx, a.cy - hero.cy),
  );
  const free = byFar.filter((c) => !taken.has(quadrant(c)));
  const corners = free.length > 0 ? free : byFar;
  const zs = t.slots.map((s) => s.z);
  let top = Math.max(...zs);
  let bottom = Math.min(...zs);
  left.forEach((item, k) => {
    const c = item.role === 'hero' ? { cx: 0.5, cy: 0.5 } : corners[k % corners.length]!;
    const z = item.role === 'backdrop' ? --bottom : ++top;
    out.push({
      item,
      slot: { role: item.role, cx: c.cx, cy: c.cy, z, rotation: 0, sourceItem: item.item },
      extra: true,
    });
  });
  return out;
}

/** A support may be at most this much wider than the item the designer drew in its slot. */
export const SUPPORT_FIT_SLACK = 1.15;

/**
 * Shrinks the whole scene when a support is much wider than the source item of its slot:
 * `min(1, min over filled support slots of sourceWidth × 1.15 / itemWidth)`. 1 for the
 * designer's own items, so the examples reproduce exactly.
 */
function rawFit(placed: Placement[], lib: LoadedLibrary): number {
  let fit = 1;
  for (const p of placed) {
    if (p.extra || p.item.role !== 'support') continue;
    const src = widthOf(lib, p.slot.sourceItem);
    const own = widthOf(lib, p.item.item);
    if (src > 0 && own > 0) fit = Math.min(fit, (src * SUPPORT_FIT_SLACK) / own);
  }
  return fit;
}

/**
 * The support fit never starts the scene below this share of the example scale: the designer
 * prefers big, cropped items to small whole ones (D5). Only settling collisions goes lower (D13).
 */
export const FIT_FLOOR = 0.6;
/** A surface support too wide for its slot even at the floor keeps this share inside the frame. */
export const SUPPORT_MIN_VISIBLE = 0.7;

/** Raw support fit (before the floor) of `intent` laid out in template `t`; 1 = no shrink needed. */
export function templateFit(
  t: LayoutTemplate,
  intent: CompositionIntent,
  lib: LoadedLibrary,
): number {
  return rawFit(assign(t, normalizeRoles(intent.items, lib), lib), lib);
}

/**
 * Items that do not lie on each other keep a gap of this many frame cells (≈ 1 % of the long
 * side): the designer never lets them touch, and touching items read as one object.
 */
export const CLEARANCE_CELLS = 2;
/** Cells inside the gap that are tolerated anyway (stray outline and shadow pixels). */
export const CLEARANCE_SLACK = 2;
/** A flat item lying on a surface hides at most this much of the surface. */
export const STACK_MAX_HIDDEN = 0.5;
/**
 * Only a much smaller item lies on a surface: at most this share of its area. The designer's
 * stacks go up to 0.31 (wallet on folder; phone on book 0.26); a folder on a book (0.58) is
 * two objects fighting for the middle.
 */
export const STACK_MAX_AREA = 0.35;
/**
 * An item in front of a background-state item hides at most this much of it: the designer's
 * examples go up to 16 % (a puzzle on the backdrop book, headphones before the vase).
 */
export const BACKDROP_MAX_HIDDEN = 0.2;
/** A backdrop pushed aside may leave the frame, but keeps this much of its box inside. */
export const BACKDROP_MIN_VISIBLE = 0.2;
/** When the items cannot be pulled apart, the scene shrinks in steps of the example scale… */
export const SETTLE_SCALE_STEP = 0.05;
/** …down to this share of it: a collision is worse than small items (D13). */
export const SETTLE_FLOOR = 0.4;
/** Pushes per scale before the scene shrinks. */
const MAX_PUSHES = 80;

interface Laid {
  p: Placement;
  def: ItemDef;
  asset: AssetFile;
  box: Box;
  fp: Footprint;
  backdrop: boolean;
}

const nominalArea = (d: ItemDef) => d.nominalWidth * d.nominalHeight;

/**
 * What the collision rule needs of an item: its stacking, its silhouette in the frame, and
 * whether it is a backdrop that items in front may partly hide (see `collision`).
 */
interface Solid {
  def: ItemDef;
  fp: Footprint;
  backdrop: boolean;
}

/**
 * How badly `upper` (drawn above `lower`) collides with it, 0 = not at all. An item in front of
 * a backdrop hides at most BACKDROP_MAX_HIDDEN of it; a standing backdrop in a slot drawn for
 * another item is not one (a lamp in the slot of a flat book takes the middle of the frame)
 * and keeps the normal gap. A flat item, or a much smaller surface, may
 * lie on a surface the way the designer puts a phone on a book, hiding at most
 * STACK_MAX_HIDDEN of it, if it is at most STACK_MAX_AREA of its size; any other pair keeps a
 * gap of CLEARANCE_CELLS (D13).
 */
function collision(grid: FrameGrid, lower: Solid, upper: Solid): number {
  if (lower.backdrop || upper.backdrop) {
    // backdrops sit at the bottom; whatever is in front may hide only a little of them
    const [back, front] = lower.backdrop ? [lower, upper] : [upper, lower];
    const hidden = cellsNear(grid, front.fp, back.fp);
    return Math.max(0, hidden - BACKDROP_MAX_HIDDEN * back.fp.cells.length);
  }
  const stacked =
    lower.def.stacking === 'surface' &&
    upper.def.stacking !== 'standing' &&
    nominalArea(upper.def) <= STACK_MAX_AREA * nominalArea(lower.def);
  if (stacked) {
    const hidden = cellsNear(grid, upper.fp, lower.fp);
    return Math.max(0, hidden - STACK_MAX_HIDDEN * lower.fp.cells.length);
  }
  const [small, big] =
    upper.fp.cells.length <= lower.fp.cells.length ? [upper, lower] : [lower, upper];
  return Math.max(0, cellsNear(grid, small.fp, big.fp, CLEARANCE_CELLS) - CLEARANCE_SLACK);
}

/** Collision of the `i`-th and `j`-th item of `laid` (bottom to top). */
function pairCollision(grid: FrameGrid, laid: Laid[], i: number, j: number): number {
  const [lo, hi] = i < j ? [i, j] : [j, i];
  return collision(grid, laid[lo]!, laid[hi]!);
}

/** Everything the `i`-th item collides with, summed. */
function involvement(grid: FrameGrid, laid: Laid[], i: number): number {
  let sum = 0;
  for (let j = 0; j < laid.length; j++) if (j !== i) sum += pairCollision(grid, laid, i, j);
  return sum;
}

/** Sum of all collisions of the scene. */
function residual(grid: FrameGrid, laid: Laid[]): number {
  let sum = 0;
  for (let i = 0; i < laid.length; i++)
    for (let j = i + 1; j < laid.length; j++) sum += pairCollision(grid, laid, i, j);
  return sum;
}

/**
 * Indices of the two items of the worst collision, the one to try moving first: a backdrop,
 * else not the hero, else the smaller. Null when nothing collides.
 */
function worstCollision(grid: FrameGrid, laid: Laid[]): [number, number] | null {
  let worst: [number, number] | null = null;
  let most = 0;
  for (let i = 0; i < laid.length; i++) {
    for (let j = i + 1; j < laid.length; j++) {
      const severity = pairCollision(grid, laid, i, j);
      if (severity <= most) continue;
      most = severity;
      const lower = laid[i]!;
      const upper = laid[j]!;
      const lowerFirst =
        lower.p.item.role === 'backdrop' ||
        (upper.p.item.role !== 'backdrop' &&
          (upper.p.item.role === 'hero' ||
            (lower.p.item.role !== 'hero' && lower.fp.cells.length < upper.fp.cells.length)));
      worst = lowerFirst ? [i, j] : [j, i];
    }
  }
  return worst;
}

/** Directions a colliding item tries besides straight away from the other one. */
const COMPASS = Array.from({ length: 8 }, (_, k) => {
  const a = (k * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)] as const;
});

interface Plan {
  template: LayoutTemplate;
  /** Share of the example scale the scene is drawn at. */
  fit: number;
  globalScale: number;
  /** Bottom to top. */
  laid: Laid[];
  /** Sum of the collisions left; 0 when the items settled. */
  residual: number;
  /** No collisions left and no non-surface cut by the frame. */
  settled: boolean;
}

/**
 * Lays `placed` out in `t` at `fit` × the example scale: slot centres, then the frame clamps
 * (surfaces may be cropped, everything else stays whole, backdrop free), then a local search
 * moves colliding items apart until nothing collides or no step helps (D13).
 */
function layOutAt(
  t: LayoutTemplate,
  placed: Placement[],
  fit: number,
  floored: boolean,
  format: Format,
  detail: DetailSize,
  lib: LoadedLibrary,
): Plan {
  const grid = frameGrid(format);
  const globalScale = ((t.scale * format.width) / t.frame.width) * fit;
  const surface = (p: Placement) =>
    lib.manifest.items.find((i) => i.id === p.item.item)?.stacking === 'surface';
  /** A non-surface item in a slot drawn for another one: kept whole, like a support. */
  const foreignUpright = (p: Placement) =>
    p.item.role !== 'backdrop' && !surface(p) && (p.extra || p.item.item !== p.slot.sourceItem);
  /**
   * Share of a non-surface item that must stay inside the frame (D13): all of it in a slot
   * drawn for another item, what the designer showed of it in its own slot. A cut lamp or
   * vase stops reading as one; surfaces are cropped like in the examples.
   */
  const uprightVisible = (p: Placement): number => {
    if (p.item.role === 'backdrop' || surface(p)) return 0;
    if (foreignUpright(p)) return HERO_MIN_VISIBLE_UPRIGHT;
    return Math.min(HERO_MIN_VISIBLE_UPRIGHT, sourceVisible(t, p.slot, lib));
  };
  const keepInFrame = (p: Placement, b: Box): Box => {
    if (p.item.role === 'hero' && foreignUpright(p))
      return clampSupport(b, p.slot.rotation, format);
    if (p.item.role === 'hero') {
      const src = p.extra ? 1 : sourceVisible(t, p.slot, lib);
      const cropped = Math.max(HERO_MIN_VISIBLE_FLOOR, Math.min(HERO_MIN_VISIBLE, src));
      return clampVisible(b, p.slot.rotation, format, Math.max(cropped, uprightVisible(p)));
    }
    if (p.item.role === 'support')
      return floored && surface(p)
        ? clampVisible(b, p.slot.rotation, format, SUPPORT_MIN_VISIBLE)
        : clampSupport(b, p.slot.rotation, format);
    return clampVisible(b, p.slot.rotation, format, BACKDROP_MIN_VISIBLE);
  };
  const laid: Laid[] = placed.map((p) => {
    const def = lib.manifest.items.find((i) => i.id === p.item.item);
    if (!def) throw new Error(`Unknown item: ${p.item.item}`);
    const asset = getAsset(lib, { kind: 'item', item: p.item.item, state: p.item.state }, detail);
    const at = itemBox(
      def,
      asset,
      globalScale,
      p.slot.cx * format.width,
      p.slot.cy * format.height,
    );
    const box = keepInFrame(p, at);
    const fp = footprint(grid, lib, asset, box, p.slot.rotation, false);
    const backdrop =
      p.item.role === 'backdrop' &&
      (def.stacking === 'surface' || (!p.extra && p.item.item === p.slot.sourceItem));
    return { p, def, asset, box, fp, backdrop };
  });

  // only surfaces may be cut by the frame: a lamp taller than the frame needs a smaller scene
  const whole = laid.every(
    (l) => visibleFraction(l.box, l.p.slot.rotation, format) >= uprightVisible(l.p) - EPS,
  );
  if (!whole) {
    return { template: t, fit, globalScale, laid, residual: Infinity, settled: false };
  }

  // Local search: the worse item of the worst pair takes the step (straight away from the
  // other one, or one of eight compass directions) that lowers its collisions most; when it
  // cannot improve, the other one tries, unless it is a hero holding its slot.
  const step = grid.cell * 1.5;
  const tryMove = (i: number, away: readonly [number, number]): boolean => {
    const l = laid[i]!;
    // the hero holds its slot, unless it is a non-surface placed like a support anyway
    if (l.p.item.role === 'hero' && !foreignUpright(l.p)) return false;
    let best: { box: Box; fp: Footprint; score: number } | null = null;
    for (const [ux, uy] of [away, ...COMPASS]) {
      const box = keepInFrame(l.p, {
        ...l.box,
        cx: l.box.cx + ux * step,
        cy: l.box.cy + uy * step,
      });
      if (Math.hypot(box.cx - l.box.cx, box.cy - l.box.cy) < step / 4) continue;
      const fp = footprint(grid, lib, l.asset, box, l.p.slot.rotation, false);
      const trial = laid.map((x, k) => (k === i ? { ...x, box, fp } : x));
      const score = involvement(grid, trial, i);
      if (!best || score < best.score) best = { box, fp, score };
    }
    if (!best || best.score >= involvement(grid, laid, i)) return false;
    laid[i] = { ...l, box: best.box, fp: best.fp };
    return true;
  };
  for (let k = 0; k < MAX_PUSHES; k++) {
    const hit = worstCollision(grid, laid);
    if (!hit) return { template: t, fit, globalScale, laid, residual: 0, settled: true };
    const [i, j] = hit;
    const away = (from: Laid, to: Laid): [number, number] => {
      const dx = from.fp.cx - to.fp.cx;
      const dy = from.fp.cy - to.fp.cy;
      const len = Math.hypot(dx, dy);
      return len < EPS ? [from.box.cx < format.width / 2 ? -1 : 1, 0] : [dx / len, dy / len];
    };
    if (!tryMove(i, away(laid[i]!, laid[j]!)) && !tryMove(j, away(laid[j]!, laid[i]!))) break;
  }
  const left = residual(grid, laid);
  return { template: t, fit, globalScale, laid, residual: left, settled: left === 0 };
}

/**
 * `t` at the largest fit (from the support fit down to SETTLE_FLOOR) at which the items do
 * not collide; when none settles, the attempt with the least collision left (D5, D13).
 */
function plan(
  t: LayoutTemplate,
  items: IntentItem[],
  opts: ComposeOptions,
  lib: LoadedLibrary,
): Plan {
  // backdrops under everything (D13), the slot order otherwise: a template may stack a
  // backdrop above a support that never met it, which a taller item in that slot would cover
  const under = (p: Placement) => (p.item.role === 'backdrop' ? 0 : 1);
  const placed = assign(t, items, lib).sort((a, b) => under(a) - under(b) || a.slot.z - b.slot.z);
  const raw = rawFit(placed, lib);
  // a surface too wide for its slot even at the floor may be cropped like the hero (D5);
  // shrinking to settle collisions never crops: items get smaller, not cut
  const floored = raw < FIT_FLOOR;
  const start = Math.min(opts.maxFit ?? 1, Math.max(FIT_FLOOR, raw));
  const at = (fit: number) => layOutAt(t, placed, fit, floored, opts.format, opts.detail, lib);
  const first = at(start);
  if (first.settled) return first;

  // Fits on the SETTLE_SCALE_STEP ladder below the start. A smaller scene leaves more room,
  // so a binary search finds the largest one that settles in a few layouts, not one per rung.
  const rungs = Math.max(1, Math.ceil((start - SETTLE_FLOOR) / SETTLE_SCALE_STEP - EPS));
  const fitAt = (k: number) => Math.max(SETTLE_FLOOR, start - k * SETTLE_SCALE_STEP);
  let leastBad = first;
  let best: Plan | null = null;
  let lo = 1;
  let hi = rungs;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = at(fitAt(mid));
    if (p.settled) {
      best = p;
      hi = mid - 1;
    } else {
      if (p.residual < leastBad.residual) leastBad = p;
      lo = mid + 1;
    }
  }
  return best ? centred(best, opts.format, lib) : leastBad;
}

/**
 * A scene shrunk to settle collisions no longer fills the frame the way the example did, so
 * the group is moved to the frame centre. Only when every main item then fits inside and the
 * layout stays settled: otherwise it keeps the template's placement.
 */
function centred(p: Plan, f: Format, lib: LoadedLibrary): Plan {
  const main = p.laid.filter((l) => l.p.item.role !== 'backdrop');
  const bounds = main.map((l) => rotatedBounds(l.box, l.p.slot.rotation));
  const x0 = Math.min(...bounds.map((b) => b.cx - b.w / 2));
  const x1 = Math.max(...bounds.map((b) => b.cx + b.w / 2));
  const y0 = Math.min(...bounds.map((b) => b.cy - b.h / 2));
  const y1 = Math.max(...bounds.map((b) => b.cy + b.h / 2));
  if (x1 - x0 > f.width || y1 - y0 > f.height) return p;
  const grid = frameGrid(f);
  // A shift by whole cells moves the silhouettes exactly, so the settled gaps stay what they
  // were; of the two nearest such shifts, the one that keeps the group inside the frame.
  const shift = (lo: number, hi: number, frame: number) => {
    const ideal = frame / 2 - (lo + hi) / 2;
    const down = Math.floor(ideal / grid.cell) * grid.cell;
    const up = down + grid.cell;
    const fits = (d: number) => lo + d >= -EPS && hi + d <= frame + EPS;
    const order = ideal - down <= up - ideal ? [down, up] : [up, down];
    return order.find(fits) ?? 0;
  };
  const dx = shift(x0, x1, f.width);
  const dy = shift(y0, y1, f.height);
  const laid = p.laid.map((l) => {
    const box = { ...l.box, cx: l.box.cx + dx, cy: l.box.cy + dy };
    return { ...l, box, fp: footprint(grid, lib, l.asset, box, l.p.slot.rotation, false) };
  });
  // a backdrop half off the frame shows another part of itself after the shift: keep the
  // shift only if the layout is still settled
  return residual(grid, laid) === 0 ? { ...p, laid } : p;
}

/** Templates of the format's aspect or, when it has none, of every aspect (library order). */
function templatePool(
  intent: CompositionIntent,
  format: Format,
  lib: LoadedLibrary,
): LayoutTemplate[] {
  const pool = selectTemplates(intent, aspectOf(format), lib);
  if (pool.length > 0) return pool;
  return (['square', 'landscape', 'portrait'] as const).flatMap((a) =>
    selectTemplates(intent, a, lib),
  );
}

/**
 * Plans in `variant` order: collision-free first, then the largest scene, so the first layout
 * keeps the items as big as the designer drew them wherever it can. Ties keep the library
 * order.
 */
function plans(intent: CompositionIntent, opts: ComposeOptions, lib: LoadedLibrary): Plan[] {
  // «Другой вариант», a palette or a background change re-lay the same intent: plan it once
  let byIntent = planCache.get(lib);
  if (!byIntent) planCache.set(lib, (byIntent = new WeakMap()));
  let byOpts = byIntent.get(intent);
  if (!byOpts) byIntent.set(intent, (byOpts = new Map()));
  const key = `${opts.format.width}x${opts.format.height}|${opts.detail}|${opts.maxFit ?? 1}`;
  let ranked = byOpts.get(key);
  if (!ranked) byOpts.set(key, (ranked = rank(intent, opts, lib)));
  return ranked;
}

/** Plans depend on the intent, the frame, the detail and maxFit only. */
const planCache = new WeakMap<LoadedLibrary, WeakMap<CompositionIntent, Map<string, Plan[]>>>();

function rank(intent: CompositionIntent, opts: ComposeOptions, lib: LoadedLibrary): Plan[] {
  const items = normalizeRoles(intent.items, lib);
  return templatePool(intent, opts.format, lib)
    .map((t, k) => ({ p: plan(t, items, opts, lib), k }))
    .sort(
      (a, b) =>
        Number(b.p.settled) - Number(a.p.settled) ||
        a.p.residual - b.p.residual ||
        Math.round(b.p.fit * 100) - Math.round(a.p.fit * 100) ||
        a.k - b.k,
    )
    .map((x) => x.p);
}

/** What composeScene would draw for each variant: template, fit, and whether it settled. */
export interface LayoutCandidate {
  template: LayoutTemplate;
  fit: number;
  settled: boolean;
}

/** Layouts composeScene picks from, in `variant` order (see `plans`). */
export function layoutCandidates(
  intent: CompositionIntent,
  opts: ComposeOptions,
  lib: LoadedLibrary,
): LayoutCandidate[] {
  return plans(intent, opts, lib).map(({ template, fit, settled }) => ({ template, fit, settled }));
}

/** Templates composeScene picks from, in `variant` order (see `plans`). */
export function templateCandidates(
  intent: CompositionIntent,
  opts: ComposeOptions,
  lib: LoadedLibrary,
): LayoutTemplate[] {
  return layoutCandidates(intent, opts, lib).map((c) => c.template);
}

/** Number of layouts «Другой вариант» can cycle through for this intent and format. */
export function countTemplateCandidates(
  intent: CompositionIntent,
  format: Format,
  lib: LoadedLibrary,
): number {
  return templatePool(intent, format, lib).length;
}

/**
 * Lays the intent out like one of the designer's examples (D3, D5, D13). Every item is
 * `nominalWidth × globalScale` with `globalScale = template.scale × format.width / frame.width × fit`;
 * fit starts at the support fit (at least FIT_FLOOR, at most `opts.maxFit`) and drops until
 * the items stop colliding. Decor of the background preset goes under the items.
 */
export function composeScene(
  intent: CompositionIntent,
  opts: ComposeOptions,
  lib: LoadedLibrary,
): Scene {
  const candidates = plans(intent, opts, lib);
  const n = candidates.length;
  if (n === 0) throw new Error('Library has no layout templates');
  const chosen = candidates[((opts.variant % n) + n) % n]!;
  const { format, detail } = opts;

  const presetId =
    opts.backgroundPresetId === null
      ? null
      : resolvePresetForDetail(opts.backgroundPresetId, detail, lib.manifest);
  const preset = presetId ? lib.manifest.backgrounds.find((b) => b.id === presetId) : undefined;

  let scene: Scene = {
    format: { width: format.width, height: format.height },
    detail,
    palette: opts.palette,
    backgroundPresetId: presetId,
    globalScale: chosen.globalScale,
    nodes: preset ? placeDecor(preset, format, lib) : [],
  };
  for (const { p, box } of chosen.laid) {
    scene = addItem(scene, p.item.item, p.item.state, { x: box.cx, y: box.cy });
    if (p.slot.rotation !== 0)
      scene = rotateNode(scene, scene.nodes[scene.nodes.length - 1]!.id, p.slot.rotation);
  }
  return scene;
}

/**
 * Pairs of item nodes of `scene` that collide under the D13 rule (ids, lower first), for
 * any scene: composed or edited by hand. Background-state items count as backdrops.
 */
export function sceneCollisions(scene: Scene, lib: LoadedLibrary): Array<[string, string]> {
  const grid = frameGrid(scene.format);
  const solids = scene.nodes.flatMap((n) => {
    if (n.ref.kind !== 'item') return [];
    const ref = n.ref;
    const def = lib.manifest.items.find((i) => i.id === ref.item);
    if (!def) return [];
    const asset = getAsset(lib, ref, scene.detail);
    const box = itemBox(def, asset, scene.globalScale, n.x, n.y);
    const fp = footprint(grid, lib, asset, box, n.rotation, n.flipX);
    return [{ id: n.id, def, fp, backdrop: ref.state === 'background' }];
  });
  const out: Array<[string, string]> = [];
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++)
      if (collision(grid, solids[i]!, solids[j]!) > 0) out.push([solids[i]!.id, solids[j]!.id]);
  return out;
}
