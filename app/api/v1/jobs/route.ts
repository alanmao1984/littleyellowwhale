import { randomUUID } from 'node:crypto'
import { resolveMarketPrincipal, submitMarketJob } from '@/lib/venus/market'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const principal = await resolveMarketPrincipal(request)
  if (!principal) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const result = await submitMarketJob(principal, request.headers.get('x-request-id') || randomUUID(), await request.json().catch(() => null))
  return result.ok ? Response.json({ id: result.jobId, task_id: result.taskId, status: result.status, reserved_amount: result.reserved, currency: 'VTEST' }, { status: result.duplicate ? 200 : 202 }) : Response.json({ error: result.error }, { status: result.status })
}
