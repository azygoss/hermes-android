import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
})

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
