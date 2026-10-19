export type Category = '' | 'purchase' | 'expense' | 'other';
export type Payment = '' | 'cash' | 'credit';
export type NoteContent = {
  id: string; text: string; title: string; category: Category; amountMinor: number | null;
  quantity: string; payment: Payment; receiptData: string; status: 'pending' | 'entered';
  createdAt: string; enteredAt: string | null; enteredBy: string;
};
export type RemoteNote = NoteContent & { revision: number; mutationId: string };
export type Note = RemoteNote & { synced: boolean; inFlight?: RemoteNote; conflict?: RemoteNote };
export type Draft = Pick<NoteContent, 'text' | 'title' | 'category' | 'quantity' | 'payment' | 'receiptData'> & { amount: string };
export type Session = { token: string; expiresAt: number; origin: string; user: { id: string; name: string; role: string } };
export type Binding = { ownerId: string; origin: string };
export const categories: Category[] = ['purchase', 'expense', 'other'];
export const emptyDraft = (): Draft => ({ text: '', title: '', category: '', quantity: '', payment: '', receiptData: '', amount: '' });
export const titleOf = (n: NoteContent) => n.title || n.text.split('\n')[0].slice(0, 65);
export const money = (minor: number) => `${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
export function parseAmount(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a valid amount with up to two decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function validateDraft(d: Draft) {
  if (!d.text.trim()) throw new Error('Write a note before saving.');
  if (d.text.length > 5000 || d.title.length > 100 || d.quantity.length > 60) throw new Error('Your note, title or quantity is too long.');
  if (!['', ...categories].includes(d.category) || !['', 'cash', 'credit'].includes(d.payment)) throw new Error('Choose a valid category and payment method.');
  if (d.receiptData.length > 800000) throw new Error('This receipt is too large. Try a smaller photo.');
  return parseAmount(d.amount);
}
export const remoteOf = (n: Note): RemoteNote => {
  const { synced: _synced, conflict: _conflict, inFlight: _inFlight, ...remote } = n;
  return remote;
};
// Keep edits made while a previous version was being uploaded. The new version
// inherits the acknowledged server revision, but remains queued for upload.
export function acknowledge(current: Note, sent: RemoteNote, server: RemoteNote): Note {
  if (current.mutationId === sent.mutationId) return { ...server, synced: true };
  return { ...current, revision: server.revision, inFlight: undefined, conflict: undefined, synced: false };
}
export function mergeRemote(local: Note | undefined, remote: RemoteNote): Note {
  if (!local || local.synced) return { ...remote, synced: true };
  if (local.inFlight) return local;
  if (remote.mutationId === local.mutationId) return { ...remote, synced: true };
  if (remote.revision > local.revision) return { ...local, conflict: remote };
  return local;
}
export const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
export const dateLabel = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Riyadh', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export function summaries(notes: Note[], now = new Date().toISOString()) {
  const today = dayKey(now);
  return { pending: notes.filter(n => n.status === 'pending').length,
    todayMinor: notes.filter(n => dayKey(n.createdAt) === today).reduce((sum, n) => sum + (n.amountMinor ?? 0), 0) };
}
export type Filters = { search: string; status: string; category: string; from: string; to: string };
export function filterNotes(notes: Note[], f: Filters) {
  const query = f.search.trim().toLowerCase();
  return notes.filter(n => (!query || `${n.title} ${n.text} ${n.quantity} ${n.payment}`.toLowerCase().includes(query)) &&
    (!f.status || n.status === f.status) && (!f.category || n.category === f.category) &&
    (!f.from || dayKey(n.createdAt) >= f.from) && (!f.to || dayKey(n.createdAt) <= f.to))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
