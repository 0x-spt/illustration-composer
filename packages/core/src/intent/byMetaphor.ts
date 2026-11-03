import { ITEM_IDS, type ItemId } from '../library/types';
import { DEFAULT_INTENT, type CatalogEntry, type CompositionIntent } from './schema';
import { contentWords } from './text';

const NAME_WEIGHT = 2;
const MEANING_WEIGHT = 1;
const MAX_VARIANTS = 3;
const MAX_SUPPORT = 2;
/** Companions used when a metaphor hits a single item. */
const FILLERS: readonly ItemId[] = ['puzzle', 'phone', 'book'];

const stemSet = (phrases: string[]): Set<string> =>
  new Set(phrases.flatMap((p) => contentWords(p).map((w) => w.stem)));

function variant(hero: ItemId, ranked: ItemId[]): CompositionIntent {
  let support = ranked.filter((s) => s !== hero).slice(0, MAX_SUPPORT);
  if (support.length === 0) support = [FILLERS.find((f) => f !== hero)!];
  return {
    items: [
      { item: hero, state: 'main', role: 'hero' },
      ...support.map((item) => ({ item, state: 'main' as const, role: 'support' as const })),
    ],
    rationale: 'Подобрано по смыслу запроса',
  };
}

/** Offline "metaphor → objects": scores stem overlap with names (x2) and meanings (x1). */
export function matchByMetaphor(text: string, catalog: CatalogEntry[]): CompositionIntent[] {
  const query = new Set(contentWords(text).map((w) => w.stem));
  const scores = new Map<ItemId, number>();
  for (const entry of catalog) {
    const names = stemSet(entry.names);
    const meanings = stemSet(entry.meanings);
    let score = 0;
    for (const q of query) {
      if (names.has(q)) score += NAME_WEIGHT;
      else if (meanings.has(q)) score += MEANING_WEIGHT;
    }
    if (score > 0) scores.set(entry.item, score);
  }

  const ranked = [...scores.keys()].sort(
    (a, b) => scores.get(b)! - scores.get(a)! || ITEM_IDS.indexOf(a) - ITEM_IDS.indexOf(b),
  );
  if (ranked.length === 0) return [structuredClone(DEFAULT_INTENT)];

  return ranked.slice(0, MAX_VARIANTS).map((hero) => variant(hero, ranked));
}
