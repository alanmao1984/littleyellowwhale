import { cancelMarketJob, resolveMarketPrincipal } from '@/lib/venus/market'

export const runtime = 'nodejs'
export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const principal = await resolveMarketPrincipal(request)
  if (!principal) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const result = await cancelMarketJob(principal, (await params).jobId)
  return result ? Response.json(result) : Response.json({ error: 'not_found' }, { status: 404 })
}
