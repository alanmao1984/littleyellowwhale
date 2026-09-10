import { cookies, headers } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AuthForm } from '@/components/venus/auth-form'

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/')
  const locale = (await cookies()).get('venus-locale')?.value === 'en' ? 'en' : 'zh'
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en)
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="eyebrow">
          {t('← 返回小黄鲸 Venus', '← Back to Venus')}
        </Link>
        <div className="panel mt-4 p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {t('登录小黄鲸 Venus', 'Sign in to Venus')}
          </h1>
          <p className="pt-2 pb-6 text-sm leading-relaxed text-muted-foreground text-pretty">
            {t('管理批量任务、算力节点与测试收益账本。', 'Manage batch tasks, compute nodes, and your test ledger.')}
          </p>
          <AuthForm mode="sign-in" locale={locale} />
        </div>
      </div>
    </main>
  )
}
