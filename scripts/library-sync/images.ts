import { readFileSync } from 'node:fs';
import type { FigmaClient } from './figma';

/** Where rendered SVG / PNG come from: the REST images API or a dev-plugin export file. */
export interface ImageSource {
  /** Human-readable origin, for logs and the report. */
  readonly label: string;
  svgs(ids: string[]): Promise<Record<string, string>>;
  pngs(ids: string[], scale: number): Promise<Record<string, Uint8Array>>;
}

export function restImageSource(client: FigmaClient, fileKey: string): ImageSource {
  return {
    label: 'Figma REST /v1/images',
    svgs: (ids) => client.exportSvgs(fileKey, ids),
    pngs: (ids, scale) => client.exportPngs(fileKey, ids, scale),
  };
}

/** Output of tools/figma-export-plugin (`figma-export.json`). */
export interface PluginExport {
  fileKey: string | null;
  exportedAt: string;
  svgs: Record<string, string>;
  /** Base64 PNG at scale 0.5. */
  pngs: Record<string, string>;
  missing: string[];
}

export const PLUGIN_PNG_SCALE = 0.5;

function parseExport(raw: unknown): PluginExport {
  const e = raw as Partial<PluginExport> | null;
  if (
    !e ||
    typeof e !== 'object' ||
    typeof e.svgs !== 'object' ||
    typeof e.pngs !== 'object' ||
    !Array.isArray(e.missing)
  ) {
    throw new Error('figma-export.json: expected { fileKey, exportedAt, svgs, pngs, missing }');
  }
  return e as PluginExport;
}

/**
 * Reads SVG/PNG from a plugin export. Asking for a node that is absent fails loudly and
 * lists every absent id (plus whatever the plugin itself reported as missing).
 */
export function exportJsonImageSource(input: string | PluginExport, fileKey: string): ImageSource {
  const data =
    typeof input === 'string'
      ? parseExport(JSON.parse(readFileSync(input, 'utf8')))
      : parseExport(input);
  if (data.fileKey && data.fileKey !== fileKey) {
    throw new Error(`figma-export.json is from file ${data.fileKey}, expected ${fileKey}`);
  }
  const pick = <T>(kind: string, table: Record<string, T>, ids: string[]): Record<string, T> => {
    const absent = ids.filter((id) => !(id in table));
    if (absent.length) {
      const reported = data.missing.length
        ? `; plugin reported missing: ${data.missing.join(', ')}`
        : '';
      throw new Error(`figma-export.json has no ${kind} for: ${absent.join(', ')}${reported}`);
    }
    return Object.fromEntries(ids.map((id) => [id, table[id]!]));
  };
  return {
    label: `figma-export.json (плагин, ${data.exportedAt})`,
    svgs: async (ids) => pick('SVG', data.svgs, ids),
    pngs: async (ids, scale) => {
      if (scale !== PLUGIN_PNG_SCALE) {
        throw new Error(
          `figma-export.json has PNG at scale ${PLUGIN_PNG_SCALE}, asked for ${scale}`,
        );
      }
      const b64 = pick('PNG', data.pngs, ids);
      return Object.fromEntries(
        Object.entries(b64).map(([id, s]) => [id, new Uint8Array(Buffer.from(s, 'base64'))]),
      );
    },
  };
}
