import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Workspace } from '@/components/venus/workspace'
import type { Section } from '@/components/venus/workspace-context'
import { getSessionUser } from '@/lib/venus/session'

const sections = ['tasks', 'compute', 'text-market', 'video-market', 'market', 'organizations', 'nodes', 'earnings', 'developers', 'settings']
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.includes(section)) notFound()
  const locale = (await cookies()).get('venus-locale')?.value === 'en' ? 'en' : 'zh'
  const user = await getSessionUser()
  return <Workspace section={section as Section} locale={locale} user={user} />
}
