import { describe, expect, it } from 'vitest';
import rawCatalog from '../../library/data/catalog.ru.json';
import { matchByMetaphor } from '../src/intent/byMetaphor';
import { intentFromNames, matchByNames } from '../src/intent/byNames';
import {
  CompositionIntentSchema,
  DEFAULT_INTENT,
  IntentResponseSchema,
  type CatalogEntry,
} from '../src/intent/schema';
import { contentWords } from '../src/intent/text';
import { ITEM_IDS } from '../src/library/types';

const catalog = rawCatalog as CatalogEntry[];

describe('catalog.ru.json', () => {
  it('covers each of the 10 items once, with 3-6 names and 8-15 meanings', () => {
    expect(catalog.map((c) => c.item).sort()).toEqual([...ITEM_IDS].sort());
    for (const c of catalog) {
      expect(c.names.length, c.item).toBeGreaterThanOrEqual(3);
      expect(c.names.length, c.item).toBeLessThanOrEqual(6);
      expect(c.meanings.length, c.item).toBeGreaterThanOrEqual(8);
      expect(c.meanings.length, c.item).toBeLessThanOrEqual(15);
    }
  });

  it('has the colloquial names from the brief', () => {
    const names = (id: string) => catalog.find((c) => c.item === id)!.names.join(' ');
    expect(names('phone')).toMatch(/мобильник/);
    expect(names('phone')).toMatch(/смартфон/);
    expect(names('wallet')).toMatch(/кошель/);
    expect(names('lamp')).toMatch(/лампочка/);
  });
});

describe('contentWords', () => {
  const stems = (text: string) => contentWords(text).map((w) => w.stem);

  it('lowercases, folds ё, splits on non-letters and strips endings', () => {
    expect(stems('Кошелёк, МОНЕТЫ!')).toEqual(stems('кошелек монеты'));
    expect(stems('монета')).toEqual(stems('монеты'));
    expect(stems('a1b')).toEqual(['a', 'b']);
    expect(stems('')).toEqual([]);
  });

  it('drops stopwords and keeps the raw word next to its stem', () => {
    expect(contentWords('телефон и книга').map((w) => w.raw)).toEqual(['телефон', 'книга']);
  });
});

describe('matchByNames', () => {
  it('maps names in text order, ignoring numerals and fillers', () => {
    expect(matchByNames('телефон и две монеты', catalog)).toEqual({
      items: ['phone', 'coin'],
      unknown: [],
    });
  });

  it('keeps duplicates only when the word is repeated', () => {
    expect(matchByNames('монета монета книга', catalog).items).toEqual(['coin', 'coin', 'book']);
  });

  it('an unknown word between two names of one item keeps them as two items', () => {
    const r = matchByNames('мобильный хрюк телефон', catalog);
    expect(r.items).toEqual(['phone', 'phone']);
    expect(r.unknown.map((u) => u.token)).toEqual(['хрюк']);
  });

  it('resolves colloquial names', () => {
    expect(matchByNames('мобильник, кошель, лампочка', catalog).items).toEqual([
      'phone',
      'wallet',
      'lamp',
    ]);
  });

  it('reports a short fragment as unknown with a suggestion', () => {
    const r = matchByNames('тел', catalog);
    expect(r.items).toEqual([]);
    expect(r.unknown).toEqual([{ token: 'тел', suggestions: ['phone'] }]);
  });

  it('tolerates typos in long tokens', () => {
    expect(matchByNames('наушнеки', catalog).items).toEqual(['headphones']);
    expect(matchByNames('кашелек', catalog).items).toEqual(['wallet']);
  });

  it('reports gibberish as unknown without suggestions', () => {
    expect(matchByNames('qwerty', catalog)).toEqual({
      items: [],
      unknown: [{ token: 'qwerty', suggestions: [] }],
    });
  });
});

describe('intentFromNames', () => {
  it('makes the first item hero, the rest support, and caps at 4', () => {
    const intent = intentFromNames(['book', 'pen', 'coin', 'lamp', 'vase', 'folder']);
    expect(intent.items.map((i) => i.item)).toEqual(['book', 'pen', 'coin', 'lamp']);
    expect(intent.items.map((i) => i.role)).toEqual(['hero', 'support', 'support', 'support']);
    expect(intent.items.every((i) => i.state === 'main')).toBe(true);
    CompositionIntentSchema.parse(intent);
  });
});

describe('matchByMetaphor', () => {
  it('saving for a dream leads with coin or wallet', () => {
    const first = matchByMetaphor('копим на мечту', catalog)[0]!;
    expect(['coin', 'wallet']).toContain(first.items[0]!.item);
    expect(first.items[0]!.role).toBe('hero');
  });

  it('a new idea for the team offers lamp and puzzle', () => {
    const variants = matchByMetaphor('Новая идея для команды', catalog);
    const all = variants.flatMap((v) => v.items.map((i) => i.item));
    expect(all).toContain('lamp');
    expect(all).toContain('puzzle');
  });

  it('falls back to the default intent when nothing matches', () => {
    const variants = matchByMetaphor('qwerty asdf', catalog);
    expect(variants).toEqual([DEFAULT_INTENT]);
    expect(variants[0]).not.toBe(DEFAULT_INTENT);
    expect(variants[0]!.rationale).toBe('no-match');
    expect(variants[0]!.items.length).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_INTENT.items.map((i) => [i.item, i.role])).toEqual([
      ['phone', 'hero'],
      ['puzzle', 'support'],
    ]);
  });

  it('every result passes the schema, at most 3 variants, no repeated items', () => {
    for (const text of [
      'договор подписан',
      'учёба и знания',
      'слушаем клиента',
      'безопасность данных',
      '',
      'qwerty',
    ]) {
      const variants = matchByMetaphor(text, catalog);
      expect(variants.length).toBeGreaterThanOrEqual(1);
      expect(variants.length).toBeLessThanOrEqual(3);
      IntentResponseSchema.parse({ variants });
      for (const v of variants) {
        CompositionIntentSchema.parse(v);
        const ids = v.items.map((i) => i.item);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});

describe('matchByNames: multi-word names and false fuzzy hits', () => {
  it('treats a multi-word name as one item', () => {
    expect(matchByNames('мобильный телефон', catalog).items).toEqual(['phone']);
    expect(matchByNames('ваза с тюльпанами', catalog).items).toEqual(['vase']);
    expect(matchByNames('настольная лампа, шариковая ручка', catalog).items).toEqual([
      'lamp',
      'pen',
    ]);
  });

  it('keeps explicit repeats', () => {
    expect(matchByNames('телефон и телефон', catalog).items).toEqual(['phone', 'phone']);
    expect(matchByNames('телефон, монета, телефон', catalog).items).toEqual([
      'phone',
      'coin',
      'phone',
    ]);
  });

  it('does not fuzzy-match short stems', () => {
    expect(matchByNames('первый', catalog).items).toEqual([]);
    expect(matchByNames('ручной', catalog).items).toEqual([]);
  });
});
