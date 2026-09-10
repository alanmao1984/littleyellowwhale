'use client'

const REQUEST_TIMEOUT_MS = 8000

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      ...init,
      cache: init.cache ?? 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('request_failed')
    return response.json() as Promise<T>
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('request_timeout')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export const pollingConfig = {
  errorRetryCount: 1,
  errorRetryInterval: 5000,
  refreshWhenHidden: false,
  refreshWhenOffline: false,
} as const
