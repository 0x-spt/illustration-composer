import { BUILTIN_PALETTES } from '@ic/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialScene, useEditor } from '../state/store';
import { NUDGE_COMMIT_MS, commitNudge, handleShortcut } from './useShortcuts';

const key = (code: string, init: Partial<KeyboardEvent> = {}) =>
  ({
    code,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    target: null,
    ...init,
  }) as KeyboardEvent;

const st = () => useEditor.getState();

beforeEach(() => {
  vi.useFakeTimers();
  const base = createInitialScene(BUILTIN_PALETTES[0]!);
  useEditor.setState({
    history: {
      past: [],
      present: {
        ...base,
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
      },
      future: [],
    },
    selectedId: 'n',
    gestureBase: null,
  });
});

afterEach(() => {
  commitNudge();
  vi.useRealTimers();
});

describe('shortcuts', () => {
  it('a burst of arrow nudges is one history step, committed after the pause', () => {
    for (let i = 0; i < 5; i++) expect(handleShortcut(key('ArrowRight'))).toBe(true);
    handleShortcut(key('ArrowDown', { shiftKey: true }));
    expect(st().history.present.nodes[0]).toMatchObject({ x: 5, y: 10 });
    expect(st().history.past).toHaveLength(0);
    vi.advanceTimersByTime(NUDGE_COMMIT_MS);
    expect(st().history.past).toHaveLength(1);
    st().undo();
    expect(st().history.present.nodes[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('undo right after a nudge reverts just the nudge', () => {
    handleShortcut(key('ArrowLeft'));
    handleShortcut(key('KeyZ', { ctrlKey: true }));
    expect(st().history.present.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(st().history.future).toHaveLength(1);
  });

  it('Ctrl+D ignores key repeat and is claimed even without a selection', () => {
    handleShortcut(key('KeyD', { ctrlKey: true }));
    handleShortcut(key('KeyD', { ctrlKey: true, repeat: true }));
    expect(st().history.present.nodes).toHaveLength(2);
    st().select(null);
    expect(handleShortcut(key('KeyD', { ctrlKey: true }))).toBe(true);
    expect(handleShortcut(key('BracketRight', { ctrlKey: true }))).toBe(true);
    expect(st().history.present.nodes).toHaveLength(2);
  });
});
