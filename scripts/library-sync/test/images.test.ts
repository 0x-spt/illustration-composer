import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportJsonImageSource } from '../images';

const path = fileURLToPath(new URL('./fixtures/figma-export.json', import.meta.url));
const KEY = 'aOU1ip0vht8BGoNJi2e0dc';

describe('exportJsonImageSource', () => {
  it('serves SVG strings by node id', async () => {
    const src = exportJsonImageSource(path, KEY);
    const svgs = await src.svgs(['24:6050', '24:6121']);
    expect(Object.keys(svgs)).toEqual(['24:6050', '24:6121']);
    expect(svgs['24:6121']).toContain('fill="#FAC896"');
  });

  it('decodes base64 PNG at scale 0.5', async () => {
    const pngs = await exportJsonImageSource(path, KEY).pngs(['24:6120'], 0.5);
    expect([...pngs['24:6120']!]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('fails loudly on absent nodes and repeats what the plugin reported missing', async () => {
    const src = exportJsonImageSource(path, KEY);
    await expect(src.svgs(['24:6050', '1:1'])).rejects.toThrow(/no SVG for: 1:1.*9:999/);
    await expect(src.pngs(['24:6050'], 0.5)).rejects.toThrow(/no PNG for: 24:6050/);
  });

  it('rejects another file and another PNG scale', async () => {
    expect(() => exportJsonImageSource(path, 'otherKey')).toThrow(/expected otherKey/);
    await expect(exportJsonImageSource(path, KEY).pngs(['24:6120'], 1)).rejects.toThrow(/scale/);
  });
});
