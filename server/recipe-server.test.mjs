import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecipeServer } from './recipe-server.mjs';

async function start(t, options = {}) {
  const server = createRecipeServer({ staticDir: null, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, request: (body, init = {}) => fetch(`${base}/api/recipes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...init }) };
}
const providerResult = value => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) });

test('health reports missing credentials and lookup never calls the provider', async t => {
  let calls = 0;
  const { base, request } = await start(t, { env: {}, fetchImpl: async () => { calls++; } });
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', aiConfigured: false });
  const response = await request({ meal: 'Jollof rice' });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /AI_API_KEY/);
  assert.equal(calls, 0);
});

test('AI request uses server credentials and strict structured output; groceries are normalized', async t => {
  let providerRequest;
  const { request } = await start(t, { env: { AI_API_KEY: 'test-key-only', AI_MODEL: 'test-model' }, fetchImpl: async (url, options) => {
    providerRequest = { url, options };
    return providerResult({ name: ' Jollof rice ', ingredients: ['Rice', ' tomatoes ', 'rice'] });
  } });
  const response = await request({ meal: '  Jollof rice  ' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { name: 'Jollof rice', ingredients: ['rice', 'tomatoes'] });
  assert.equal(providerRequest.url, 'https://api.openai.com/v1/responses');
  assert.equal(providerRequest.options.headers.Authorization, 'Bearer test-key-only');
  const body = JSON.parse(providerRequest.options.body);
  assert.equal(body.model, 'test-model');
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.deepEqual(JSON.parse(body.input), { meal: 'Jollof rice' });
});

test('invalid and oversized requests fail before calling AI', async t => {
  let calls = 0;
  const { request } = await start(t, { env: { AI_API_KEY: 'test' }, fetchImpl: () => { calls++; } });
  for (const body of [{}, { meal: 5 }, { meal: ' ' }, { meal: 'a'.repeat(161) }]) assert.equal((await request(body)).status, 400);
  assert.equal((await request(null, { body: '{invalid' })).status, 400);
  assert.equal((await request({ meal: 'jollof' }, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request({ meal: 'a'.repeat(9000) })).status, 413);
  assert.equal(calls, 0);
});

test('CORS permits loopback development origins and blocks unrelated sites', async t => {
  const { base } = await start(t, { env: {} });
  const allowed = await fetch(`${base}/api/health`, { headers: { Origin: 'http://localhost:8081' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8081');
  const blocked = await fetch(`${base}/api/health`, { headers: { Origin: 'https://unrelated.example' } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null);
  const preflight = await fetch(`${base}/api/recipes`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:8081' } });
  assert.equal(preflight.status, 204);
});

test('configured web origin replaces default allowed origins', async t => {
  const { base } = await start(t, { env: { AI_ALLOWED_ORIGIN: 'https://planner.example' } });
  assert.equal((await fetch(`${base}/api/health`, { headers: { Origin: 'https://planner.example' } })).status, 200);
  assert.equal((await fetch(`${base}/api/health`, { headers: { Origin: 'http://localhost:8081' } })).status, 403);
});

test('rate limit blocks excessive requests and resets after its window', async t => {
  let timestamp = 1000;
  const { request } = await start(t, { env: {}, rateLimit: 1, rateWindowMs: 1000, now: () => timestamp });
  assert.equal((await request({ meal: 'jollof' })).status, 503);
  const limited = await request({ meal: 'jollof' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '1');
  timestamp += 1001;
  assert.equal((await request({ meal: 'jollof' })).status, 503);
});

test('provider errors return controlled messages without disclosing upstream content', async t => {
  for (const [providerStatus, expected] of [[401, 503], [403, 503], [429, 429], [500, 502]]) {
    const { request } = await start(t, { env: { AI_API_KEY: 'never-disclose-this' }, fetchImpl: async () => ({ ok: false, status: providerStatus, json: async () => ({ error: 'never-disclose-this' }) }) });
    const response = await request({ meal: 'jollof' });
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /never-disclose-this/);
  }
});

test('provider timeout is distinguishable from a network error', async t => {
  for (const [name, expected] of [['TimeoutError', 504], ['TypeError', 502]]) {
    const { request } = await start(t, { env: { AI_API_KEY: 'test' }, fetchImpl: async () => { throw Object.assign(new Error('hidden upstream information'), { name }); } });
    const response = await request({ meal: 'jollof' });
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /hidden upstream/);
  }
});

test('malformed, excessive and empty AI recipes are rejected', async t => {
  const values = [{ name: 'Rice', ingredients: 'rice' }, { name: 'Rice', ingredients: [''] }, { name: 'Rice', ingredients: Array(51).fill('rice') }, { name: 'Rice', ingredients: [] }];
  for (const value of values) {
    const { request } = await start(t, { env: { AI_API_KEY: 'test' }, fetchImpl: async () => providerResult(value) });
    assert.equal((await request({ meal: 'jollof' })).status, Array.isArray(value.ingredients) && !value.ingredients.length ? 422 : 502);
  }
});

test('AI refusal and incomplete output are handled without untrusted text', async t => {
  for (const [output, expected] of [
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'hidden details' }] }] }, 422],
    [{ status: 'incomplete', output: [] }, 502],
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'invalid' }] }] }, 502],
  ]) {
    const { request } = await start(t, { env: { AI_API_KEY: 'test' }, fetchImpl: async () => ({ ok: true, json: async () => output }) });
    const response = await request({ meal: 'jollof' });
    assert.equal(response.status, expected);
    assert.doesNotMatch(await response.text(), /hidden details/);
  }
});

test('static serving stays inside its public directory and denies dotfiles or escaping symlinks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'menu-server-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const publicDir = join(root, 'public');
  await mkdir(publicDir);
  await writeFile(join(publicDir, 'index.html'), '<h1>Menu Planner</h1>');
  await writeFile(join(root, 'secret.txt'), 'private');
  await writeFile(join(publicDir, '.env.server'), 'private');
  await symlink(join(root, 'secret.txt'), join(publicDir, 'escape.txt'));
  const { base } = await start(t, { env: {}, staticDir: publicDir });
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.equal(await home.text(), '<h1>Menu Planner</h1>');
  assert.equal((await fetch(base, { method: 'HEAD' })).status, 200);
  for (const path of ['/escape.txt', '/.env.server', '/%2e%2e/secret.txt', '/%2e%2e%2fsecret.txt', '/..%5csecret.txt', '/%00']) assert.equal((await fetch(`${base}${path}`)).status, 404);
});
