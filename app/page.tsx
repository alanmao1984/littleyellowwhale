import { cookies } from 'next/headers'
import { MarketingHome } from '@/components/venus/marketing-home'
import { getPublicPlatformSummary } from '@/lib/venus/public-platform'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const locale = (await cookies()).get('venus-locale')?.value === 'en' ? 'en' : 'zh'
  const summary = await getPublicPlatformSummary()
  return <MarketingHome locale={locale} summary={summary} />
}
