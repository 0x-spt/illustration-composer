import rawCatalog from '@ic/library/data/catalog.ru.json';
import rawManifest from '@ic/library/data/manifest.json';
import {
  IntentResponseSchema,
  intentFromNames,
  matchByMetaphor,
  matchByNames,
  type CatalogEntry,
  type CompositionIntent,
  type ItemId,
  type LibraryManifest,
} from '@ic/core';

const catalog = rawCatalog as CatalogEntry[];
const manifest = rawManifest as unknown as LibraryManifest;

export type ComposeMode = 'metaphor' | 'names';
export type IntentSource = 'ai' | 'fallback' | 'local';

/** A word that matched no item, with item labels that start like it. */
export interface UnknownHint {
  token: string;
  suggestions: string[];
}

export interface IntentResult {
  source: IntentSource;
  variants: CompositionIntent[];
  notice?: string;
  unknown?: UnknownHint[];
}

export interface ClientDeps {
  fetch?: typeof fetch;
  /** Aborts a superseded request: it then rejects with an AbortError and does not fall back. */
  signal?: AbortSignal;
}

/** 400 (bad input) and 429 (rate limit): the server's own message, nothing is composed. */
export class ComposeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ComposeError';
  }
}

export const ENDPOINT = '/api/compose-intent';
/** Shown when the API is unreachable (no network, `vite dev` without functions, 404/5xx). */
export const LOCAL_NOTICE = 'Подобрано без AI: сервис подбора недоступен';
/**
 * Above the server's worst case (one 12 s model call, then the offline fallback) and equal to the
 * function's maxDuration: by then the server has answered or the platform has returned 504.
 */
const TIMEOUT_MS = 20_000;

/** Ready examples under the prompt bar (scenario 1). */
export const EXAMPLES = ['Финансовая подушка', 'Командная работа над идеей', 'Учёба онлайн'];

const labelOf = (id: ItemId): string => manifest.items.find((i) => i.id === id)?.label ?? id;

/** «Нет объекта «тел». Может, «Телефон»?» */
export function hintFor(u: UnknownHint): string {
  if (u.suggestions.length === 0) return `Нет объекта «${u.token}» в библиотеке`;
  const list = u.suggestions.map((s) => `«${s}»`).join(' или ');
  return `Нет объекта «${u.token}». Может, ${list}?`;
}

function byNames(text: string): IntentResult {
  const match = matchByNames(text, catalog);
  const unknown = match.unknown.map((u) => ({
    token: u.token,
    suggestions: u.suggestions.slice(0, 2).map(labelOf),
  }));
  return {
    source: 'local',
    variants: match.items.length > 0 ? [intentFromNames(match.items)] : [],
    ...(unknown.length > 0 ? { unknown } : {}),
  };
}

const local = (text: string): IntentResult => ({
  source: 'local',
  variants: matchByMetaphor(text, catalog),
  notice: LOCAL_NOTICE,
});

/** Server reply, validated: only known items and the intent schema get through. */
function parseServer(body: unknown): IntentResult | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as { source?: unknown; notice?: unknown };
  if (b.source !== 'ai' && b.source !== 'fallback') return null;
  const parsed = IntentResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  const notice = typeof b.notice === 'string' ? b.notice.slice(0, 200) : undefined;
  return { source: b.source, variants: parsed.data.variants, ...(notice ? { notice } : {}) };
}

async function byMetaphor(
  text: string,
  doFetch: typeof fetch,
  cancel?: AbortSignal,
): Promise<IntentResult> {
  cancel?.throwIfAborted();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = cancel ? AbortSignal.any([cancel, timeout]) : timeout;
  let res: Response;
  try {
    res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    });
  } catch (e) {
    // superseded by a newer request: not a network failure, nothing to fall back to
    if (cancel?.aborted) throw e;
    return local(text);
  }
  if (res.status === 400 || res.status === 429) {
    const body: unknown = await res.json().catch(() => null);
    const msg =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : 'Не удалось подобрать предметы';
    throw new ComposeError(msg, res.status);
  }
  if (!res.ok) return local(text);
  const body: unknown = await res.json().catch(() => null);
  cancel?.throwIfAborted();
  return parseServer(body) ?? local(text);
}

/**
 * Scenario 1 (`metaphor`) asks the API and falls back to the offline catalog match;
 * scenario 2 (`names`) is always local and never touches the network.
 */
export function requestIntents(
  text: string,
  mode: ComposeMode,
  deps: ClientDeps = {},
): Promise<IntentResult> {
  if (mode === 'names') return Promise.resolve(byNames(text));
  return byMetaphor(text, deps.fetch ?? globalThis.fetch.bind(globalThis), deps.signal);
}
