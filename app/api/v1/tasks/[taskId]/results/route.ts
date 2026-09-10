import { getSessionUser } from '@/lib/venus/session'
import { getTaskResults, reconcileUserLeases } from '@/lib/venus/execution'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  const { taskId } = await params
  if (!z.string().uuid().safeParse(taskId).success) return Response.json({ error: 'not_found' }, { status: 404 })
  await reconcileUserLeases(user.id)
  const results = await getTaskResults(user.id, taskId)
  if (!results) return Response.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  if (new URL(request.url).searchParams.get('download') === '1') headers['Content-Disposition'] = `attachment; filename="venus-${taskId}.json"`
  return Response.json(results, { headers })
}
