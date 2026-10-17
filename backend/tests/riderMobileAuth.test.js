import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import { readFile } from 'node:fs/promises';
import User from '../models/User.js';
import authRoutes from '../routes/authRoutes.js';
import { protect, requireCapability } from '../middleware/auth.js';
import { CAPABILITIES } from '../config/permissions.js';
import { csrfProtection } from '../middleware/security.js';

// Real controllers, JWT, middleware, routes and Next proxy; only database lookups
// are replaced with owned in-memory records. No external database is contacted.
test('private native rider login, customer isolation, bearer access and proxy', async t => {
  const env = { JWT_SECRET: process.env.JWT_SECRET, NODE_ENV: process.env.NODE_ENV, BACKEND_API_URL: process.env.BACKEND_API_URL };
  process.env.JWT_SECRET = 'owned-rider-mobile-test-secret'; process.env.NODE_ENV = 'test';
  const people = ['rider', 'admin', 'manager', 'customer', 'cashier'].map((role, index) => ({ _id: `owned-${index}`, email: `${role}@rider.invalid`, name: 'Owned rider', employeeId: 'EMP-TEST', phone: '+966500000000', role, isActive: true, sessionVersion: 0, password: 'private-hash', address: 'private', comparePassword: async password => password === 'LocalDummy123!' }));
  const byId = id => people.find(user => user._id === String(id));
  const query = value => ({ select() { return Promise.resolve(value); }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  t.mock.method(User, 'findOne', ({ email }) => query(people.find(user => user.email === email)));
  t.mock.method(User, 'findById', id => query(byId(id)));
  const app = express(); app.use(express.json(), csrfProtection); app.use('/api/auth', authRoutes);
  app.get('/api/private-rider', protect, requireCapability(CAPABILITIES.RIDER_DELIVERY_OPERATE), (req, res) => res.json({ success: true, id: req.user._id }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, body, token) => { const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, headers: response.headers, data: await response.json() }; };
  try {
    let token;
    await t.test('rider route issues a sanitized bearer session without browser cookies', async () => {
      const result = await call('/auth/mobile/rider/login', { email: people[0].email, password: 'LocalDummy123!', role: 'admin' });
      assert.equal(result.status, 200); assert.equal(result.data.user.role, 'rider'); assert.equal(result.headers.has('set-cookie'), false); assert.match(result.headers.get('cache-control'), /no-store/);
      for (const field of ['password', 'sessionVersion', 'address', 'pointsBalance']) assert.equal(field in result.data.user, false);
      assert.ok(result.data.expiresAt > Date.now()); token = result.data.token;
      assert.equal(jwt.verify(token, process.env.JWT_SECRET).id, people[0]._id);
      assert.equal((await call('/private-rider', undefined, token)).status, 200);
      assert.equal((await call('/auth/me', undefined, token)).data.user._id, people[0]._id);
    });
    await t.test('customer endpoint still refuses rider; rider endpoint refuses every other role and bad credentials', async () => {
      assert.equal((await call('/auth/mobile/login', { email: people[0].email, password: 'LocalDummy123!', mobileAuthRole: 'rider' })).status, 401);
      for (const person of people.slice(1)) assert.equal((await call('/auth/mobile/rider/login', { email: person.email, password: 'LocalDummy123!', role: 'rider' })).status, 401);
      assert.equal((await call('/auth/mobile/rider/login', { email: people[0].email, password: 'wrong' })).status, 401);
      assert.equal((await call('/auth/mobile/rider/login', {})).status, 400);
      const browser = await call('/auth/login', { email: people[0].email, password: 'LocalDummy123!' });
      assert.equal(browser.status, 200); assert.equal('token' in browser.data, false); assert.match(browser.headers.get('set-cookie'), /dg_session/);
    });
    await t.test('expired, revoked, deactivated and non-rider sessions cannot access rider capability', async () => {
      assert.equal((await call('/private-rider')).status, 401);
      const expired = jwt.sign({ id: people[0]._id, sv: 0 }, process.env.JWT_SECRET, { expiresIn: -1 }); assert.equal((await call('/private-rider', undefined, expired)).status, 401);
      for (const person of people.slice(1).filter(p => p.role !== 'admin')) { const other = jwt.sign({ id: person._id, sv: 0 }, process.env.JWT_SECRET); assert.equal((await call('/private-rider', undefined, other)).status, 403); }
      people[0].sessionVersion++; assert.equal((await call('/private-rider', undefined, token)).status, 401); people[0].sessionVersion--;
      people[0].isActive = false; assert.equal((await call('/private-rider', undefined, token)).status, 401);
      assert.equal((await call('/auth/mobile/rider/login', { email: people[0].email, password: 'LocalDummy123!' })).status, 401); people[0].isActive = true;
    });
    await t.test('existing Next proxy forwards the new login and authorization unchanged', async () => {
      process.env.BACKEND_API_URL = base;
      const source = (await readFile(new URL('../../frontend/app/api/[...path]/route.js', import.meta.url), 'utf8')).replace('import { invalidateContent } from "@/src/cache/invalidate.js";', 'const invalidateContent = () => {};');
      const proxy = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
      const request = new Request('http://fixture.invalid/api/auth/mobile/rider/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: people[0].email, password: 'LocalDummy123!' }) }); request.nextUrl = new URL(request.url);
      const response = await proxy.POST(request, { params: Promise.resolve({ path: ['auth', 'mobile', 'rider', 'login'] }) });
      assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.user.role, 'rider'); assert.equal(response.headers.has('set-cookie'), false);
      const read = new Request('http://fixture.invalid/api/private-rider', { headers: { Authorization: `Bearer ${body.token}` } }); read.nextUrl = new URL(read.url);
      assert.equal((await proxy.GET(read, { params: Promise.resolve({ path: ['private-rider'] }) })).status, 200);
    });
  } finally { await new Promise(resolve => server.close(resolve)); for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
