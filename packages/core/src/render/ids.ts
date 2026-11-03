const ID_ATTR = /(\sid=")([^"]+)(")/g;
const URL_REF = /url\(#([^)\s]+)\)/g;
const HREF_REF = /(\s(?:xlink:)?href="#)([^"]+)(")/g;

/**
 * Makes the (already asset-prefixed) ids local to a scene node:
 * `phone-L-main__a` → `phone-L-main__a--phone-2`, and rewrites `url(#…)` and
 * `href="#…"` references that point at ids defined in the same markup.
 */
export function scopeIds(markup: string, scope: string): string {
  const defined = new Set([...markup.matchAll(ID_ATTR)].map((m) => m[2]!));
  if (defined.size === 0) return markup;
  const local = (id: string) => `${id}--${scope}`;
  return markup
    .replace(ID_ATTR, (_, pre: string, id: string, post: string) => pre + local(id) + post)
    .replace(URL_REF, (whole, id: string) => (defined.has(id) ? `url(#${local(id)})` : whole))
    .replace(HREF_REF, (whole, pre: string, id: string, post: string) =>
      defined.has(id) ? pre + local(id) + post : whole,
    );
}
