'use client'

import useSWR from 'swr'
import type { LedgerView, TaskView, WalletView } from './ledger'
import type { ApiTokenView, EnrollmentView, NodeView } from './nodes'

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('request_failed')
  return response.json() as Promise<T>
}

// Each hook only fetches when the workspace knows a user is signed in, so a
// guest view never triggers a 401 request.
export function useWallet(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<WalletView>(
    enabled ? '/api/v1/wallet' : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  )
  return { wallet: data, walletError: !!error, walletLoading: isLoading, refreshWallet: mutate }
}

export function useTasks(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<{ tasks: TaskView[] }>(
    enabled ? '/api/v1/tasks' : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 3000, refreshInterval: enabled ? 5000 : 0 },
  )
  return { tasks: data?.tasks, tasksError: !!error, tasksLoading: isLoading, refreshTasks: mutate }
}

export function useLedger(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<{ entries: LedgerView[] }>(
    enabled ? '/api/v1/ledger' : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  )
  return { entries: data?.entries, ledgerError: !!error, ledgerLoading: isLoading, refreshLedger: mutate }
}

export function useNodes(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<{ nodes: NodeView[]; enrollments: EnrollmentView[] }>(
    enabled ? '/api/v1/nodes' : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: enabled ? 30000 : 0 },
  )
  return { nodes: data?.nodes, enrollments: data?.enrollments, nodesError: !!error, nodesLoading: isLoading, refreshNodes: mutate }
}

export function useApiTokens(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWR<{ tokens: ApiTokenView[] }>(
    enabled ? '/api/v1/tokens' : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5000 },
  )
  return { tokens: data?.tokens, tokensError: !!error, tokensLoading: isLoading, refreshTokens: mutate }
}
