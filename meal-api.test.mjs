import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMeal, mealServiceUrl, restoreGeneratedRecipes } from './meal-api.mjs';
import { groceryList, recipes } from './recipes.js';

test('web development uses the IPv4 API while exports and mobile keep their own routes', () => {
  const location = { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:3001' };
  assert.equal(mealServiceUrl({ platform: 'web', development: true, location }), 'http://127.0.0.1:3001');
  assert.equal(mealServiceUrl({ platform: 'web', development: false, location }), location.origin);
  assert.equal(mealServiceUrl({ platform: 'ios' }), undefined);
  assert.equal(mealServiceUrl({ platform: 'android', configuredUrl: ' https://example.com ' }), 'https://example.com');
});

test('AI meal request uses the backend and merges ingredients with selected meals', async () => {
  const recipe = await generateMeal(' Jollof rice ', { baseUrl: 'http://meal-service/', fetchImpl: async (url, options) => {
    assert.equal(url, 'http://meal-service/api/recipes');
    assert.deepEqual(JSON.parse(options.body), { meal: 'Jollof rice' });
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    return { ok: true, json: async () => ({ name: 'Jollof rice', ingredients: ['Rice', 'tomatoes', 'rice'] }) };
  } });
  const saved = restoreGeneratedRecipes(JSON.parse(JSON.stringify({ [recipe.name]: recipe.ingredients })));
  const list = groceryList(['Jollof rice', 'Tacos'], '', { ...recipes, ...saved });
  assert.ok(list.includes('rice'));
  assert.equal(list.filter(item => item === 'tomatoes').length, 1);
  assert.ok(list.includes('tortillas'));
});
test('missing configuration, provider failures and invalid recipes are actionable', async () => {
  await assert.rejects(generateMeal('Curry', {}), /not connected/);
  await assert.rejects(generateMeal('a', { baseUrl: 'http://meal-service' }), /between 2 and 160/);
  await assert.rejects(generateMeal('Curry', { baseUrl: 'http://meal-service', fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ error: 'AI lookup needs a server key.' }) }) }), /needs a server key/);
  await assert.rejects(generateMeal('Curry', { baseUrl: 'http://meal-service', fetchImpl: async () => ({ ok: true, json: async () => ({ name: 'Curry', ingredients: [] }) }) }), /incomplete/);
});
test('timeout and unavailable network do not leave a request waiting', async () => {
  await assert.rejects(generateMeal('Curry', { baseUrl: 'http://meal-service', timeoutMs: 5, fetchImpl: async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) }), /too long/);
  await assert.rejects(generateMeal('Curry', { baseUrl: 'http://meal-service', fetchImpl: async () => { throw new TypeError('network'); } }), /Could not connect/);
});
test('stored generated recipes are checked without losing valid entries', () => {
  assert.deepEqual(restoreGeneratedRecipes({ Good: ['Rice'], Broken: null }), { Good: ['rice'] });
  assert.deepEqual(restoreGeneratedRecipes(null), {});
});
