import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  IntentResponseSchema,
  matchByMetaphor,
  type CatalogEntry,
  type CompositionIntent,
} from '@ic/core';
import rawCatalog from '@ic/library/data/catalog.ru.json';
import { buildSystemPrompt } from './lib/prompt';
import { createRateLimiter, type RateLimiter } from './lib/rateLimit';

const MODEL = 'claude-haiku-5-5';
const MAX_TEXT = 300;
const FALLBACK_NOTICE = 'Подобрано без AI';

/**
 * Model-call budget. vercel.json caps the function at 20 s; past that the platform answers 504
 * and the offline fallback below never runs. One 12 s attempt gives a fixed worst case with room
 * for cold start and the fallback. No retries: before a retry the SDK sleeps for whatever
 * `Retry-After` the API sends, so a retry has no upper bound. A typical answer takes a few seconds.
 */
export const MODEL_TIMEOUT_MS = 12_000;
export const MODEL_MAX_RETRIES = 0;

const catalog = rawCatalog as CatalogEntry[];

type ParseParams = Parameters<Anthropic['messages']['parse']>[0];

/** The slice of the SDK client this endpoint uses; tests inject a fake. */
export interface ClientLike {
  messages: {
    parse(params: ParseParams): Promise<{
      parsed_output: unknown;
      stop_reason: string | null;
    }>;
  };
}

export interface ComposeDeps {
  env: { ANTHROPIC_API_KEY?: string };
  now: () => number;
  ip: string;
  limiter: RateLimiter;
  createClient: (apiKey: string) => ClientLike;
}

export type ComposeBody =
  { source: 'ai' | 'fallback'; variants: CompositionIntent[]; notice?: string } | { error: string };

export interface ComposeResult {
  status: 200 | 400 | 429;
  body: ComposeBody;
}

const heroCount = (v: CompositionIntent): number => v.items.filter((i) => i.role === 'hero').length;

function fallback(text: string): ComposeResult {
  return {
    status: 200,
    body: { source: 'fallback', variants: matchByMetaphor(text, catalog), notice: FALLBACK_NOTICE },
  };
}

async function askModel(text: string, client: ClientLike): Promise<CompositionIntent[] | null> {
  try {
    const r = await client.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system: buildSystemPrompt(catalog),
      messages: [{ role: 'user', content: text }],
      output_config: { effort: 'low', format: zodOutputFormat(IntentResponseSchema) },
    });
    if (r.stop_reason === 'refusal' || r.parsed_output == null) return null;
    // Re-validate strictly: structured output does not enforce array min/max for us.
    const parsed = IntentResponseSchema.safeParse(r.parsed_output);
    if (!parsed.success) return null;
    const variants = parsed.data.variants.filter((v) => heroCount(v) === 1);
    return variants.length > 0 ? variants : null;
  } catch (err) {
    // Any SDK failure (connection, rate limit, API error) degrades to offline matching.
    if (err instanceof Anthropic.APIError) {
      console.warn('compose-intent: anthropic error', err.status ?? 'connection');
    } else {
      console.warn('compose-intent: unexpected error', err);
    }
    return null;
  }
}

export async function handleComposeIntent(
  body: unknown,
  deps: ComposeDeps,
): Promise<ComposeResult> {
  if (!deps.limiter.hit(deps.ip, deps.now())) {
    return { status: 429, body: { error: 'Слишком много запросов, попробуйте через минуту' } };
  }
  const raw =
    typeof body === 'object' && body !== null ? (body as { text?: unknown }).text : undefined;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length === 0 || text.length > MAX_TEXT) {
    return { status: 400, body: { error: `Текст должен быть от 1 до ${MAX_TEXT} символов` } };
  }

  const apiKey = deps.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback(text);

  const variants = await askModel(text, deps.createClient(apiKey));
  return variants ? { status: 200, body: { source: 'ai', variants } } : fallback(text);
}

const limiter = createRateLimiter();

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // malformed JSON is handled as an empty body -> 400
  }
  const { status, body: json } = await handleComposeIntent(body, {
    env: process.env,
    now: Date.now,
    ip: clientIp(request),
    limiter,
    createClient: (apiKey) => {
      const client = new Anthropic({
        apiKey,
        timeout: MODEL_TIMEOUT_MS,
        maxRetries: MODEL_MAX_RETRIES,
      });
      return { messages: { parse: (p) => client.messages.parse(p) } };
    },
  });
  return Response.json(json, { status });
}
