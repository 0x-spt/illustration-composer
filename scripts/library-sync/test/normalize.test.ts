import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeSvg } from '../normalize';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

const dValues = (svg: string) => [...svg.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1]).sort();
const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]!);
const refs = (svg: string) => [
  ...[...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!),
  ...[...svg.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!),
];
const paintValues = (svg: string) =>
  [...svg.matchAll(/\s(?:fill|stroke|stop-color)="([^"]*)"/g)].map((m) => m[1]!);

const SYNTHETIC = `<?xml version="1.0" encoding="UTF-8"?>
<!-- exported -->
<!DOCTYPE svg>
<svg width="40" height="20" viewBox="0 0 40 20" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<metadata>junk</metadata>
<g id="Group 1"><path id="Vector" d="M0 0L10 10" style="fill:#abc;stroke:black"/></g>
<g id="empty"></g>
<use xlink:href="#grad" href="#grad"/>
<rect width="5" height="5" fill="url(#grad)"/>
<defs><linearGradient id="grad"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="#123456"/></linearGradient></defs>
</svg>`;

describe('normalizeSvg', () => {
  const cases: Array<[string, string]> = [
    ['phone-S-main.svg', fixture('phone-S-main.svg')],
    ['frame-peach-S.svg', fixture('frame-peach-S.svg')],
    ['confetti-L.svg', fixture('confetti-L.svg')],
    ['synthetic', SYNTHETIC],
  ];

  it.each(cases)('%s: keeps the multiset of path data', (_name, raw) => {
    const out = normalizeSvg(raw, { idPrefix: 'phone-L-main' });
    expect(dValues(out)).toEqual(dValues(raw));
    expect(dValues(out).length).toBeGreaterThan(0);
  });

  it.each(cases)('%s: prefixes every id and rewrites references consistently', (_name, raw) => {
    const out = normalizeSvg(raw, { idPrefix: 'phone-L-main' });
    const outIds = ids(out);
    for (const id of outIds) expect(id.startsWith('phone-L-main__')).toBe(true);
    expect(new Set(outIds).size).toBe(outIds.length);
    for (const ref of refs(out)) {
      expect(ref.startsWith('phone-L-main__')).toBe(true);
      expect(outIds).toContain(ref);
    }
    expect(refs(out).length).toBe(refs(raw).length);
  });

  it.each(cases)('%s: no style attributes, paints are #RRGGBB', (_name, raw) => {
    const out = normalizeSvg(raw, { idPrefix: 'phone-L-main' });
    expect(out).not.toMatch(/\sstyle=/);
    for (const v of paintValues(out)) {
      if (v === 'none' || v.startsWith('url(#')) continue;
      expect(v).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it.each(cases)('%s: root keeps viewBox, width and height', (_name, raw) => {
    const out = normalizeSvg(raw, { idPrefix: 'phone-L-main' });
    const root = /<svg\b[^>]*>/.exec(out)![0];
    const rawRoot = /<svg\b[^>]*>/.exec(raw)![0];
    for (const attr of ['viewBox', 'width', 'height']) {
      const re = new RegExp(`\\s${attr}="([^"]*)"`);
      expect(re.exec(root)?.[1]).toBe(re.exec(rawRoot)?.[1]);
    }
  });

  it('moves inline styles to attributes and canonicalises colours', () => {
    const out = normalizeSvg(SYNTHETIC, { idPrefix: 'x' });
    expect(out).toMatch(/fill="#AABBCC"/);
    expect(out).toMatch(/stroke="#000000"/);
    expect(out).toMatch(/stop-color="#FFFFFF"/);
    expect(out).not.toMatch(/<metadata|<!--|<\?xml|DOCTYPE/);
    expect(out).not.toMatch(/id="x__empty"/);
  });

  it('turns Figma mojibake layer names into readable ids', () => {
    const out = normalizeSvg(fixture('confetti-L.svg'), { idPrefix: 'c' });
    expect(ids(out)).toContain('c__конфетти');
  });
});
