import { Redirect } from 'expo-router'

import { useConnections } from '@/store/connections'

export default function Index() {
  const hasActive = useConnections((s) => !!s.activeId && s.connections.some((c) => c.id === s.activeId))
  return <Redirect href={hasActive ? '/chat' : '/connect'} />
}
