import test from 'node:test';
import assert from 'node:assert/strict';
import { customerMapHref } from '../src/components/rider/deliveryPresentation.js';
test('delivery navigation uses a validated saved pin and retains legacy address fallback', () => {
  assert.match(customerMapHref('Original street', { latitude: 24.7, longitude: 46.7 }), /query=24.7%2C46.7$/);
  assert.match(customerMapHref('Original street'), /query=Original%20street$/);
  assert.match(customerMapHref('Original street', { latitude: NaN, longitude: 46.7 }), /query=Original%20street$/);
  assert.equal(customerMapHref('', { latitude: 91, longitude: 0 }), null);
});
