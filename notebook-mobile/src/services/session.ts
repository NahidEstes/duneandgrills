import * as SecureStore from 'expo-secure-store';
import type { Session } from '../domain/notebook';
const key = 'dg.notebook.session.v1';
export const sessionStore = {
  read: async (): Promise<Session | null> => { const value = await SecureStore.getItemAsync(key); return value ? JSON.parse(value) : null; },
  write: (session: Session) => SecureStore.setItemAsync(key, JSON.stringify(session), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  clear: () => SecureStore.deleteItemAsync(key),
};
