import type { ItemId } from '../library/types';
import { MAX_INTENT_ITEMS, type CatalogEntry, type CompositionIntent } from './schema';
import { STOPWORDS, contentWords, editDistance, stem } from './text';

export interface UnknownToken {
  token: string;
  suggestions: ItemId[];
}

export interface NameMatch {
  items: ItemId[];
  unknown: UnknownToken[];
}

const FUZZY_MIN_TOKEN = 5;
const SUGGEST_MIN_PREFIX = 2;

function nameStems(catalog: CatalogEntry[]): { stem: string; item: ItemId }[] {
  const out: { stem: string; item: ItemId }[] = [];
  for (const entry of catalog) {
    for (const name of entry.names) {
      for (const w of contentWords(name)) out.push({ stem: w.stem, item: entry.item });
    }
  }
  return out;
}

/**
 * Typo budget: a stem needs >= 5 letters to be fuzzy-matched at all (3-4 letter stems such as
 * "пер" or "ручк" sit one edit from unrelated words: "первый", "ручной"). From 5 letters one edit
 * is allowed, from 7 two (the spec's ceiling).
 */
const FUZZY_MIN_STEM = 5;
const maxEdits = (len: number): number => (len < FUZZY_MIN_STEM ? 0 : len >= 7 ? 2 : 1);

/** Gap that joins two words of one multi-word name: whitespace, optionally a lone "с"/"со". */
const PHRASE_GAP = /^\s*(?:(?:с|со)\s+)?$/u;

interface Hit {
  item: ItemId;
  start: number;
  stem: string;
  end: number;
}

export function matchByNames(text: string, catalog: CatalogEntry[]): NameMatch {
  const stems = nameStems(catalog);
  /** Matched words in text order; null marks an unknown word, which no phrase may span. */
  const hits: (Hit | null)[] = [];
  const unknown: UnknownToken[] = [];
  const lower = text.toLowerCase().replace(/ё/g, 'е');

  for (const m of lower.matchAll(/\p{L}+/gu)) {
    const raw = m[0];
    if (STOPWORDS.has(raw)) continue;
    const start = m.index;
    const end = start + raw.length;
    const word = { raw, stem: stem(raw) };
    const exact = stems.find((s) => s.stem === word.stem);
    if (exact) {
      hits.push({ item: exact.item, start, end, stem: word.stem });
      continue;
    }
    if (word.raw.length >= FUZZY_MIN_TOKEN) {
      let best: { item: ItemId; dist: number } | undefined;
      for (const s of stems) {
        const dist = editDistance(word.stem, s.stem);
        const limit = maxEdits(Math.min(word.stem.length, s.stem.length));
        if (dist <= limit && (!best || dist < best.dist)) best = { item: s.item, dist };
      }
      if (best) {
        hits.push({ item: best.item, start, end, stem: word.stem });
        continue;
      }
    }
    const suggestions: ItemId[] = [];
    if (word.raw.length >= SUGGEST_MIN_PREFIX) {
      for (const s of stems) {
        if (s.stem.startsWith(word.raw) && !suggestions.includes(s.item)) suggestions.push(s.item);
      }
    }
    unknown.push({ token: word.raw, suggestions });
    hits.push(null);
  }

  // Adjacent words resolving to one item form one multi-word name ("мобильный телефон").
  // The same word twice, or anything between the words (a comma, "и", another word), is an
  // explicit repeat.
  const items: ItemId[] = [];
  let prev: Hit | undefined;
  for (const h of hits) {
    if (h === null) {
      prev = undefined;
      continue;
    }
    const joined =
      prev &&
      prev.item === h.item &&
      prev.stem !== h.stem &&
      PHRASE_GAP.test(lower.slice(prev.end, h.start));
    if (!joined) items.push(h.item);
    prev = h;
  }
  return { items, unknown };
}

/** First item is the hero, the rest support. Items beyond the fourth are dropped. */
export function intentFromNames(items: ItemId[]): CompositionIntent {
  const kept = items.slice(0, MAX_INTENT_ITEMS);
  return {
    items: kept.map((item, i) => ({
      item,
      state: 'main' as const,
      role: i === 0 ? ('hero' as const) : ('support' as const),
    })),
    rationale: 'Предметы из вашего списка',
  };
}
