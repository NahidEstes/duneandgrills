import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const vault = {
  async read<T>(key: string): Promise<T | null> {
    if (Platform.OS === 'web') return null;
    const raw = await SecureStore.getItemAsync(key, options);
    return raw === null ? null : JSON.parse(raw) as T;
  },
  async write(key: string, value: unknown) {
    if (Platform.OS === 'web') throw new Error('Staff login and delivery actions require the native Android or iOS app.');
    await SecureStore.setItemAsync(key, JSON.stringify(value), options);
  },
  async remove(key: string) {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(key, options);
  },
};
