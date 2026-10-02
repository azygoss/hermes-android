import { useMutation, useQuery, type QueryKey } from '@tanstack/react-query'
import { useState } from 'react'

import { toast, toastError } from '@/components/ui/Dialogs'
import type { RpcParams, RpcResult } from '@/lib/gateway/client'
import type { RpcMethod } from '@/lib/gateway/contract.generated'
import { rest, rpc, useRuntime } from '@/lib/hermes'
import { queryClient } from '@/lib/query'

interface QueryOpts {
  enabled?: boolean
  refetchInterval?: number | false
  staleTime?: number
}

/** Query a JSON-RPC method once the socket is open. */
export function useRpc<M extends RpcMethod>(key: QueryKey, method: M, params: RpcParams<M>, opts: QueryOpts = {}) {
  const open = useRuntime((s) => s.state === 'open')
  return useQuery({
    queryKey: key,
    enabled: open && (opts.enabled ?? true),
    refetchInterval: opts.refetchInterval,
    staleTime: opts.staleTime,
    queryFn: () => rpc().request(method, params) as Promise<RpcResult<M>>,
  })
}

/** Query a REST endpoint on the active backend. */
export function useRest<T = any>(
  key: QueryKey,
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>,
  opts: QueryOpts = {},
) {
  const has = useRuntime((s) => !!s.hermes)
  return useQuery({
    queryKey: key,
    enabled: has && (opts.enabled ?? true),
    refetchInterval: opts.refetchInterval,
    staleTime: opts.staleTime,
    queryFn: () => rest().get<T>(path, { query }),
  })
}

/**
 * Wrap an action: shows a toast on success/failure and invalidates the given query keys.
 * Returns [run, busy].
 */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  { success, invalidate = [] }: { success?: string | ((r: R) => string | null); invalidate?: QueryKey[] } = {},
) {
  const m = useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: async (r) => {
      const msg = typeof success === 'function' ? success(r) : success
      if (msg) toast(msg, 'success')
      await Promise.all(invalidate.map((k) => queryClient.invalidateQueries({ queryKey: k })))
    },
    onError: toastError,
  })
  return [(...args: A) => m.mutateAsync(args).catch(() => undefined), m.isPending] as const
}

/** Tracks which row of a list is busy with an action. */
export function useBusyKey() {
  const [busy, setBusy] = useState<string | null>(null)
  const wrap =
    <A extends unknown[]>(key: string, fn: (...a: A) => Promise<unknown>) =>
    async (...a: A) => {
      setBusy(key)
      try {
        await fn(...a)
      } catch (e) {
        toastError(e)
      } finally {
        setBusy(null)
      }
    }
  return [busy, wrap] as const
}
