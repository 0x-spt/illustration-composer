import { describe, expect, it } from 'vitest';
import { plural } from './plural';

const ITEM = ['предмет', 'предмета', 'предметов'] as const;

describe('plural', () => {
  it.each([
    [1, 'предмет'],
    [2, 'предмета'],
    [4, 'предмета'],
    [5, 'предметов'],
    [10, 'предметов'],
    [11, 'предметов'],
    [12, 'предметов'],
    [21, 'предмет'],
    [22, 'предмета'],
    [0, 'предметов'],
  ])('%i → %s', (n, form) => expect(plural(n, ITEM)).toBe(form));
});
