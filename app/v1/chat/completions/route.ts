import { randomUUID } from 'node:crypto'
import { getMarketJob, resolveMarketPrincipal, submitMarketJob } from '@/lib/venus/market'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function error(message: string, type: string, status: number, code = type) {
  return Response.json({ error: { message, type, param: null, code } }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const principal = await resolveMarketPrincipal(request)
  if (!principal) return error('Bearer token 无效、已过期或缺少 market:invoke scope。', 'authentication_error', 401)
  const body = await request.json().catch(() => null)
  const requestId = request.headers.get('x-request-id') || randomUUID()
  const created = await submitMarketJob(principal, requestId, body)
  if (!created.ok) return error(created.error, 'invalid_request_error', created.status)
  const asyncPreferred = request.headers.get('prefer')?.toLowerCase().includes('respond-async')
  if (!asyncPreferred) {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const job = await getMarketJob(principal, created.jobId)
      if (job?.status === 'completed' && job.output) {
        return Response.json({ id: `chatcmpl-${job.id}`, object: 'chat.completion', created: job.created, model: job.model, choices: [{ index: 0, message: { role: 'assistant', content: job.output }, finish_reason: 'stop' }], usage: job.usage ? { prompt_tokens: job.usage.inputTokens, completion_tokens: job.usage.outputTokens, total_tokens: job.usage.inputTokens + job.usage.outputTokens } : null, venus: { currency: 'VTEST', reserved_amount: job.reserved_amount, settled_amount: job.settled_amount } }, { headers: { 'Cache-Control': 'no-store', 'X-Venus-Job-Id': job.id } })
      }
      if (job?.status === 'cancelled' || job?.error) return error(job.error || 'job_cancelled', 'processing_error', 409)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  return Response.json({ id: created.jobId, object: 'venus.job', status: 'queued', task_id: created.taskId, reserved_amount: created.reserved, currency: 'VTEST', status_url: `/api/v1/jobs/${created.jobId}` }, { status: 202, headers: { 'Cache-Control': 'no-store', Location: `/api/v1/jobs/${created.jobId}`, 'Retry-After': '2' } })
}
