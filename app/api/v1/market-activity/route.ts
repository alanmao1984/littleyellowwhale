import { listPublicMarketActivity, MARKET_ACTIVITY_LIMIT } from '@/lib/venus/market-activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public, unauthenticated, read-only transparent feed. Fixed page cap, stable
// reverse-chronological ordering, and no-store so no redacted data is cached.
export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get('limit') ?? MARKET_ACTIVITY_LIMIT)
  const feed = await listPublicMarketActivity(requested)
  return Response.json(feed, { headers: { 'Cache-Control': 'no-store' } })
}
