'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Mail, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { TurnstileWidget } from '@/components/venus/turnstile-widget'

type Mode = 'sign-in' | 'sign-up'
type Locale = 'zh' | 'en'
type SignInMethod = 'password' | 'otp'
type SocialProvider = 'google' | 'github'

type CaptchaRequestOptions = {
  headers: { 'x-captcha-response': string }
}

export function AuthForm({ mode, locale, config }: { mode: Mode; locale: Locale; config: { captcha: { ready: boolean; siteKey: string | null; testing: boolean }; emailReady: boolean; socialProviders: SocialProvider[] } }) {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en)
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [method, setMethod] = useState<SignInMethod>('password')
  const [otpSent, setOtpSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaResetKey, setCaptchaResetKey] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  const authUnavailable = !config.captcha.ready || (method === 'otp' && !config.emailReady)
  const captchaOptions = useCallback((): CaptchaRequestOptions => ({
    headers: { 'x-captcha-response': captchaToken },
  }), [captchaToken])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = window.setInterval(() => {
      setResendCooldown((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resendCooldown])

  function resetCaptcha() {
    setCaptchaToken('')
    setCaptchaResetKey((value) => value + 1)
  }

  function validateCaptcha() {
    if (authUnavailable) { setError(t('认证暂不可用，请稍后重试。', 'Authentication is temporarily unavailable.')); return false }
    if (captchaToken) return true
    setError(t('请先完成 Cloudflare 人机验证。', 'Complete the Cloudflare human check first.'))
    return false
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (password.length < 8) {
      setError(t('密码至少需要 8 个字符。', 'Password must be at least 8 characters.'))
      return
    }
    if (!validateCaptcha()) return
    setPending(true)
    try {
      const result =
        mode === 'sign-up'
          ? await authClient.signUp.email(
              { email, password, name: name.trim() || email.split('@')[0] },
              captchaOptions(),
            )
          : await authClient.signIn.email({ email, password }, captchaOptions())
      if (result.error) {
        setError(
          mode === 'sign-up'
            ? t('无法创建账户，请确认邮箱格式或换一个邮箱。', 'Could not create the account. Check the email or try another.')
            : t('邮箱或密码不正确，或人机验证已失效。', 'Incorrect email or password, or the human check expired.'),
        )
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError(t('网络异常，请稍后再试。', 'Network error. Please try again.'))
    } finally {
      resetCaptcha()
      setPending(false)
    }
  }

  async function sendOtp() {
    setError('')
    setNotice('')
    if (!email) {
      setError(t('请输入邮箱地址。', 'Enter your email address.'))
      return
    }
    if (resendCooldown > 0) return
    if (!validateCaptcha()) return
    setPending(true)
    try {
      const result = await authClient.emailOtp.sendVerificationOtp(
        { email, type: 'sign-in' },
        captchaOptions(),
      )
      if (result.error) {
        setError(t('验证码发送失败，请稍后再试。', 'Could not send the code. Please try again.'))
        return
      }
      setOtpSent(true)
      setResendCooldown(60)
      setNotice(t('验证码已发送，请检查邮箱。', 'The verification code was sent. Check your inbox.'))
    } catch {
      setError(t('网络异常，请稍后再试。', 'Network error. Please try again.'))
    } finally {
      resetCaptcha()
      setPending(false)
    }
  }

  async function submitOtp(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!/^\d{6}$/.test(otp)) {
      setError(t('请输入 6 位验证码。', 'Enter the 6-digit verification code.'))
      return
    }
    if (!validateCaptcha()) return
    setPending(true)
    try {
      const result = await authClient.signIn.emailOtp(
        { email, otp, ...(mode === 'sign-up' && name.trim() ? { name: name.trim() } : {}) },
        captchaOptions(),
      )
      if (result.error) {
        setError(t('验证码不正确或已过期。', 'The code is invalid or expired.'))
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError(t('网络异常，请稍后再试。', 'Network error. Please try again.'))
    } finally {
      resetCaptcha()
      setPending(false)
    }
  }

  async function signInWithSocial(provider: SocialProvider) {
    setError('')
    setNotice('')
    setPending(true)
    try {
      const result = await authClient.signIn.social({ provider, callbackURL: '/' })
      if (result.error) {
        setError(
          t(
            '该社交登录暂未配置，请先在项目环境变量中加入 OAuth Client ID 和 Secret。',
            'This social login is not configured yet. Add its OAuth Client ID and Secret to the project environment.',
          ),
        )
      }
    } catch {
      setError(t('社交登录暂时不可用，请稍后再试。', 'Social login is unavailable right now. Please try again.'))
    } finally {
      setPending(false)
    }
  }

  const submit = method === 'otp' ? submitOtp : submitPassword

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1" role="tablist" aria-label={t('登录方式', 'Sign-in method')}>
        <button
          type="button"
          role="tab"
          aria-selected={method === 'password'}
          onClick={() => { setMethod('password'); setError(''); setNotice('') }}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${method === 'password' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          {mode === 'sign-up' ? t('密码注册', 'Password') : t('邮箱密码', 'Password')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === 'otp'}
          onClick={() => { setMethod('otp'); setError(''); setNotice('') }}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${method === 'otp' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
        >
          {mode === 'sign-up' ? t('验证码注册', 'Email code') : t('邮箱验证码', 'Email code')}
        </button>
      </div>

      {config.socialProviders.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
        {config.socialProviders.map(provider => <Button key={provider} type="button" variant="outline" disabled={pending} onClick={() => signInWithSocial(provider)}>{provider === 'google' ? 'Google' : 'GitHub'}</Button>)}
      </div>}

      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>{t('或使用邮箱', 'or email')}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit}>
        <FieldGroup>
          {mode === 'sign-up' && (
            <Field>
              <FieldLabel htmlFor="auth-name">{t('昵称', 'Display name')}</FieldLabel>
              <Input id="auth-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('可选，用于账户显示', 'Optional, shown in your account')} maxLength={60} autoComplete="name" />
            </Field>
          )}
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="auth-email">{t('邮箱', 'Email')}</FieldLabel>
            <Input id="auth-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" aria-invalid={!!error} />
          </Field>
          {method === 'password' ? (
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="auth-password">{t('密码', 'Password')}</FieldLabel>
              <Input id="auth-password" type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('至少 8 个字符', 'At least 8 characters')} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} aria-invalid={!!error} />
              <FieldDescription>{t('账户与会话由 Better Auth 加密保护。', 'Accounts and sessions are protected by Better Auth.')}</FieldDescription>
            </Field>
          ) : (
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="auth-otp">{t('邮箱验证码', 'Email verification code')}</FieldLabel>
              <div className="flex gap-2">
                <Input id="auth-otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required={otpSent} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('6 位验证码', '6-digit code')} autoComplete="one-time-code" />
                <Button type="button" variant="outline" disabled={pending || resendCooldown > 0 || authUnavailable || !captchaToken} onClick={sendOtp}>
                  {resendCooldown > 0 ? `${resendCooldown}s` : t('发送', 'Send')}
                </Button>
              </div>
              <FieldDescription>{t('验证码由 Resend 发送，有效期 5 分钟。', 'Codes are sent with Resend and expire in 5 minutes.')}</FieldDescription>
            </Field>
          )}
          {error && <FieldError>{error}</FieldError>}
          {notice && <p className="text-sm text-primary" role="status">{notice}</p>}
          {method === 'otp' && !config.emailReady && <FieldError>{t('邮件服务尚不可用。', 'Email service is unavailable.')}</FieldError>}
          <TurnstileWidget locale={locale} onToken={setCaptchaToken} resetKey={captchaResetKey} siteKey={config.captcha.siteKey} testing={config.captcha.testing} />
          <Button type="submit" variant="strong" disabled={pending || authUnavailable || !captchaToken}>
            {pending ? t('处理中…', 'Working…') : mode === 'sign-up' ? (method === 'otp' ? t('验证码注册', 'Sign up with code') : t('创建账户', 'Create account')) : method === 'otp' ? t('验证码登录', 'Sign in with code') : t('登录', 'Sign in')}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </FieldGroup>
      </form>

      <div className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" />
        <p>{t('资金全部为测试账本，不可提现。真实任务需在节点接入并确认报价后才会执行。', 'All balances are a test ledger and cannot be withdrawn. Real tasks run only after a node is connected and a quote is approved.')}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        {mode === 'sign-up' ? (
          <>
            {t('已有账户？', 'Already have an account? ')}
            <Link href="/sign-in" className="font-medium text-foreground underline underline-offset-4">{t('去登录', 'Sign in')}</Link>
          </>
        ) : (
          <>
            {t('还没有账户？', "Don't have an account? ")}
            <Link href="/sign-up" className="font-medium text-foreground underline underline-offset-4">{t('免费注册', 'Create one')}</Link>
          </>
        )}
      </p>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Mail className="size-4" />
        {t('手机号登录即将支持。', 'Phone sign-in is coming soon.')}
      </p>
    </div>
  )
}
