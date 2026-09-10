'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import useSWR from 'swr'

export type Locale = 'zh' | 'en'
export type Section = 'overview' | 'tasks' | 'compute' | 'nodes' | 'earnings' | 'developers' | 'settings'
export type Modal = 'task' | 'connect' | 'account' | 'help' | 'notifications' | 'install' | null
export type ServiceStatus = { database: 'connected' | 'unavailable' | 'pending'; authentication: 'ready' | 'pending'; authenticationConfigured?: boolean; checkedAt: string }
export type SessionUser = { id: string; name: string; email: string }
type WorkspaceContext = {
  locale: Locale; setLocale: (locale: Locale) => void; t: (zh: string, en: string) => string;
  modal: Modal; setModal: (modal: Modal) => void; draft: string; setDraft: (draft: string) => void;
  status?: ServiceStatus; statusError: boolean; refreshStatus: () => void;
  user: SessionUser | null;
}
const Context = createContext<WorkspaceContext | null>(null)

export function WorkspaceProvider({ children, initialLocale, user = null }: { children: ReactNode; initialLocale: Locale; user?: SessionUser | null }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale)
  const [modal, setModal] = useState<Modal>(null)
  const [draft, setDraft] = useState('')
  const { data: status, error, mutate } = useSWR<ServiceStatus>('/api/status', async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('status_unavailable')
    return response.json()
  }, { revalidateOnFocus: false, dedupingInterval: 30000, errorRetryCount: 1 })
  function setLocale(next: Locale) {
    updateLocale(next)
    document.cookie = `venus-locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  }
  useEffect(() => { document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en' }, [locale])
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return <Context.Provider value={{ locale, setLocale, t: (zh, en) => locale === 'zh' ? zh : en, modal, setModal, draft, setDraft, status, statusError: !!error, refreshStatus: () => { void mutate() }, user }}>{children}</Context.Provider>
}
export function useWorkspace() {
  const value = useContext(Context)
  if (!value) throw new Error('WorkspaceProvider is required')
  return value
}
