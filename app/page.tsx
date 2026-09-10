import { cookies } from 'next/headers'
import { Workspace } from '@/components/venus/workspace'
import { getSessionUser } from '@/lib/venus/session'

export default async function Page() {
  const locale = (await cookies()).get('venus-locale')?.value === 'en' ? 'en' : 'zh'
  const user = await getSessionUser()
  return <Workspace locale={locale} user={user} />
}
