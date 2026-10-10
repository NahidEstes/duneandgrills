import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import type { Vault } from './order-request';
import { protectedStore } from './protected-store';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const native = protectedStore({
  get: key => SecureStore.getItemAsync(key, options),
  set: (key, value) => SecureStore.setItemAsync(key, value, options),
  delete: key => SecureStore.deleteItemAsync(key, options),
}, Crypto.randomUUID);
export const vault: Vault = {
  async read<T>(key: string): Promise<T | null> {
    if (Platform.OS === 'web') return null;
    return native.read<T>(key);
  },
  async write(key, value) {
    if (Platform.OS === 'web') throw new Error('Secure checkout and login require the native Android or iOS app');
    await native.write(key, value);
  },
  async remove(key) {
    if (Platform.OS === 'web') return;
    await native.remove(key);
  },
};
