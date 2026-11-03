import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import vercelConfig from '../../vercel.json';
import {
  MODEL_MAX_RETRIES,
  MODEL_TIMEOUT_MS,
  handleComposeIntent,
  type ClientLike,
  type ComposeDeps,
} from '../compose-intent';
import { createRateLimiter } from '../lib/rateLimit';
import { buildSystemPrompt } from '../lib/prompt';

const good = {
  variants: [
    {
      items: [
        { item: 'coin', state: 'main', role: 'hero' },
        { item: 'wallet', state: 'main', role: 'support' },
      ],
      rationale: 'Монета и кошелёк',
    },
    {
      items: [
        { item: 'wallet', state: 'main', role: 'hero' },
        { item: 'coin', state: 'background', role: 'backdrop' },
      ],
      rationale: 'Кошелёк',
    },
  ],
};

type Parse = ClientLike['messages']['parse'];

function deps(
  parse: Parse,
  over: Partial<ComposeDeps> = {},
): ComposeDeps & { parse: ReturnType<typeof vi.fn> } {
  const fn = vi.fn(parse);
  return {
    parse: fn,
    env: { ANTHROPIC_API_KEY: 'sk-test' },
    now: () => 1_000_000,
    ip: '1.2.3.4',
    limiter: createRateLimiter(),
    createClient: () => ({ messages: { parse: fn } }),
    ...over,
  };
}

const ok =
  (parsed: unknown, stop_reason = 'end_turn') =>
  async () => ({
    parsed_output: parsed,
    stop_reason,
  });

describe('handleComposeIntent', () => {
  it('returns AI variants', async () => {
    const d = deps(ok(good));
    const r = await handleComposeIntent({ text: 'Финансовая подушка безопасности' }, d);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ source: 'ai' });
    expect((r.body as { variants: unknown[] }).variants).toHaveLength(2);
    const arg = d.parse.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.model).toBe('claude-haiku-5-5');
    expect(arg).not.toHaveProperty('temperature');
  });

  it('falls back on APIConnectionError', async () => {
    const d = deps(async () => {
      throw new Anthropic.APIConnectionError({ message: 'down' });
    });
    const r = await handleComposeIntent({ text: 'деньги' }, d);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ source: 'fallback', notice: 'Подобрано без AI' });
  });

  it('falls back on refusal', async () => {
    const r = await handleComposeIntent({ text: 'деньги' }, deps(ok(null, 'refusal')));
    expect(r.body).toMatchObject({ source: 'fallback' });
  });

  it('falls back on null parsed_output', async () => {
    const r = await handleComposeIntent({ text: 'деньги' }, deps(ok(null)));
    expect(r.body).toMatchObject({ source: 'fallback' });
  });

  it('filters variants without hero or with several heroes', async () => {
    const noHero = {
      items: [{ item: 'coin', state: 'main', role: 'support' }],
      rationale: 'x',
    };
    const twoHeroes = {
      items: [
        { item: 'coin', state: 'main', role: 'hero' },
        { item: 'wallet', state: 'main', role: 'hero' },
      ],
      rationale: 'x',
    };
    const r = await handleComposeIntent(
      { text: 'деньги' },
      deps(ok({ variants: [noHero, twoHeroes, good.variants[0]] })),
    );
    expect(r.body).toMatchObject({ source: 'ai' });
    expect((r.body as { variants: unknown[] }).variants).toHaveLength(1);
  });

  it('falls back when every variant is filtered', async () => {
    const noHero = { items: [{ item: 'coin', state: 'main', role: 'support' }], rationale: 'x' };
    const r = await handleComposeIntent({ text: 'деньги' }, deps(ok({ variants: [noHero] })));
    expect(r.body).toMatchObject({ source: 'fallback' });
  });

  it('falls back when parsed output violates the schema', async () => {
    const r = await handleComposeIntent({ text: 'деньги' }, deps(ok({ variants: [] })));
    expect(r.body).toMatchObject({ source: 'fallback' });
  });

  it('rejects empty, blank, non-string and too long text with 400', async () => {
    for (const body of [
      { text: '' },
      { text: '   ' },
      { text: 5 },
      null,
      { text: 'я'.repeat(301) },
    ]) {
      const d = deps(ok(good));
      expect((await handleComposeIntent(body, d)).status).toBe(400);
      expect(d.parse).not.toHaveBeenCalled();
    }
  });

  it('accepts exactly 300 characters', async () => {
    const r = await handleComposeIntent({ text: 'я'.repeat(300) }, deps(ok(good)));
    expect(r.status).toBe(200);
  });

  it('429 on the 11th request from one IP, other IPs unaffected', async () => {
    const limiter = createRateLimiter();
    const d = deps(ok(good), { limiter });
    for (let i = 0; i < 10; i++) {
      expect((await handleComposeIntent({ text: 'деньги' }, d)).status).toBe(200);
    }
    expect((await handleComposeIntent({ text: 'деньги' }, d)).status).toBe(429);
    const other = deps(ok(good), { limiter, ip: '9.9.9.9' });
    expect((await handleComposeIntent({ text: 'деньги' }, other)).status).toBe(200);
  });

  it('rate limit window expires after 60 s', async () => {
    const limiter = createRateLimiter();
    let t = 0;
    const d = deps(ok(good), { limiter, now: () => t });
    for (let i = 0; i < 10; i++) await handleComposeIntent({ text: 'деньги' }, d);
    expect((await handleComposeIntent({ text: 'деньги' }, d)).status).toBe(429);
    t = 60_001;
    expect((await handleComposeIntent({ text: 'деньги' }, d)).status).toBe(200);
  });

  it('falls back without calling the SDK when the key is missing', async () => {
    const d = deps(ok(good), { env: {} });
    const r = await handleComposeIntent({ text: 'деньги' }, d);
    expect(r.body).toMatchObject({ source: 'fallback', notice: 'Подобрано без AI' });
    expect(d.parse).not.toHaveBeenCalled();
  });
});

describe('model call budget', () => {
  it('ends before the platform kills the function, so the fallback can still answer', () => {
    const maxDurationMs = vercelConfig.functions['api/compose-intent.js'].maxDuration * 1000;
    const worstCaseMs = MODEL_TIMEOUT_MS * (MODEL_MAX_RETRIES + 1);
    // headroom for cold start, the offline fallback and the response itself
    expect(worstCaseMs).toBeLessThanOrEqual(maxDurationMs - 5_000);
  });
});

describe('buildSystemPrompt', () => {
  it('is deterministic and lists every item', () => {
    const catalog = [{ item: 'coin' as const, names: ['монета'], meanings: ['деньги'] }];
    const p = buildSystemPrompt(catalog);
    expect(p).toBe(buildSystemPrompt(catalog));
    expect(p).toContain('coin');
    expect(p).toContain('монета');
  });
});
