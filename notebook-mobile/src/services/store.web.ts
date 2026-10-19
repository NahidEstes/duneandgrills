// Web preview uses durable IndexedDB without SQLite's experimental web runtime.
let database: Promise<IDBDatabase> | undefined;
function open() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('dune-grills-notebook-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('entries');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Device storage is unavailable. Allow browser storage and retry.'));
  }).catch(error => { database = undefined; throw error; });
  return database;
}
async function operation<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('entries', mode);
    const request = run(tx.objectStore('entries'));
    tx.oncomplete = () => resolve(request.result as T);
    tx.onerror = tx.onabort = () => reject(new Error('Could not save on this device. Free some storage and retry.'));
  });
}
export const store = {
  get: async (key: string): Promise<string | null> => (await operation<string | undefined>('readonly', s => s.get(key))) ?? null,
  set: async (key: string, value: string): Promise<void> => { await operation('readwrite', s => s.put(value, key)); },
  keys: async (): Promise<string[]> => await operation<string[]>('readonly', s => s.getAllKeys()),
};
