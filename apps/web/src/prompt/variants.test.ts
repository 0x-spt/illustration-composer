import { describe, expect, it } from 'vitest';
import { nextCombo, totalCombos, uniqueVariants } from './variants';

describe('variant × template cycling', () => {
  it('walks the templates of the current variant first, then the next variant', () => {
    const counts = [3, 2];
    const seen: string[] = [];
    let c = { variant: 0, template: 0 };
    for (let i = 0; i < 6; i++) {
      seen.push(`${c.variant}:${c.template}`);
      c = nextCombo(c, counts);
    }
    expect(seen).toEqual(['0:0', '0:1', '0:2', '1:0', '1:1', '0:0']);
    expect(totalCombos(counts)).toBe(5);
  });

  it('stays put with a single combination', () => {
    expect(nextCombo({ variant: 0, template: 0 }, [1])).toEqual({ variant: 0, template: 0 });
  });
});

describe('uniqueVariants', () => {
  it('drops variants with the same items and states, whatever the order and roles', () => {
    const a = {
      items: [
        { item: 'wallet' as const, state: 'main' as const, role: 'hero' as const },
        { item: 'coin' as const, state: 'main' as const, role: 'support' as const },
      ],
      rationale: 'a',
    };
    const b = {
      ...a,
      items: [
        { ...a.items[1]!, role: 'hero' as const },
        { ...a.items[0]!, role: 'support' as const },
      ],
    };
    const c = { ...a, items: [a.items[0]!, { ...a.items[1]!, state: 'background' as const }] };
    expect(uniqueVariants([a, b, c])).toEqual([a, c]);
  });
});
