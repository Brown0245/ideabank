import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groceryList } from './recipes.js';

test('selected dishes generate ingredients and combine shared groceries', () => {
  const list = groceryList(['Tacos', 'Burgers']);
  assert.ok(list.includes('tortillas'));
  assert.ok(list.includes('burger buns'));
  assert.equal(list.filter(item => item === 'ground beef').length, 1);
});
test('removing a dish removes its unique groceries', () => {
  assert.ok(!groceryList(['Burgers']).includes('tortillas'));
});
test('custom groceries merge with recipes and empty entries are ignored', () => {
  const list = groceryList(['Tacos'], ' Tomatoes, apples\n bananas, ,');
  assert.equal(list.filter(item => item === 'tomatoes').length, 1);
  assert.ok(list.includes('apples'));
  assert.ok(list.includes('bananas'));
  assert.ok(!list.includes(''));
  assert.deepEqual(groceryList([]), []);
});
