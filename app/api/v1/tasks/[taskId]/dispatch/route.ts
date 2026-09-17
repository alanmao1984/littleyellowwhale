import { z } from 'zod'
import { getSessionUser } from '@/lib/venus/session'
import { getTaskDispatchDecision } from '@/lib/venus/execution'
import { dispatchReasonLabels } from '@/lib/venus/dispatch/reason'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  const { taskId } = await params
  if (!z.string().uuid().safeParse(taskId).success) return Response.json({ error: 'not_found' }, { status: 404 })
  const decision = await getTaskDispatchDecision(user.id, taskId)
  if (!decision) return Response.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return Response.json({ ...decision, label: dispatchReasonLabels[decision.reason] }, { headers: { 'Cache-Control': 'no-store' } })
}
