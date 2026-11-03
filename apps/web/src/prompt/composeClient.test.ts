import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_INTENT } from '@ic/core';
import { ComposeError, EXAMPLES, LOCAL_NOTICE, hintFor, requestIntents } from './composeClient';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const aiVariant = {
  items: [
    { item: 'coin', state: 'main', role: 'hero' },
    { item: 'wallet', state: 'main', role: 'support' },
  ],
  rationale: 'Монета и кошелёк',
};

describe('requestIntents: names', () => {
  it('works locally and never calls fetch', async () => {
    const fetch = vi.fn();
    const r = await requestIntents('книга и лампа', 'names', { fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(r.source).toBe('local');
    expect(r.variants).toHaveLength(1);
    expect(r.variants[0]!.items.map((i) => i.item)).toEqual(['book', 'lamp']);
    expect(r.variants[0]!.items[0]!.role).toBe('hero');
  });

  it('reports unknown words with item labels as suggestions', async () => {
    const r = await requestIntents('тел и книга', 'names', { fetch: vi.fn() });
    expect(r.unknown).toEqual([{ token: 'тел', suggestions: ['Телефон'] }]);
    expect(hintFor(r.unknown![0]!)).toBe('Нет объекта «тел». Может, «Телефон»?');
  });

  it('returns no variants when nothing is recognised', async () => {
    const r = await requestIntents('абракадабра', 'names', { fetch: vi.fn() });
    expect(r.variants).toEqual([]);
    expect(hintFor(r.unknown![0]!)).toBe('Нет объекта «абракадабра» в библиотеке');
  });
});

describe('requestIntents: metaphor', () => {
  it('POSTs {text} to /api/compose-intent', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ source: 'ai', variants: [aiVariant] }));
    const r = await requestIntents('копим на мечту', 'metaphor', { fetch });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/compose-intent');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ text: 'копим на мечту' });
    expect(r).toEqual({ source: 'ai', variants: [aiVariant] });
  });

  it('falls back to local matching when fetch rejects', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await requestIntents('финансовая подушка', 'metaphor', { fetch });
    expect(r.source).toBe('local');
    expect(r.variants.length).toBeGreaterThan(0);
    expect(r.notice).toBe(LOCAL_NOTICE);
  });

  it('falls back locally on 404 (vite dev has no API) and on 5xx', async () => {
    for (const status of [404, 500, 502]) {
      const fetch = vi.fn().mockResolvedValue(new Response('Not Found', { status }));
      const r = await requestIntents('учёба онлайн', 'metaphor', { fetch });
      expect(r.source).toBe('local');
      expect(r.variants.length).toBeGreaterThan(0);
    }
  });

  it('falls back locally when the server body is not a valid intent', async () => {
    const bad = { source: 'ai', variants: [{ items: [{ item: 'rocket', state: 'main' }] }] };
    const fetch = vi.fn().mockResolvedValue(json(bad));
    const r = await requestIntents('учёба онлайн', 'metaphor', { fetch });
    expect(r.source).toBe('local');
  });

  it('passes the server notice through for source fallback', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json({ source: 'fallback', variants: [aiVariant], notice: 'Подобрано без AI' }),
      );
    const r = await requestIntents('деньги', 'metaphor', { fetch });
    expect(r.source).toBe('fallback');
    expect(r.notice).toBe('Подобрано без AI');
    expect(r.variants).toEqual([aiVariant]);
  });

  it('throws the server message on 400 and 429', async () => {
    for (const status of [400, 429]) {
      const fetch = vi.fn().mockResolvedValue(json({ error: 'Слишком много запросов' }, status));
      const err = await requestIntents('деньги', 'metaphor', { fetch }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ComposeError);
      expect((err as ComposeError).message).toBe('Слишком много запросов');
      expect((err as ComposeError).status).toBe(status);
    }
  });
});

describe('example chips', () => {
  it('each example finds items offline, not the no-match default', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    for (const ex of EXAMPLES) {
      const r = await requestIntents(ex, 'metaphor', { fetch });
      expect(r.variants[0]!.rationale, ex).not.toBe(DEFAULT_INTENT.rationale);
    }
  });
});

describe('superseded requests', () => {
  it('an aborted request rejects with AbortError and does not fall back locally', async () => {
    const fetch = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
        }),
    );
    const ctrl = new AbortController();
    const pending = requestIntents('деньги', 'metaphor', { fetch, signal: ctrl.signal });
    ctrl.abort();
    const err = await pending.catch((e: unknown) => e);
    expect((err as Error).name).toBe('AbortError');
  });

  it('an already aborted signal never calls fetch', async () => {
    const fetch = vi.fn();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      requestIntents('деньги', 'metaphor', { fetch, signal: ctrl.signal }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
