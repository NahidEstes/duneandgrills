const { test } = require('node:test'); const assert = require('node:assert/strict');
const { apiMessage, messageOf } = require('../.test-build/services/customer-message');
test('server internals and secrets are replaced with actionable customer messages for all HTTP failures', () => {
  for (const status of [400, 401, 403, 404, 409, 410, 429, 500, 503]) {
    const message = apiMessage(status, '/orders', 'MongoServerError JWT_SECRET=private token=abc E11000');
    assert.doesNotMatch(message, /Mongo|JWT|private|abc|E11000/); assert.ok(message.length);
  }
  assert.match(apiMessage(401, '/auth/mobile/login', 'wrong'), /email and password/);
  assert.match(apiMessage(400, '/offers/validate-coupon', 'coupon private internals'), /coupon/);
});
test('corrupt/protected native storage errors never display raw saved input', () => {
  assert.doesNotMatch(messageOf(new SyntaxError('Unexpected token private-payload')), /private-payload/);
  assert.match(messageOf(new Error('SecureStore keystore private failure')), /saved order/);
});

test('order conflicts distinguish restaurant preparation, stock, unavailable items and cancelled attempts', () => {
  const recipe = apiMessage(409, '/orders', 'Configure a recipe or mark Do Not Track for: Private dish (Missing recipe)');
  assert.match(recipe, /restaurant cannot currently prepare/); assert.doesNotMatch(recipe, /Private dish|Missing recipe/);
  assert.match(apiMessage(409, '/orders', 'Insufficient saleable inventory / invalid recipe: Private ingredient'), /restaurant cannot currently prepare/);
  assert.match(apiMessage(409, '/orders', 'Insufficient stock for Private ingredient'), /ingredients are out of stock/);
  assert.match(apiMessage(409, '/orders', 'One or more products are no longer available'), /selected items are no longer available/);
  assert.match(apiMessage(409, '/orders', 'Order request identifier was already used with different contents'), /request needs to be checked/);
  assert.match(apiMessage(410, '/orders', 'This order request was safely cancelled. Submit a new request'), /already cancelled.*Check or cancel/);
});
