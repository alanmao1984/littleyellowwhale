'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: { sitekey: string; theme?: 'light' | 'dark' | 'auto'; size?: 'flexible'; retry?: 'never'; callback?: (token: string) => void; 'expired-callback'?: () => void; 'error-callback'?: (code?: string) => boolean }) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

let scriptReady: Promise<void> | undefined
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve()
  if (scriptReady) return scriptReady
  scriptReady = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.dataset.turnstile = 'true'
    const timer = window.setTimeout(failed, 15000)
    function failed() { window.clearTimeout(timer); script.remove(); scriptReady = undefined; reject(new Error('captcha_unavailable')) }
    script.onload = () => { window.clearTimeout(timer); if (window.turnstile) resolve(); else failed() }
    script.onerror = failed
    document.head.appendChild(script)
  })
  return scriptReady
}

export function TurnstileWidget({ onToken, resetKey, locale, siteKey, testing }: {
  onToken: (token: string) => void; resetKey: number; locale: 'zh' | 'en'; siteKey: string | null; testing: boolean
}) {
  const container = useRef<HTMLDivElement>(null)
  const tokenCallback = useRef(onToken)
  const [failed, setFailed] = useState(false)
  const [domainError, setDomainError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => { tokenCallback.current = onToken }, [onToken])
  useEffect(() => {
    let active = true
    let widget: string | undefined
    tokenCallback.current('')
    setFailed(false)
    setDomainError(false)
    if (!siteKey) return
    void loadTurnstile().then(() => {
      if (!active || !container.current || !window.turnstile) return
      widget = window.turnstile.render(container.current, {
        sitekey: siteKey, theme: 'auto', size: 'flexible', retry: 'never',
        callback: token => { if (active) { setFailed(false); tokenCallback.current(token) } },
        'expired-callback': () => { if (active) tokenCallback.current('') },
        'error-callback': code => { if (active) { tokenCallback.current(''); setFailed(true); setDomainError(code === '110200') }; return true },
      })
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false; if (widget !== undefined) window.turnstile?.remove(widget); tokenCallback.current('') }
  }, [siteKey, resetKey, retry])

  if (!siteKey) return <p role="alert" className="text-sm text-destructive">{locale === 'zh' ? '认证安全配置不完整，本环境暂不可登录或注册。' : 'Authentication is unavailable until security configuration is complete.'}</p>
  return <div className="flex flex-col gap-2">
    <div ref={container} aria-label={locale === 'zh' ? 'Cloudflare 人机验证' : 'Cloudflare human verification'} />
    <p className="text-sm leading-relaxed text-muted-foreground">{testing ? (locale === 'zh' ? '开发模式：使用官方测试控件，不代表真人验证。' : 'Development: official test widget, not proof of a human.') : (locale === 'zh' ? '请先完成人机验证；每次请求后需重新验证。' : 'Complete the human check again after each request.')}</p>
    {failed && <div role="alert"><p className="text-sm text-destructive">{domainError ? (locale === 'zh' ? '当前域名未获 Turnstile 授权（110200）。请由站点管理员在 Cloudflare Hostname Management 中授权此域名，或使用已授权域名。' : 'This hostname is not authorized in Turnstile (110200). Ask the site administrator to add it in Cloudflare Hostname Management, or use an authorized hostname.') : (locale === 'zh' ? '人机验证加载失败，请检查网络后重试。' : 'Human verification failed to load. Check the network and retry.')}</p><Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>{locale === 'zh' ? '重试验证' : 'Retry verification'}</Button></div>}
  </div>
}
