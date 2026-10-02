import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { createJSONStorage, type StateStorage } from 'zustand/middleware'

const secureAvailable = Platform.OS !== 'web'

// SecureStore keys allow only [A-Za-z0-9._-].
const secureKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_')

export const secrets = {
  async get(key: string): Promise<string | null> {
    return secureAvailable ? SecureStore.getItemAsync(secureKey(key)) : AsyncStorage.getItem(`secret:${key}`)
  },
  async set(key: string, value: string | null | undefined): Promise<void> {
    if (value == null || value === '') return secrets.remove(key)
    return secureAvailable ? SecureStore.setItemAsync(secureKey(key), value) : AsyncStorage.setItem(`secret:${key}`, value)
  },
  async remove(key: string): Promise<void> {
    return secureAvailable ? SecureStore.deleteItemAsync(secureKey(key)) : AsyncStorage.removeItem(`secret:${key}`)
  },
}

const asyncStateStorage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
}

export const persistStorage = createJSONStorage(() => asyncStateStorage)
