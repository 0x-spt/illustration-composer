import {
  countTemplateCandidates,
  type CompositionIntent,
  type Format,
  type LoadedLibrary,
} from '@ic/core';

export interface Combo {
  variant: number;
  template: number;
}

/** Layouts composeScene can pick for this intent and format (≥ 1); core owns the rule. */
export const templateCount = (
  intent: CompositionIntent,
  format: Format,
  lib: LoadedLibrary,
): number => Math.max(1, countTemplateCandidates(intent, format, lib));

/** «Другой вариант»: the next template of the current variant, then the next variant. */
export function nextCombo(c: Combo, counts: number[]): Combo {
  if (counts.length === 0) return c;
  if (c.template + 1 < (counts[c.variant] ?? 1)) return { ...c, template: c.template + 1 };
  return { variant: (c.variant + 1) % counts.length, template: 0 };
}

export const totalCombos = (counts: number[]): number => counts.reduce((a, b) => a + b, 0);

/** 1-based position of a combo in the full walk, for «3 из 7». */
export const comboPosition = (c: Combo, counts: number[]): number =>
  counts.slice(0, c.variant).reduce((a, b) => a + b, 0) + c.template + 1;

/**
 * Drops variants that lay out identically. Roles and slots follow item size, not the declared role (D4), so
 * two intents with the same items in the same states give the same layouts whatever their
 * order or declared roles: «Другой вариант» would otherwise show repeats.
 */
export function uniqueVariants(variants: CompositionIntent[]): CompositionIntent[] {
  const seen = new Set<string>();
  return variants.filter((v) => {
    const key = v.items
      .map((i) => `${i.item}:${i.state}`)
      .sort()
      .join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
