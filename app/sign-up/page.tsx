import { cookies, headers } from 'next/headers'
import { AuthBrandLink } from '@/components/venus/auth-brand-link'
import { redirect } from 'next/navigation'
import { auth, authFormConfig } from '@/lib/auth'
import { AuthForm } from '@/components/venus/auth-form'
import { safeDashboardReturnTo } from '@/lib/venus/safe-return-to'

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const returnTo = safeDashboardReturnTo((await searchParams).next)
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect(returnTo)
  const locale = (await cookies()).get('venus-locale')?.value === 'en' ? 'en' : 'zh'
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en)
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <AuthBrandLink label={t('返回小黄鲸', 'Back to little yellow whale')} />
        <div className="panel mt-4 p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {t('注册小黄鲸 Venus', 'Create your Venus account')}
          </h1>
          <p className="pt-2 pb-6 text-sm leading-relaxed text-muted-foreground text-pretty">
            {t('使用邮箱和密码创建账户，即可开始整理任务草稿。', 'Sign up with email and password to start preparing task drafts.')}
          </p>
          <AuthForm mode="sign-up" locale={locale} config={authFormConfig} returnTo={returnTo} />
        </div>
      </div>
    </main>
  )
}
