import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { CAPTCHA_ENDPOINTS, captchaProtectedPath, resolveCaptchaConfig } from '@/lib/venus/auth-config'
import { nextCookies } from 'better-auth/next-js'
import { captcha, emailOTP } from 'better-auth/plugins'
import { pool } from '@/lib/db'
import { sendOtpEmail } from '@/lib/venus/email'

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET

function normalizeOrigin(value: string | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

const authBaseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.V0_RUNTIME_URL)

const configuredTrustedOrigins = (process.env.AUTH_TRUSTED_ORIGINS ?? '')
  .split(',')
  .map(origin => normalizeOrigin(origin.trim()))
  .filter((origin): origin is string => Boolean(origin))

const captchaConfig = resolveCaptchaConfig(process.env)
export const authFormConfig = {
  captcha: { ready: captchaConfig.ready, siteKey: captchaConfig.siteKey, testing: captchaConfig.testing },
  emailReady: !!(process.env.RESEND_API_KEY && process.env.RESEND_EMAIL_DOMAIN),
  socialProviders: [
    ...(googleClientId && googleClientSecret ? ['google' as const] : []),
    ...(githubClientId && githubClientSecret ? ['github' as const] : []),
  ],
}

const socialProviders = {
  ...(googleClientId && googleClientSecret
    ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
    : {}),
  ...(githubClientId && githubClientSecret
    ? { github: { clientId: githubClientId, clientSecret: githubClientSecret } }
    : {}),
}

const plugins = [
  emailOTP({
    otpLength: 6,
    expiresIn: 60 * 5,
    allowedAttempts: 5,
    storeOTP: 'hashed',
    rateLimit: { window: 60, max: 3 },
    sendVerificationOTP: async ({ email, otp, type }) => {
      await sendOtpEmail({ to: email, otp, type })
    },
  }),
  captcha({
    provider: 'cloudflare-turnstile',
    secretKey: captchaConfig.secretKey,
    endpoints: CAPTCHA_ENDPOINTS,
  }),
  nextCookies(),
]

export const auth = betterAuth({
  database: pool,
  rateLimit: { enabled: true, storage: 'database', modelName: 'rate_limit', window: 60, max: 60,
    customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 60, max: 3 }, '/sign-in/email-otp': { window: 60, max: 5 }, '/email-otp/*': { window: 60, max: 3 } },
  },
  hooks: { before: createAuthMiddleware(async ctx => {
    if (captchaProtectedPath(ctx.path) && !captchaConfig.ready) throw new APIError('SERVICE_UNAVAILABLE', { message: '认证暂不可用，请稍后再试。' })
  }) },
  baseURL: authBaseURL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  ...(Object.keys(socialProviders).length > 0 ? { socialProviders } : {}),
  trustedOrigins: [
    ...(process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:3000',
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(process.env.NODE_ENV === 'production'
      ? [
          ...(normalizeOrigin(authBaseURL) ? [normalizeOrigin(authBaseURL)!] : []),
          ...configuredTrustedOrigins,
          ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
            : []),
        ]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  plugins,
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          // Required by the cross-site v0 preview iframe. Without these
          // attributes, login succeeds but the next request appears signed out.
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})
