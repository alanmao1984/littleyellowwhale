import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { listAvailableModels, listMarketActivity, listOwnedOfferings, publishOffering } from '@/lib/venus/market'

export const runtime = 'nodejs'
async function userId() { return (await auth.api.getSession({ headers: await headers() }))?.user.id ?? null }
export async function GET() {
  const id = await userId()
  if (!id) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const [catalog, owned, activity] = await Promise.all([listAvailableModels(), listOwnedOfferings(id), listMarketActivity(id)])
  return Response.json({ catalog, owned, activity }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
  const id = await userId()
  if (!id) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const result = await publishOffering(id, await request.json().catch(() => null))
  return Response.json(result, { status: result.ok ? 201 : result.error === 'node_unavailable' ? 409 : 400 })
}
