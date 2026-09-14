import { NextResponse } from 'next/server'
import { getPublicPlatformSummary } from '@/lib/venus/public-platform'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const summary = await getPublicPlatformSummary()
  return NextResponse.json(summary, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
    },
  })
}
