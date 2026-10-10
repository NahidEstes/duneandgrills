import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { withIsolatedMongo } from './helpers/isolatedMongo.js';
import authRoutes from '../routes/authRoutes.js';
import orderRoutes from '../routes/orderRoutes.js';
import profileRoutes from '../routes/profileRoutes.js';
import kitchenRoutes from '../routes/kitchenRoutes.js';
import { csrfProtection } from '../middleware/security.js';
import User from '../models/User.js';
import MenuItem from '../models/MenuItem.js';
import InventoryCategory from '../models/InventoryCategory.js';
import InventoryItem from '../models/InventoryItem.js';
import InventoryRecipe from '../models/InventoryRecipe.js';
import Order from '../models/Order.js';
import { performStockMovement } from '../services/inventoryStockService.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'mobile-phase-a-owned-test-only';
process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = 'false';
test('native auth, proxy and shared ordering on owned temporary replica set', { timeout: 180000 }, async t => withIsolatedMongo(async () => {
  const app = express(); app.use(express.json()); app.use(csrfProtection);
  app.use('/api/auth', authRoutes); app.use('/api/orders', orderRoutes); app.use('/api/profile', profileRoutes); app.use('/api/kitchen', kitchenRoutes);
  app.use((e, _req, res, _next) => res.status(e.status || 500).json({ success: false, message: e.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, body, token, method = body ? 'POST' : 'GET', extra = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  let customer; let token;
  try {
    await t.test('registration reuses password policy and customer sanitization, returns bearer without cookies', async () => {
      assert.equal((await call('/auth/mobile/register', { name: 'Owned', email: 'weak@mobile.test', password: 'weak' })).status, 400);
      const result = await call('/auth/mobile/register', { name: 'Owned Mobile', email: 'customer@mobile.test', password: 'TestPassword123!', phone: '+966500000000', role: 'admin' });
      assert.equal(result.status, 201); assert.equal(result.body.user.role, 'customer'); assert.equal(result.headers.has('set-cookie'), false);
      assert.match(result.headers.get('cache-control'), /no-store/); assert.ok(result.body.expiresAt > Date.now());
      assert.equal('password' in result.body.user, false); assert.equal('sessionVersion' in result.body.user, false);
      token = result.body.token; customer = await User.findById(result.body.user._id);
      assert.equal((await call('/auth/me', undefined, token)).body.user._id, String(customer._id));
    });
    await t.test('browser login still returns cookies and no token; native login refuses staff/bad credentials', async () => {
      const browser = await call('/auth/login', { email: customer.email, password: 'TestPassword123!' });
      assert.equal(browser.status, 200); assert.equal('token' in browser.body, false); assert.match(browser.headers.get('set-cookie'), /dg_session=/);
      const mobile = await call('/auth/mobile/login', { email: customer.email, password: 'TestPassword123!' });
      assert.equal(mobile.status, 200); assert.ok(mobile.body.token); assert.equal(mobile.headers.has('set-cookie'), false);
      assert.equal((await call('/auth/mobile/login', { email: customer.email, password: 'wrong' })).status, 401);
      await User.create({ name: 'Staff', email: 'staff@mobile.test', password: 'TestPassword123!', role: 'admin' });
      assert.equal((await call('/auth/mobile/login', { email: 'staff@mobile.test', password: 'TestPassword123!' })).status, 401);
    });
    await t.test('bearer profile/address CRUD scopes ownership and preserves CSRF on cookie writes', async () => {
      const added = await call('/profile/addresses', { label: 'Home', fullAddress: 'Owned test address', phone: '+966500000000', isDefault: true }, token);
      assert.equal(added.status, 201); const id = added.body.data[0]._id;
      assert.equal((await call(`/profile/addresses/${id}`, { label: 'Work' }, token, 'PATCH')).status, 200);
      const other = await User.create({ name: 'Other', email: 'other@mobile.test', password: 'TestPassword123!' });
      const otherToken = jwt.sign({ id: other._id, sv: 0 }, process.env.JWT_SECRET);
      assert.equal((await call(`/profile/addresses/${id}`, undefined, otherToken, 'DELETE')).status, 404);
      assert.equal((await call('/profile/addresses', undefined, otherToken)).body.data.length, 0);
      assert.equal((await call('/auth/me', { name: 'Updated' }, token, 'PATCH')).body.user.name, 'Updated');
      assert.equal((await call('/auth/me', { name: 'Unverified' }, undefined, 'PATCH', { Cookie: `dg_session=${token}` })).status, 403);
      assert.equal((await call(`/profile/addresses/${id}/default`, {}, token, 'PATCH')).status, 200);
      assert.equal((await call(`/profile/addresses/${id}`, undefined, token, 'DELETE')).status, 200);
    });
    await t.test('actual Next proxy handler forwards native token/JSON/idempotency/private tracking', async () => {
      process.env.BACKEND_API_URL = base;
      // Only the unrelated Next cache-invalidation dependency is stubbed; the
      // complete repository proxyRequest and exported methods execute unchanged.
      const source = (await readFile(new URL('../../frontend/app/api/[...path]/route.js', import.meta.url), 'utf8')).replace('import { invalidateContent } from "@/src/cache/invalidate.js";', 'const invalidateContent = () => {};');
      const proxy = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
      const throughProxy = async (path, method = 'GET', body, headers = {}) => {
        const request = new Request('http://fixture.local/api/' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
        request.nextUrl = new URL(request.url);
        const response = await proxy[method](request, { params: Promise.resolve({ path: path.split('/') }) });
        return { status: response.status, headers: response.headers, body: await response.json() };
      };
      const login = await throughProxy('auth/mobile/login', 'POST', { email: customer.email, password: 'TestPassword123!' });
      assert.equal(login.status, 200); assert.ok(login.body.token); assert.equal(login.headers.has('set-cookie'), false);
      assert.equal((await throughProxy('auth/me', 'GET', undefined, { Authorization: `Bearer ${login.body.token}` })).body.user._id, String(customer._id));
      const admin = await User.findOne({ role: 'admin' }); const adminToken = jwt.sign({ id: admin._id, sv: 0 }, process.env.JWT_SECRET);
      const category = await InventoryCategory.create({ name: 'Mobile owned', skuPrefix: 'MOB' });
      const ingredient = await InventoryItem.create({ name: 'Owned ingredient', sku: 'INV-MOB-001', category: category._id, unit: 'kg', unitCost: 1 });
      await performStockMovement({ itemId: ingredient._id, movementType: 'STOCK_IN', quantity: 10, lotNumber: 'MOBILE', expiryDate: '2099-01-01', reason: 'Owned mobile fixture', userId: admin._id, unitCost: 1 });
      const dish = await MenuItem.create({ name: 'Mobile grill', description: 'Owned fixture', image: '/fixture.jpg', category: 'Grills', price: 20 });
      await InventoryRecipe.create({ menuItem: dish._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerSale: 1, unit: 'kg' }], updatedBy: admin._id });
      const key = randomUUID(); const payload = { fulfillmentType: 'pickup', paymentOption: 'cod', customer: { name: 'Owned', phone: '+966500000000' }, items: [{ productId: String(dish._id), productType: 'menuItem', quantity: 1 }], kitchenNotes: 'Mobile note' };
      const headers = { Authorization: `Bearer ${token}`, 'Idempotency-Key': key };
      const order = await throughProxy('orders', 'POST', payload, headers); assert.equal(order.status, 201); assert.equal(order.body.data.totalAmount, 20); assert.equal(order.body.data.paymentStatus, 'pending');
      const replay = await throughProxy('orders', 'POST', payload, headers); assert.equal(replay.status, 200); assert.equal(replay.body.data._id, order.body.data._id);
      assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 9);
      const tracked = await throughProxy(`orders/track/${order.body.data.orderNumber}`, 'GET', undefined, { 'X-Order-Tracking-Token': order.body.trackingToken });
      assert.equal(tracked.status, 200); assert.equal('customer' in tracked.body.data, false);
      assert.equal((await throughProxy(`orders/track/${order.body.data.orderNumber}`)).status, 404);
      const queue = await call('/kitchen/orders', undefined, adminToken); assert.ok(queue.body.data.some(o => o._id === order.body.data._id));
      const adminList = await call('/orders', undefined, adminToken); assert.ok(adminList.body.data.some(o => o._id === order.body.data._id));
      assert.equal((await Order.findById(order.body.data._id)).source, 'website'); assert.equal(String((await Order.findById(order.body.data._id)).user), String(customer._id));
      assert.equal((await call('/orders/my', undefined, token)).body.data.length, 1);
      const repeat = await call(`/orders/${order.body.data._id}/repeat`, {}, token); assert.equal(repeat.status, 200); assert.equal(repeat.body.data[0].price, 20);
      const recover = await throughProxy('orders/requests/cancel', 'POST', { ...payload, idempotencyKey: key }, { Authorization: `Bearer ${token}` }); assert.equal(recover.body.data._id, order.body.data._id);
    });
    await t.test('expired, sessionVersion-revoked and disabled tokens fail; login rate limiting is shared', async () => {
      const expired = jwt.sign({ id: customer._id, sv: 0 }, process.env.JWT_SECRET, { expiresIn: -1 }); assert.equal((await call('/auth/me', undefined, expired)).status, 401);
      await User.updateOne({ _id: customer._id }, { $inc: { sessionVersion: 1 } }); assert.equal((await call('/auth/me', undefined, token)).status, 401);
      const fresh = await call('/auth/mobile/login', { email: customer.email, password: 'TestPassword123!' }); assert.equal((await call('/auth/me', undefined, fresh.body.token)).status, 200);
      await User.updateOne({ _id: customer._id }, { $set: { isActive: false } }); assert.equal((await call('/auth/me', undefined, fresh.body.token)).status, 401);
      let result; for (let i = 0; i < 21; i++) result = await call('/auth/mobile/login', { email: customer.email, password: 'invalid' }); assert.equal(result.status, 429); assert.ok(result.headers.get('retry-after'));
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
}));
