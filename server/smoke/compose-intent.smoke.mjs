/* global process, console, Request */
// Runs the built function the way Vercel does: plain Node ESM, no TypeScript, no vitest transforms.
// Without an API key the handler must still answer 200 with offline variants.
import assert from 'node:assert/strict';

delete process.env.ANTHROPIC_API_KEY;

const { POST } = await import('../../api/compose-intent.js');

const response = await POST(
  new Request('http://localhost/api/compose-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify({ text: 'Финансовая подушка безопасности' }),
  }),
);

assert.equal(response.status, 200);
const body = await response.json();
assert.equal(body.source, 'fallback');
assert.ok(Array.isArray(body.variants) && body.variants.length > 0, 'expected offline variants');
assert.ok(
  body.variants.every((v) => v.items.filter((i) => i.role === 'hero').length === 1),
  'every variant has exactly one hero',
);

console.log(`smoke: POST /api/compose-intent → 200, ${body.variants.length} fallback variant(s)`);
