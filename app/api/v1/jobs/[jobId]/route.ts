import { getMarketJob, resolveMarketPrincipal } from '@/lib/venus/market'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const principal = await resolveMarketPrincipal(request)
  if (!principal) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { jobId } = await params
  const job = await getMarketJob(principal, jobId)
  return job ? Response.json(job, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'not_found' }, { status: 404 })
}
