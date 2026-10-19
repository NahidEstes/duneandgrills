import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import NotebookNote from '../models/NotebookNote.js';
import User from '../models/User.js';
import notebookRoutes from '../routes/notebookRoutes.js';
import { validateNotebookMutation, saveNotebookNote } from '../services/notebookService.js';

const makeBody = extra => ({ mutationId: randomUUID(), expectedRevision: 0, note: { text: 'Chicken 10 kg, paid cash', title: '', category: 'purchase', payment: 'cash', quantity: '10 kg', amountMinor: 23000, receiptData: '', status: 'pending', createdAt: new Date().toISOString(), enteredAt: null, ...extra } });
test('notebook validation rejects malformed dates, amounts, status, receipts and identifiers', () => {
  assert.equal(validateNotebookMutation(makeBody()).amountMinor, 23000);
  for (const extra of [{ text: ' ' }, { amountMinor: 0.1 }, { amountMinor: -1 }, { status: 'posted' }, { category: 'inventory' }, { createdAt: 'bad' }, { status: 'entered', enteredAt: 'bad' }, { receiptData: 'data:image/svg+xml;base64,PHN2Zz4=' }, { receiptData: 'data:image/jpeg;base64,YWJj' }, { text: 'x'.repeat(5001) }]) assert.throws(() => validateNotebookMutation(makeBody(extra)), { status: 400 });
  assert.throws(() => validateNotebookMutation({ ...makeBody(), expectedRevision: -1 }), { status: 400 });
  assert.throws(() => validateNotebookMutation({ ...makeBody(), mutationId: '$ne' }), { status: 400 });
});
test('real notebook routes, session checks and CAS service using owned in-memory persistence', async t => {
  const oldSecret = process.env.JWT_SECRET; const oldEnv = process.env.NODE_ENV;
  process.env.JWT_SECRET = 'owned-notebook-fixture-only-secret'; process.env.NODE_ENV = 'test';
  const staff = ['inventory', 'manager', 'customer', 'rider'].map((role, index) => ({ _id: '00000000000000000000000' + index, name: 'Fixture ' + role, email: role + '@fixture.invalid', role, isActive: true, sessionVersion: 0, comparePassword: async p => p === 'OwnedDummy123!' }));
  const query = value => ({ select: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
  t.mock.method(User, 'findOne', ({ email }) => query(staff.find(u => u.email === email)));
  t.mock.method(User, 'findById', id => query(staff.find(u => u._id === String(id))));
  const records = new Map();
  let serial = 1;
  const key = scope => String(scope.owner) + ':' + scope.clientId;
  t.mock.method(NotebookNote, 'findOne', async scope => records.get(key(scope)) || null);
  t.mock.method(NotebookNote, 'create', async value => {
    const k = key(value); if (records.has(k)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    const doc = { ...value, _id: (serial++).toString(16).padStart(24, '0') }; records.set(k, doc); return doc;
  });
  t.mock.method(NotebookNote, 'findOneAndUpdate', async (scope, update) => {
    const old = records.get(key(scope)); if (!old || old.revision !== scope.revision || old.status !== scope.status) return null;
    const doc = { ...old, ...update.$set, revision: old.revision + 1 }; records.set(key(scope), doc); return doc;
  });
  t.mock.method(NotebookNote, 'find', scope => ({ sort: () => ({ limit: () => ({ lean: async () => [...records.values()].filter(n => String(n.owner) === String(scope.owner) && (!scope._id || n._id > String(scope._id.$gt))).sort((a, b) => a._id.localeCompare(b._id)).slice(0, 10) }) }) }));
  const app = express(); app.use(express.json({ limit: '1mb' })); app.use('/api/notebook', notebookRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ success: false, message: error.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port + '/api/notebook';
  const token = person => jwt.sign({ id: person._id, sv: person.sessionVersion }, process.env.JWT_SECRET);
  const call = async (path, method = 'GET', body, bearer) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  try {
    const bearer = token(staff[0]); const second = token(staff[1]);
    await t.test('staff-only login is sanitized and never issues browser cookies', async () => {
      const result = await call('/login', 'POST', { email: staff[0].email, password: 'OwnedDummy123!', role: 'admin' });
      assert.equal(result.status, 200); assert.equal(result.data.user.role, 'inventory');
      assert.equal(result.headers.has('set-cookie'), false); assert.match(result.headers.get('cache-control'), /no-store/);
      assert.deepEqual(Object.keys(result.data.user).sort(), ['id', 'name', 'role']);
      for (const person of staff.slice(2)) assert.equal((await call('/login', 'POST', { email: person.email, password: 'OwnedDummy123!' })).status, 401);
      assert.equal((await call('/notes')).status, 401);
      assert.equal((await call('/notes', 'GET', undefined, token(staff[2]))).status, 403);
    });
    const id = randomUUID(); const body = makeBody();
    await t.test('create and lost-response retries never duplicate notes', async () => {
      const first = await call('/notes/' + id, 'PUT', { ...body, owner: staff[1]._id }, bearer);
      assert.equal(first.status, 200); assert.equal(first.data.note.revision, 1);
      assert.equal((await call('/notes/' + id, 'PUT', body, bearer)).data.note.revision, 1);
      assert.equal(records.size, 1);
      assert.equal((await call('/notes', 'GET', undefined, second)).data.notes.length, 0);
      assert.equal((await call('/notes', 'GET', undefined, bearer)).data.notes.length, 1);
    });
    await t.test('simultaneous same-revision edits have one winner and one visible conflict', async () => {
      const edits = [makeBody({ text: 'First edit' }), makeBody({ text: 'Second edit' })].map(b => ({ ...b, expectedRevision: 1 }));
      const results = await Promise.all(edits.map(b => call('/notes/' + id, 'PUT', b, bearer)));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal(results.find(r => r.status === 409).data.serverNote.revision, 2);
    });
    await t.test('completion is attributed to staff and cannot be reversed or edited', async () => {
      const backdated = { ...makeBody({ status: 'entered', createdAt: '2020-01-01T00:00:00Z', enteredAt: '2020-01-02T00:00:00Z' }), expectedRevision: 2 };
      assert.equal((await call('/notes/' + id, 'PUT', backdated, bearer)).status, 400);
      const completed = { ...makeBody({ status: 'entered', enteredAt: new Date().toISOString(), enteredBy: 'Forged admin' }), expectedRevision: 2 };
      const saved = await call('/notes/' + id, 'PUT', completed, bearer);
      assert.equal(saved.status, 200); assert.equal(saved.data.note.enteredBy, staff[0].name);
      assert.equal(saved.data.note.revision, 3);
      assert.equal((await call('/notes/' + id, 'PUT', completed, bearer)).data.note.revision, 3);
      assert.equal((await call('/notes/' + id, 'PUT', { ...makeBody(), expectedRevision: 3 }, bearer)).status, 409);
    });
    await t.test('receipt survives save and load; malformed cursor and foreign sessions are refused', async () => {
      const receipt = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 217]).toString('base64');
      const receiptId = randomUUID();
      assert.equal((await call('/notes/' + receiptId, 'PUT', makeBody({ receiptData: receipt }), bearer)).status, 200);
      const notes = (await call('/notes', 'GET', undefined, bearer)).data.notes;
      assert.equal(notes.find(n => n.id === receiptId).receiptData, receipt);
      assert.equal((await call('/notes?after=invalid', 'GET', undefined, bearer)).status, 400);
      staff[0].isActive = false; assert.equal((await call('/notes', 'GET', undefined, bearer)).status, 401); staff[0].isActive = true;
      staff[0].sessionVersion++; assert.equal((await call('/notes', 'GET', undefined, bearer)).status, 401); staff[0].sessionVersion--;
      assert.equal((await call('/notes/' + randomUUID(), 'PUT', makeBody({ amountMinor: -10 }), bearer)).status, 400);
    });
    await t.test('first-write race retries one stable mutation safely', async () => {
      const raceId = randomUUID(); const raceBody = makeBody();
      const results = await Promise.all([saveNotebookNote(staff[0]._id, 'Staff', raceId, raceBody), saveNotebookNote(staff[0]._id, 'Staff', raceId, raceBody)]);
      assert.equal(results[0].revision, 1); assert.equal(results[1].revision, 1);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
  }
});
