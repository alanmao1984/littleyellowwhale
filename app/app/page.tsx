import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Workspace } from '@/components/venus/workspace'
import { getSessionUser } from '@/lib/venus/session'

export default async function DashboardIndexPage() {
  const user = await getSessionUser()
  if (!user) redirect('/sign-in?next=%2Fapp')
  const locale = (await cookies()).get('venus-locale')?.value === 'en' ? 'en' : 'zh'
  return <Workspace section="overview" locale={locale} user={user} />
}
