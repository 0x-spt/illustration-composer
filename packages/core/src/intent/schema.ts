import { z } from 'zod';
import { ITEM_IDS, type ItemId } from '../library/types';

export const IntentItemSchema = z.object({
  item: z.enum(ITEM_IDS),
  state: z.enum(['main', 'background']),
  role: z.enum(['hero', 'support', 'backdrop']),
});

export const CompositionIntentSchema = z.object({
  items: z.array(IntentItemSchema).min(1).max(4),
  rationale: z.string().max(200),
});

export const IntentResponseSchema = z.object({
  variants: z.array(CompositionIntentSchema).min(1).max(3),
});

export type IntentItem = z.infer<typeof IntentItemSchema>;
export type CompositionIntent = z.infer<typeof CompositionIntentSchema>;
export type IntentResponse = z.infer<typeof IntentResponseSchema>;

/** One entry of `catalog.ru.json`: how users call an item and what it stands for. */
export interface CatalogEntry {
  item: ItemId;
  names: string[];
  meanings: string[];
}

export const MAX_INTENT_ITEMS = 4;

/** Used when a metaphor matches nothing. */
export const DEFAULT_INTENT: CompositionIntent = {
  items: [
    { item: 'phone', state: 'main', role: 'hero' },
    { item: 'puzzle', state: 'main', role: 'support' },
  ],
  rationale: 'no-match',
};
