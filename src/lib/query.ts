import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient, type Query } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Kept long enough for the disk cache below to be worth restoring.
      gcTime: 24 * 60 * 60_000,
    },
  },
})

/** Lists the app opens on; restoring them from disk paints them before the backend answers. */
const PERSISTED = new Set(['sessions', 'model-info', 'account-limits', 'session.most_recent', 'skills', 'cron'])

export const queryPersister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'hermes.query-cache', throttleTime: 2000 })

export const persistOptions = {
  persister: queryPersister,
  maxAge: 7 * 24 * 60 * 60_000,
  dehydrateOptions: {
    shouldDehydrateQuery: (q: Query) => q.state.status === 'success' && PERSISTED.has(String(q.queryKey[0])),
  },
}

/** Backend change signals → the query keys that depend on them. */
export const changeSignals: Record<string, string[][]> = {
  'sessions.changed': [['sessions']],
  'cron.changed': [['cron']],
  'projects.changed': [['projects']],
  'platforms.changed': [['messaging'], ['status']],
  'pairing.changed': [['pairing']],
  'skin.changed': [['skin']],
  'pet.changed': [['pets']],
}
