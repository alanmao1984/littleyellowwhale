'use client'

import { Languages } from 'lucide-react'

export function MarketingLocaleToggle({ locale }: { locale: 'zh' | 'en' }) {
  function toggleLocale() {
    const next = locale === 'zh' ? 'en' : 'zh'
    document.cookie = `venus-locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    location.reload()
  }

  return (
    <button type="button" className="marketing-locale" onClick={toggleLocale} aria-label={locale === 'zh' ? 'Switch language to English' : '切换语言为中文'}>
      <Languages aria-hidden="true" />
      <span>{locale === 'zh' ? 'EN' : '中'}</span>
    </button>
  )
}
