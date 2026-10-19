const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmount, validateDraft, emptyDraft, summaries, filterNotes, acknowledge, mergeRemote, remoteOf } = require('../.test-build/notebook.cjs');
const note = (extra = {}) => ({ id: 'test', text: 'Chicken 10 kg', title: '', category: 'purchase', quantity: '10 kg', payment: 'cash', receiptData: '', status: 'pending', createdAt: '2026-10-18T21:30:00Z', enteredAt: null, enteredBy: '', amountMinor: 23000, revision: 0, mutationId: 'request-1', synced: false, ...extra });
test('SAR amounts use exact minor units; optional blank and zero remain distinct', () => {
  assert.equal(parseAmount('230.01'), 23001); assert.equal(parseAmount('0'), 0); assert.equal(parseAmount(''), null);
  for (const invalid of ['-1', '0.001', '1e3', 'Infinity', '10,00', '10000000']) assert.throws(() => parseAmount(invalid));
  assert.equal(validateDraft({ ...emptyDraft(), text: 'A quick note' }), null);
  assert.throws(() => validateDraft(emptyDraft()), /Write a note/);
});
test('today summaries use Riyadh midnight and integer addition without duplicated entries', () => {
  const rows = [note(), note({ id: 'v', amountMinor: 8500 }), note({ id: 'y', amountMinor: 12000, createdAt: '2026-10-18T20:59:59Z', status: 'entered' })];
  assert.deepEqual(summaries(rows, '2026-10-19T12:00:00Z'), { pending: 2, todayMinor: 31500 });
});
test('search, category, status and Riyadh date range combine', () => {
  const rows = [note(), note({ id: 'b', text: 'Gas cylinder', category: 'expense', status: 'entered' })];
  const f = { search: 'CHICKEN', status: 'pending', category: 'purchase', from: '2026-10-19', to: '2026-10-19' };
  assert.deepEqual(filterNotes(rows, f).map(n => n.id), ['test']);
  assert.equal(filterNotes(rows, { ...f, to: '2026-10-18' }).length, 0);
});
test('acknowledgement keeps an edit or completion made during upload', () => {
  const sent = remoteOf(note());
  const latest = note({ text: 'Corrected amount', amountMinor: 23100, mutationId: 'request-2', status: 'entered', enteredAt: '2026-10-19T14:00:00Z', inFlight: sent });
  const merged = acknowledge(latest, sent, { ...sent, revision: 1 });
  assert.equal(merged.text, 'Corrected amount'); assert.equal(merged.status, 'entered'); assert.equal(merged.revision, 1);
  assert.equal(merged.synced, false); assert.equal(merged.inFlight, undefined); assert.equal(merged.mutationId, 'request-2');
});
test('lost-response retry acknowledgement becomes synced only for the same mutation', () => {
  const local = note(); const sent = remoteOf(local);
  const result = acknowledge(local, sent, { ...sent, revision: 1 });
  assert.equal(result.synced, true); assert.equal(result.revision, 1); assert.equal(result.inFlight, undefined);
});
test('pull preserves unresolved uploads and exposes remote edits without silent overwrites', () => {
  const local = note({ revision: 2 });
  const remote = { ...remoteOf(local), text: 'Another device', revision: 3, mutationId: 'remote' };
  assert.equal(mergeRemote({ ...local, inFlight: remoteOf(local) }, remote).inFlight.mutationId, local.mutationId);
  const conflict = mergeRemote(local, remote); assert.equal(conflict.text, local.text); assert.equal(conflict.conflict.text, remote.text);
  assert.equal(mergeRemote({ ...local, synced: true }, remote).text, remote.text);
});
