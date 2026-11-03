import { describe, expect, it } from 'vitest';
import { createInitialScene, useEditor } from '../state/store';
import { BUILTIN_PALETTES } from '@ic/core';
import { trackPointer, type DragHandlers } from './trackPointer';

function ev(type: string, init: Record<string, unknown> = {}): Event {
  return Object.assign(new Event(type), { pointerId: 1, buttons: 1, shiftKey: false, ...init });
}

const start = { clientX: 100, clientY: 100, pointerId: 1 };

function recorder() {
  const log: string[] = [];
  const h: DragHandlers = {
    onMove: (dx, dy) => log.push(`move ${dx},${dy}`),
    onEnd: (moved) => log.push(`end ${moved}`),
  };
  return { log, h };
}

describe('trackPointer', () => {
  it('ends on pointerup and stops listening', () => {
    const win = new EventTarget();
    const { log, h } = recorder();
    trackPointer(win, start, h);
    win.dispatchEvent(ev('pointermove', { clientX: 110, clientY: 100 }));
    win.dispatchEvent(ev('pointerup', { clientX: 110, clientY: 100, buttons: 0 }));
    win.dispatchEvent(ev('pointermove', { clientX: 150, clientY: 100 }));
    expect(log).toEqual(['move 10,0', 'end true']);
  });

  it('ends when the window loses focus', () => {
    const win = new EventTarget();
    const { log, h } = recorder();
    trackPointer(win, start, h);
    win.dispatchEvent(ev('pointermove', { clientX: 120, clientY: 90 }));
    win.dispatchEvent(new Event('blur'));
    win.dispatchEvent(ev('pointermove', { clientX: 150, clientY: 100 }));
    expect(log).toEqual(['move 20,-10', 'end true']);
  });

  it('ends on a move with no button pressed (missed pointerup)', () => {
    const win = new EventTarget();
    const { log, h } = recorder();
    trackPointer(win, start, h);
    win.dispatchEvent(ev('pointermove', { clientX: 120, clientY: 100 }));
    win.dispatchEvent(ev('pointermove', { clientX: 160, clientY: 100, buttons: 0 }));
    expect(log).toEqual(['move 20,0', 'end true']);
  });

  it('ends when the capture element loses capture', () => {
    const win = new EventTarget();
    const el = new EventTarget();
    const { log, h } = recorder();
    trackPointer(win, start, h, el);
    el.dispatchEvent(ev('lostpointercapture'));
    expect(log).toEqual(['end false']);
  });

  it('a drag ended by blur commits exactly one history step', () => {
    useEditor.setState({
      history: { past: [], present: createInitialScene(BUILTIN_PALETTES[0]!), future: [] },
      selectedId: null,
      gestureBase: null,
    });
    const st = () => useEditor.getState();
    // a node without the library: move only touches x/y
    st().replaceScene({
      ...st().history.present,
      nodes: [
        {
          id: 'n',
          ref: { kind: 'item', item: 'coin', state: 'main' },
          x: 0,
          y: 0,
          rotation: 0,
          flipX: false,
        },
      ],
    });
    const pastLen = st().history.past.length;
    const win = new EventTarget();
    trackPointer(win, start, {
      onMove: (dx, dy) => st().move('n', dx, dy, { commit: false }),
      onEnd: (moved) => {
        if (moved) st().endGesture();
      },
    });
    win.dispatchEvent(ev('pointermove', { clientX: 130, clientY: 100 }));
    win.dispatchEvent(ev('pointermove', { clientX: 140, clientY: 120 }));
    win.dispatchEvent(new Event('blur'));
    expect(st().history.past.length).toBe(pastLen + 1);
    expect(st().gestureBase).toBeNull();
    expect(st().history.present.nodes[0]).toMatchObject({ x: 40, y: 20 });
  });
});
