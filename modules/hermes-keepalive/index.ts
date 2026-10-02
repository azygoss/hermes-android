import { requireOptionalNativeModule } from 'expo'

interface HermesKeepAliveModule {
  start(title: string, text: string): boolean
  update(title: string, text: string): boolean
  stop(): void
}

// Android only; elsewhere (web, Expo Go) every call is a no-op.
const native = requireOptionalNativeModule<HermesKeepAliveModule>('HermesKeepAlive')

/** Keep the app (and its gateway socket) alive while the agent works in the background. */
export const KeepAlive = {
  available: !!native,
  start: (title: string, text: string) => native?.start(title, text) ?? false,
  update: (title: string, text: string) => native?.update(title, text) ?? false,
  stop: () => native?.stop(),
}
