/** Minimal Figma REST client for the offline sync. The token is passed in, never stored. */

export interface FigmaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}
export interface FigmaPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
}
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  /** Radians, as returned by the REST API. */
  rotation?: number;
  absoluteBoundingBox?: FigmaRect | null;
  absoluteRenderBounds?: FigmaRect | null;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  children?: FigmaNode[];
}
export interface FigmaFile {
  name: string;
  lastModified: string;
  version: string;
  document: FigmaNode;
}

export const FIGMA_API = 'https://api.figma.com/v1';
const BATCH = 50;
const MAX_RETRIES = 5;
/** Longer server-requested waits fail fast instead of hanging the CLI. */
const MAX_WAIT_S = 300;

type Fetch = typeof fetch;

export interface FigmaClientOptions {
  token: string;
  fetchImpl?: Fetch;
  baseUrl?: string;
  /** Injected for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

export function createFigmaClient(opts: FigmaClientOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl ?? FIGMA_API;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const log = opts.log ?? (() => {});

  async function api<T>(path: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(`${base}${path}`, { headers: { 'X-Figma-Token': opts.token } });
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const header = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(header) && header > 0 ? header : 2 ** attempt;
        if (wait > MAX_WAIT_S) {
          throw new Error(`Figma ${path.split('?')[0]}: rate limited, retry-after ${wait}s`);
        }
        log(`429 on ${path.split('?')[0]}, waiting ${wait}s`);
        await sleep(wait * 1000);
        continue;
      }
      if (!res.ok) {
        throw new Error(`Figma ${path.split('?')[0]}: HTTP ${res.status} ${await res.text()}`);
      }
      return (await res.json()) as T;
    }
  }

  async function download(url: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(url);
      if (res.ok) return res;
      if (attempt >= MAX_RETRIES) throw new Error(`download ${url}: HTTP ${res.status}`);
      await sleep(2 ** attempt * 1000);
    }
  }

  async function renderUrls(
    key: string,
    ids: string[],
    query: Record<string, string>,
  ): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const qs = new URLSearchParams({ ids: batch.join(','), ...query });
      log(`render ${query.format} ${i + batch.length}/${ids.length}`);
      const r = await api<{ err: string | null; images: Record<string, string | null> }>(
        `/images/${key}?${qs}`,
      );
      if (r.err) throw new Error(`Figma images: ${r.err}`);
      for (const id of batch) {
        const url = r.images[id];
        if (!url) throw new Error(`Figma did not render node ${id}`);
        out[id] = url;
      }
    }
    return out;
  }

  return {
    getFile: (key: string) => api<FigmaFile>(`/files/${key}`),

    /** SVG markup per node id, rendered with ids kept and strokes left as strokes. */
    async exportSvgs(key: string, ids: string[]): Promise<Record<string, string>> {
      const urls = await renderUrls(key, ids, {
        format: 'svg',
        svg_include_id: 'true',
        svg_simplify_stroke: 'false',
        svg_outline_text: 'false',
      });
      const out: Record<string, string> = {};
      for (const [id, url] of Object.entries(urls)) out[id] = await (await download(url)).text();
      return out;
    },

    /** PNG bytes per node id. */
    async exportPngs(
      key: string,
      ids: string[],
      scale: number,
    ): Promise<Record<string, Uint8Array>> {
      const urls = await renderUrls(key, ids, { format: 'png', scale: String(scale) });
      const out: Record<string, Uint8Array> = {};
      for (const [id, url] of Object.entries(urls)) {
        out[id] = new Uint8Array(await (await download(url)).arrayBuffer());
      }
      return out;
    },
  };
}

export type FigmaClient = ReturnType<typeof createFigmaClient>;

/** Depth-first index of every node by id. */
export function indexNodes(root: FigmaNode): Map<string, FigmaNode> {
  const idx = new Map<string, FigmaNode>();
  const walk = (n: FigmaNode) => {
    idx.set(n.id, n);
    n.children?.forEach(walk);
  };
  walk(root);
  return idx;
}

/** `#RRGGBB` of a Figma colour (0..1 channels). */
export function figmaHex(c: FigmaColor): string {
  const h = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`.toUpperCase();
}

/** Distinct visible solid paint colours of a subtree (hidden nodes skipped). */
export function nodeColors(node: FigmaNode): string[] {
  const out = new Set<string>();
  const walk = (n: FigmaNode) => {
    if (n.visible === false) return;
    for (const p of [...(n.fills ?? []), ...(n.strokes ?? [])]) {
      if (p.visible !== false && p.type === 'SOLID' && p.color) out.add(figmaHex(p.color));
    }
    // children of a boolean operation are geometry only; the operation's own paint renders
    if (n.type !== 'BOOLEAN_OPERATION') n.children?.forEach(walk);
  };
  walk(node);
  return [...out];
}

/** Render bounds (what the exported SVG covers), falling back to the layout box. */
export function nodeBox(n: FigmaNode): FigmaRect {
  const b = n.absoluteRenderBounds ?? n.absoluteBoundingBox;
  if (!b) throw new Error(`node ${n.id} has no bounds`);
  return b;
}
