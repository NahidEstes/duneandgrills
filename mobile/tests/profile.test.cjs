const { test } = require('node:test'); const assert = require('node:assert/strict');
const { initials, profileError, restaurantContact } = require('../.test-build/domain/profile');
const { apiMessage } = require('../.test-build/services/customer-message');

test('profile accepts optional phone, validates trimmed input, and rejects missing or malformed fields', () => {
  assert.equal(profileError(' Amina Customer ', 'amina@example.test', ''), null);
  assert.equal(profileError('Amina', 'amina@example.test', '+966 (50) 123-4567'), null);
  for (const fields of [['', 'a@example.test', ''], ['Amina', '', ''], ['Amina', 'broken-email', ''], ['Amina', 'a@example.test', 'bad phone']]) assert.ok(profileError(...fields));
  assert.equal(initials(' Amina Middle Customer '), 'AC'); assert.equal(initials('Amina'), 'A'); assert.equal(initials(''), '?'); assert.equal(initials('محمد ناهد'), 'من');
});
test('contact uses configured numbers only, normalizes dialer/WhatsApp URLs, and rejects unsafe or missing values', () => {
  assert.deepEqual(restaurantContact({ phone: '+966 (50) 123-4567' }), { label: '+966 (50) 123-4567', url: 'tel:+966501234567' });
  assert.equal(restaurantContact({ whatsapp: '+966501234567' }).url, 'https://wa.me/966501234567');
  assert.equal(restaurantContact({ phone: 'invalid' }, { phone: '123456' }).url, 'tel:123456');
  for (const phone of ['', 'tel:123456', '123456?body=secret', '+     ', '123+456']) assert.equal(restaurantContact({ phone }), null);
  assert.equal(restaurantContact(), null);
});
test('duplicate profile email is actionable without confusing it with order recovery', () => {
  assert.match(apiMessage(409, '/auth/me', 'That email is already in use'), /Choose another email/);
  assert.match(apiMessage(409, '/orders', 'Request identifier conflict'), /saved order/);
});
