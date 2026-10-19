import Storage from 'expo-sqlite/kv-store';
export const store = {
  get: (key: string) => Storage.getItem(key),
  set: (key: string, value: string) => Storage.setItem(key, value),
  keys: () => Storage.getAllKeys(),
};
