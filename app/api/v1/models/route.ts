import { listAvailableModels, resolveMarketPrincipal } from '@/lib/venus/market'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  const principal = await resolveMarketPrincipal(request)
  if (!principal) return Response.json({ error: 'unauthorized' }, { status: 401 })
  return Response.json({ object: 'list', data: await listAvailableModels(principal) }, { headers: { 'Cache-Control': 'no-store' } })
}
