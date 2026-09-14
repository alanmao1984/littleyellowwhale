export const TEST_SITE_KEY = '1x00000000000000000000AA'
export const TEST_SECRET_KEY = '1x0000000000000000000000000000000AA'

export function resolveCaptchaConfig(env: Record<string, string | undefined>) {
  const site = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
  const secret = env.TURNSTILE_SECRET_KEY?.trim()
  const isTest = (value: string) => /^[123]x0{10,}/.test(value)

  // v0 development previews run behind transient v0.build and vusercontent.net
  // hostnames. Cloudflare production widgets cannot safely authorize every such
  // hostname, so development always uses Cloudflare's paired official test keys.
  if (env.NODE_ENV === 'development') {
    return { ready: true, siteKey: TEST_SITE_KEY, secretKey: TEST_SECRET_KEY, testing: true }
  }

  const testing = !!(site && isTest(site)) || !!(secret && isTest(secret))
  const paired = !!site && !!secret && isTest(site) === isTest(secret)
  const ready = paired && !testing
  return { ready, siteKey: ready ? site! : null, secretKey: ready ? secret! : '', testing }
}

export const CAPTCHA_ENDPOINTS = ['/sign-in/email', '/sign-up/email', '/request-password-reset', '/reset-password', '/email-otp/*', '/sign-in/email-otp']
export function captchaProtectedPath(path: string) {
  return CAPTCHA_ENDPOINTS.some(endpoint => endpoint.endsWith('*') ? path.startsWith(endpoint.slice(0, -1)) : path === endpoint)
}
