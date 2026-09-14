import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { Workspace } from '@/components/venus/workspace'
import type { Section } from '@/components/venus/workspace-context'
import { getSessionUser } from '@/lib/venus/session'

const sections = ['tasks', 'compute', 'text-market', 'video-market', 'market', 'organizations', 'nodes', 'earnings', 'developers', 'settings'] as const

export default async function DashboardSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.includes(section as (typeof sections)[number])) notFound()
  const user = await getSessionUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/app/${section}`)}`)
  const locale = (await cookies()).get('venus-locale')?.value === 'en' ? 'en' : 'zh'
  return <Workspace section={section as Section} locale={locale} user={user} />
}
