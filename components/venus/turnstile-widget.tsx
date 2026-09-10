'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          theme?: 'light' | 'dark' | 'auto'
          callback?: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
        },
      ) => string
      reset: (widgetId?: string) => void
    }
  }
}

type TurnstileWidgetProps = {
  onToken: (token: string) => void
  resetKey: number
  locale: 'zh' | 'en'
}

const DEV_TEST_SITE_KEY = '1x00000000000000000000AA'
const DEV_TEST_TOKEN = '1x0000000000000000000000000000000AA'

export function TurnstileWidget({ onToken, resetKey, locale }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | undefined>(undefined)
  const onTokenRef = useRef(onToken)
  const configuredSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const isPreview = process.env.NODE_ENV !== 'production'
  const siteKey = isPreview ? DEV_TEST_SITE_KEY : configuredSiteKey

  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  useEffect(() => {
    if (isPreview) {
      onTokenRef.current(DEV_TEST_TOKEN)
      return
    }
    if (!siteKey || !containerRef.current) return

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current || widgetIdRef.current) return
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'auto',
        callback: (token) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => onTokenRef.current(''),
      })
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-turnstile]')
    if (existingScript) {
      renderWidget()
      existingScript.addEventListener('load', renderWidget)
      return () => existingScript.removeEventListener('load', renderWidget)
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.turnstile = 'true'
    script.addEventListener('load', renderWidget)
    document.head.appendChild(script)

    return () => script.removeEventListener('load', renderWidget)
  }, [isPreview, siteKey])

  useEffect(() => {
    if (isPreview) {
      onTokenRef.current(DEV_TEST_TOKEN)
      return
    }
    if (resetKey === 0 || !widgetIdRef.current || !window.turnstile) return
    window.turnstile.reset(widgetIdRef.current)
  }, [resetKey])

  if (isPreview) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground" role="status">
        {locale === 'zh' ? '预览环境使用 Cloudflare 测试人机验证。' : 'The preview uses Cloudflare’s test human verification.'}
      </div>
    )
  }

  if (!siteKey) {
    return (
      <p className="text-sm text-destructive" role="status">
        {locale === 'zh' ? '人机验证尚未配置，本环境暂不启用。' : 'Human verification is not configured for this environment.'}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} aria-label={locale === 'zh' ? 'Cloudflare 人机验证' : 'Cloudflare human verification'} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        {locale === 'zh' ? '登录前请完成 Cloudflare 人机验证。' : 'Complete the Cloudflare human check before continuing.'}
      </p>
    </div>
  )
}
