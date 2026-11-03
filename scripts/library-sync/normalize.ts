import { formatHex, parse } from 'culori';
import { optimize, type CustomPlugin } from 'svgo';

export interface NormalizeOptions {
  /** Asset id, e.g. `phone-L-main`; every id becomes `<idPrefix>__<id>`. */
  idPrefix: string;
}

const PAINT_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color'] as const;
const KEEP_PAINT = /^(none|currentColor|inherit|transparent|url\(.*\))$/i;

/** `white`, `#abc`, `rgb(…)` → `#RRGGBB`; non-colour paints are returned unchanged. */
export function canonicalPaint(value: string): string {
  const v = value.trim();
  if (KEEP_PAINT.test(v)) return v;
  const c = parse(v);
  if (!c) return v;
  return formatHex(c).toUpperCase();
}

/**
 * Figma's `svg_include_id` writes layer names byte-by-byte as Latin-1 entities
 * (`&#208;&#186;…`), so Cyrillic names arrive as mojibake. Decode them back to UTF-8
 * and make the name a safe id (no whitespace or reference-breaking characters).
 */
function cleanId(id: string): string {
  let s = id;
  if (/[\u0080-ÿ]/.test(s) && [...s].every((ch) => ch.charCodeAt(0) <= 0xff)) {
    const decoded = Buffer.from(s, 'latin1').toString('utf8');
    if (!decoded.includes('�')) s = decoded;
  }
  s = s.replace(/[\s#()"'<>&]+/g, '_');
  return s.length > 0 ? s : 'id';
}

const URL_REF = /url\((["']?)#(.+?)\1\)/g;

/** Cleans ids (see `cleanId`), keeps them unique and rewrites every reference to them. */
const sanitizeIds: CustomPlugin = {
  name: 'sanitizeIds',
  fn: (root) => {
    const rename = new Map<string, string>();
    const used = new Set<string>();
    const collect = (node: (typeof root)['children'][number]) => {
      if (node.type !== 'element') return;
      const id = node.attributes.id;
      if (id != null && id.length > 0 && !rename.has(id)) {
        const base = cleanId(id);
        let next = base;
        for (let i = 2; used.has(next); i++) next = `${base}_${i}`;
        used.add(next);
        rename.set(id, next);
      }
      node.children.forEach(collect);
    };
    root.children.forEach(collect);

    return {
      element: {
        enter: (node) => {
          for (const [name, value] of Object.entries(node.attributes)) {
            if (name === 'id') {
              node.attributes.id = rename.get(value) ?? value;
            } else if ((name === 'href' || name === 'xlink:href') && value.startsWith('#')) {
              const target = rename.get(value.slice(1));
              if (target) node.attributes[name] = `#${target}`;
            } else if (value.includes('url(')) {
              node.attributes[name] = value.replace(URL_REF, (m, _q, ref: string) => {
                const target = rename.get(ref);
                return target ? `url(#${target})` : m;
              });
            }
          }
        },
      },
    };
  },
};

const canonicalColors: CustomPlugin = {
  name: 'canonicalColors',
  fn: () => ({
    element: {
      enter: (node) => {
        for (const attr of PAINT_ATTRS) {
          const v = node.attributes[attr];
          if (v != null) node.attributes[attr] = canonicalPaint(v);
        }
      },
    },
  }),
};

/**
 * Safe SVG normalisation: no plugin that touches geometry or numeric precision runs
 * (`preset-default` is off entirely). Only metadata is dropped, styles move to
 * attributes, empty containers go, ids are cleaned and prefixed, paints become `#RRGGBB`.
 */
export function normalizeSvg(raw: string, opts: NormalizeOptions): string {
  const { data } = optimize(raw, {
    multipass: false,
    js2svg: { pretty: true, indent: 1, eol: 'lf' },
    plugins: [
      'removeDoctype',
      'removeXMLProcInst',
      'removeComments',
      'removeMetadata',
      'removeEditorsNSData',
      { name: 'inlineStyles', params: { onlyMatchedOnce: false } },
      'convertStyleToAttrs',
      'removeEmptyContainers',
      sanitizeIds,
      { name: 'prefixIds', params: { prefix: opts.idPrefix, delim: '__' } },
      canonicalColors,
    ],
  });
  return data;
}
