import type { Palette } from '../src/palette/types';
import type { Scene } from '../src/scene/types';

export const palette: Palette = {
  id: 'p1',
  name: 'P1',
  slots: {
    bg1: '#111111',
    bg2: '#222222',
    bg3: '#333333',
    obj1: '#444444',
    obj2: '#555555',
    obj3: '#666666',
    ink: '#000000',
    paper: '#FFFFFF',
  },
};

export function emptyScene(): Scene {
  return {
    format: { width: 1000, height: 1000 },
    detail: 'L',
    palette,
    backgroundPresetId: null,
    globalScale: 1,
    nodes: [],
  };
}
