import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { checkMealService, startWeb } from './start-web.mjs';

function child() {
  const value = new EventEmitter();
  value.exitCode = null;
  value.signalCode = null;
  value.killedWith = [];
  value.kill = signal => {
    value.killedWith.push(signal);
    queueMicrotask(() => { value.signalCode = signal; value.emit('exit', null, signal); });
  };
  return value;
}
function harness(health) {
  const calls = [];
  return {
    calls,
    options: {
      env: { AI_API_KEY: 'test-only-secret', OPENAI_API_KEY: 'another-test-only-secret' },
      checkHealth: health,
      wait: async () => {},
      log: () => {},
      spawnImpl: (command, args, options) => { const process = child(); calls.push({ command, args, options, process }); return process; },
    },
  };
}

test('one command starts API before Expo and keeps credentials out of Expo', async () => {
  let count = 0;
  const h = harness(async () => ++count === 1 ? null : { status: 'ok', aiConfigured: true });
  const running = await startWeb(h.options);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls[0].args.includes('server/index.mjs'));
  assert.equal(h.calls[0].options.env.AI_API_KEY, 'test-only-secret');
  assert.equal(h.calls[0].options.env.API_HOST, '127.0.0.1');
  assert.equal(h.calls[1].options.env.AI_API_KEY, undefined);
  assert.equal(h.calls[1].options.env.OPENAI_API_KEY, undefined);
  assert.equal(h.calls[1].options.env.EXPO_PUBLIC_API_URL, 'http://127.0.0.1:3001');
  assert.ok(h.calls[1].args.includes('--web'));
  await running.stop();
  assert.equal(await running.done, 0);
  assert.deepEqual(h.calls.map(call => call.process.killedWith), [['SIGTERM'], ['SIGTERM']]);
});

test('an existing service is reused and never stopped by the web runner', async () => {
  const h = harness(async () => ({ status: 'ok', aiConfigured: false }));
  const running = await startWeb(h.options);
  assert.equal(h.calls.length, 1);
  assert.ok(!h.calls[0].args.includes('server/index.mjs'));
  await running.stop();
  assert.deepEqual(h.calls[0].process.killedWith, ['SIGTERM']);
});

test('an API failure stops Expo and returns a failing exit status', async () => {
  let count = 0;
  const h = harness(async () => ++count === 1 ? null : { status: 'ok', aiConfigured: true });
  const running = await startWeb(h.options);
  h.calls[0].process.exitCode = 1;
  h.calls[0].process.emit('exit', 1, null);
  assert.equal(await running.done, 1);
  assert.deepEqual(h.calls[1].process.killedWith, ['SIGTERM']);
});

test('Expo completion stops an owned API and preserves successful exit status', async () => {
  let count = 0;
  const h = harness(async () => ++count === 1 ? null : { status: 'ok', aiConfigured: true });
  const running = await startWeb(h.options);
  h.calls[1].process.exitCode = 0;
  h.calls[1].process.emit('exit', 0, null);
  assert.equal(await running.done, 0);
  assert.deepEqual(h.calls[0].process.killedWith, ['SIGTERM']);
});

test('readiness failure stops its API and never starts Expo', async () => {
  const h = harness(async () => null);
  await assert.rejects(startWeb({ ...h.options, readyTimeoutMs: 0 }), /did not start/);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].process.killedWith, ['SIGTERM']);
});

test('an API exit during readiness fails promptly without launching Expo', async () => {
  const h = harness(async () => null);
  await assert.rejects(startWeb({ ...h.options, wait: async () => {
    h.calls[0].process.exitCode = 1;
    h.calls[0].process.emit('exit', 1, null);
  } }), /Meal service stopped/);
  assert.equal(h.calls.length, 1);
});

test('custom ports are shared by API and browser configuration', async () => {
  let count = 0;
  const h = harness(async url => {
    assert.equal(url, 'http://127.0.0.1:3002');
    return ++count === 1 ? null : { status: 'ok', aiConfigured: true };
  });
  const running = await startWeb({ ...h.options, env: { API_PORT: '3002' }, expoArgs: ['--port', '8084'] });
  assert.equal(h.calls[0].options.env.API_PORT, '3002');
  assert.equal(h.calls[1].options.env.EXPO_PUBLIC_API_URL, 'http://127.0.0.1:3002');
  assert.deepEqual(h.calls[1].args.slice(-2), ['--port', '8084']);
  await running.stop();
});

test('health detection distinguishes an absent service from a different app', async () => {
  assert.equal(await checkMealService('http://test', async () => { throw new TypeError('refused'); }), null);
  await assert.rejects(checkMealService('http://test', async () => ({ ok: true, json: async () => ({ other: 'app' }) })), /another app/);
  assert.deepEqual(await checkMealService('http://test', async () => ({ ok: true, json: async () => ({ status: 'ok', aiConfigured: true }) })), { status: 'ok', aiConfigured: true });
});
