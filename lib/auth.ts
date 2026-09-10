import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { captcha, emailOTP } from 'better-auth/plugins'
import { pool } from '@/lib/db'
import { sendOtpEmail } from '@/lib/venus/email'

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET
const turnstileSecretKey =
  process.env.NODE_ENV === 'production'
    ? process.env.TURNSTILE_SECRET_KEY
    : '1x0000000000000000000000000000000AA'

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
  ...(turnstileSecretKey
    ? [
        captcha({
          provider: 'cloudflare-turnstile' as const,
          secretKey: turnstileSecretKey,
          endpoints: [
            '/sign-in/email',
            '/sign-up/email',
            '/request-password-reset',
            '/email-otp/send-verification-otp',
            '/sign-in/email-otp',
          ],
        }),
      ]
    : []),
  nextCookies(),
]

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
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
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})
