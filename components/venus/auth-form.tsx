'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field'

type Mode = 'sign-in' | 'sign-up'
type Locale = 'zh' | 'en'

export function AuthForm({ mode, locale }: { mode: Mode; locale: Locale }) {
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en)
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError(t('密码至少需要 8 个字符。', 'Password must be at least 8 characters.'))
      return
    }
    setPending(true)
    try {
      const result =
        mode === 'sign-up'
          ? await authClient.signUp.email({ email, password, name: name.trim() || email.split('@')[0] })
          : await authClient.signIn.email({ email, password })
      if (result.error) {
        setError(
          mode === 'sign-up'
            ? t('无法创建账户，请确认邮箱格式或换一个邮箱。', 'Could not create the account. Check the email or try another.')
            : t('邮箱或密码不正确。', 'Incorrect email or password.'),
        )
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError(t('网络异常，请稍后再试。', 'Network error. Please try again.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        {mode === 'sign-up' && (
          <Field>
            <FieldLabel htmlFor="auth-name">{t('昵称', 'Display name')}</FieldLabel>
            <Input
              id="auth-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('可选，用于账户显示', 'Optional, shown in your account')}
              maxLength={60}
              autoComplete="name"
            />
          </Field>
        )}
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="auth-email">{t('邮箱', 'Email')}</FieldLabel>
          <Input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={!!error}
          />
        </Field>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="auth-password">{t('密码', 'Password')}</FieldLabel>
          <Input
            id="auth-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('至少 8 个字符', 'At least 8 characters')}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            aria-invalid={!!error}
          />
          <FieldDescription>
            {t('账户与会话由 Better Auth 加密保护。', 'Accounts and sessions are protected by Better Auth.')}
          </FieldDescription>
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Button type="submit" variant="strong" disabled={pending}>
          {pending
            ? t('处理中…', 'Working…')
            : mode === 'sign-up'
              ? t('创建账户', 'Create account')
              : t('登录', 'Sign in')}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </FieldGroup>
      <div className="flex items-start gap-2 pt-5 text-sm leading-relaxed text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" />
        <p>
          {t(
            '资金全部为测试账本，不可提现。真实任务需在节点接入并确认报价后才会执行。',
            'All balances are a test ledger and cannot be withdrawn. Real tasks run only after a node is connected and a quote is approved.',
          )}
        </p>
      </div>
      <p className="pt-4 text-sm text-muted-foreground">
        {mode === 'sign-up' ? (
          <>
            {t('已有账户？', 'Already have an account? ')}
            <Link href="/sign-in" className="font-medium text-foreground underline underline-offset-4">
              {t('去登录', 'Sign in')}
            </Link>
          </>
        ) : (
          <>
            {t('还没有账户？', "Don't have an account? ")}
            <Link href="/sign-up" className="font-medium text-foreground underline underline-offset-4">
              {t('免费注册', 'Create one')}
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
