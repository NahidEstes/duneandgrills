import NotebookNote from '../models/NotebookNote.js';

export const NOTEBOOK_ROLES = ['admin', 'manager', 'cashier', 'kitchen', 'inventory', 'storekeeper', 'accountant'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validNoteId = value => typeof value === 'string' && UUID.test(value);
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
const string = (value, max, label) => {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max) invalid(`Invalid ${label}.`);
  return value.trim();
};
export function validateNotebookMutation(body) {
  if (!body || !validNoteId(body.mutationId) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) invalid('Invalid note revision or request identifier.');
  const n = body.note;
  if (!n || typeof n !== 'object' || Array.isArray(n)) invalid('A note is required.');
  const text = string(n.text, 5000, 'note text');
  if (!text) invalid('Write a note before saving.');
  const title = string(n.title, 100, 'title');
  const category = string(n.category, 20, 'category');
  const payment = string(n.payment, 20, 'payment method');
  if (!['', 'purchase', 'expense', 'other'].includes(category) || !['', 'cash', 'credit'].includes(payment)) invalid('Invalid category or payment method.');
  const amountMinor = n.amountMinor ?? null;
  if (amountMinor !== null && (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor > 999999999)) invalid('Invalid amount.');
  if (!['pending', 'entered'].includes(n.status)) invalid('Invalid entry status.');
  const notedAt = new Date(n.createdAt);
  if (!Number.isFinite(+notedAt) || +notedAt < Date.UTC(2000, 0, 1) || +notedAt > Date.now() + 86400000) invalid('Invalid note date.');
  const enteredAt = n.status === 'entered' ? new Date(n.enteredAt) : null;
  if (enteredAt && (!Number.isFinite(+enteredAt) || +enteredAt < +notedAt || +enteredAt > Date.now() + 86400000)) invalid('Invalid completion date.');
  const receiptData = string(n.receiptData, 800000, 'receipt');
  if (receiptData) {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(receiptData)) invalid('Receipts must be JPEG images.');
    const bytes = Buffer.from(receiptData.split(',')[1], 'base64');
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) invalid('Invalid receipt image.');
  }
  return { text, title, category, payment, amountMinor, quantity: string(n.quantity, 60, 'quantity'), receiptData, status: n.status, notedAt, enteredAt };
}
export const publicNotebookNote = n => ({
  id: n.clientId, text: n.text, title: n.title, category: n.category,
  amountMinor: n.amountMinor, quantity: n.quantity, payment: n.payment,
  receiptData: n.receiptData, status: n.status, createdAt: new Date(n.notedAt).toISOString(),
  enteredAt: n.enteredAt ? new Date(n.enteredAt).toISOString() : null,
  enteredBy: n.enteredBy, revision: n.revision, mutationId: n.lastMutationId,
});
const conflict = existing => { throw Object.assign(new Error('This note changed on another device. Review both versions.'), { status: 409, serverNote: publicNotebookNote(existing) }); };

// Notes are an isolated notebook collection. This service never posts inventory,
// supplier invoices, payments or expenses.
export async function saveNotebookNote(owner, name, clientId, body) {
  if (!validNoteId(clientId)) invalid('Invalid note identifier.');
  const note = validateNotebookMutation(body);
  const scope = { owner, clientId };
  let existing = await NotebookNote.findOne(scope);
  if (existing?.lastMutationId === body.mutationId) return publicNotebookNote(existing);
  if (!existing) {
    if (body.expectedRevision !== 0) invalid('This note is unavailable.');
    try {
      return publicNotebookNote(await NotebookNote.create({ ...note, ...scope, enteredBy: note.status === 'entered' ? name.slice(0, 100) : '', revision: 1, lastMutationId: body.mutationId }));
    } catch (error) {
      if (error.code !== 11000) throw error;
      existing = await NotebookNote.findOne(scope);
      if (existing?.lastMutationId === body.mutationId) return publicNotebookNote(existing);
      if (existing) conflict(existing);
      throw error;
    }
  }
  if (existing.revision !== body.expectedRevision || existing.status === 'entered') conflict(existing);
  if (note.enteredAt && +note.enteredAt < +new Date(existing.notedAt)) invalid('Completion cannot precede the original note date.');
  // Original capture date is immutable. Completion attribution is server-owned.
  const updated = await NotebookNote.findOneAndUpdate({ ...scope, revision: body.expectedRevision, status: 'pending' }, {
    $set: { ...note, notedAt: existing.notedAt, enteredBy: note.status === 'entered' ? name.slice(0, 100) : '', lastMutationId: body.mutationId }, $inc: { revision: 1 },
  }, { new: true, runValidators: true });
  if (updated) return publicNotebookNote(updated);
  existing = await NotebookNote.findOne(scope);
  if (existing?.lastMutationId === body.mutationId) return publicNotebookNote(existing);
  conflict(existing);
}
