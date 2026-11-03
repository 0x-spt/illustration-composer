import type { Hex } from '../color/hex';

export interface AseResult {
  colors: Hex[];
  warnings: string[];
}

const hex2 = (v: number) =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

const CORRUPT = 'ASE-файл повреждён';

/**
 * Adobe Swatch Exchange reader: RGB and Gray entries become hex, CMYK/LAB are skipped with a
 * warning. Every read is bounds-checked against its block; a colour entry that overruns its block or holds
 * a non-finite component throws «ASE-файл повреждён».
 */
export function parseAseDetailed(buf: ArrayBuffer): AseResult {
  const view = new DataView(buf);
  if (buf.byteLength < 12 || view.getUint32(0, false) !== 0x41534546) {
    throw new Error('Это не ASE-файл');
  }
  const blockCount = view.getUint32(8, false);
  const colors: Hex[] = [];
  const skipped = new Set<string>();
  let pos = 12;
  for (let i = 0; i < blockCount && pos + 6 <= buf.byteLength; i++) {
    const type = view.getUint16(pos, false);
    const len = view.getUint32(pos + 2, false);
    const body = pos + 6;
    const end = body + len;
    if (end > buf.byteLength) throw new Error(CORRUPT);
    if (type === 0x0001) {
      const need = (at: number) => {
        if (at > end) throw new Error(CORRUPT);
      };
      need(body + 2);
      const nameLen = view.getUint16(body, false);
      const modelAt = body + 2 + nameLen * 2;
      need(modelAt + 4);
      let model = '';
      for (let k = 0; k < 4; k++) model += String.fromCharCode(view.getUint8(modelAt + k));
      const components = (n: number): number[] => {
        need(modelAt + 4 + n * 4);
        const out = Array.from({ length: n }, (_, k) =>
          view.getFloat32(modelAt + 4 + k * 4, false),
        );
        if (!out.every(Number.isFinite)) throw new Error(CORRUPT);
        return out;
      };
      if (model === 'RGB ') {
        colors.push(`#${components(3).map(hex2).join('')}`);
      } else if (model === 'Gray') {
        const g = hex2(components(1)[0]!);
        colors.push(`#${g}${g}${g}`);
      } else {
        skipped.add(model.trim());
      }
    }
    pos = end;
  }
  const warnings = [...skipped].map(
    (m) => `Цвета в модели ${m} пропущены: поддерживаются только RGB`,
  );
  return { colors, warnings };
}
