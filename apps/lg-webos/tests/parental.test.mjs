import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAdultGroup, readParentalPin, validParentalPin } from '../src/lib/parental.ts';

test('recognizes adult categories in all three sections without treating all films as adult', () => {
  for (const group of ['Canais | Adultos', 'Filmes / ADULTO', 'Séries | +18', '18+', 'XXX', 'Adult', 'Eróticos', 'Pornografia']) assert.equal(isAdultGroup(group), true, group);
  for (const group of ['Canais | Notícias', 'Filmes | Drama', 'Séries | Netflix', 'Canal 18', 'Infantil']) assert.equal(isAdultGroup(group), false, group);
});
test('defaults to 0000 and preserves only a valid four-digit PIN', () => {
  assert.equal(readParentalPin({ getItem: () => null }), '0000');
  assert.equal(readParentalPin({ getItem: () => '1234' }), '1234');
  assert.equal(readParentalPin({ getItem: () => '123' }), '0000');
  assert.equal(readParentalPin({ getItem: () => { throw new Error('Unavailable'); } }), '0000');
  assert.equal(validParentalPin('0000'), true);
  assert.equal(validParentalPin('12345'), false);
  assert.equal(validParentalPin('abcd'), false);
});
