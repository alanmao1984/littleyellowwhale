import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createDemoEvent, listDemoEventsForAdmin } from '@/lib/venus/market-activity'
import { requirePlatformAdmin } from '@/lib/venus/platform-authorization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function sessionUserId() {
  return (await auth.api.getSession({ headers: await headers() }))?.user.id ?? null
}

function status(error: 'forbidden' | 'invalid_input' | 'not_found' | 'invalid_transition') {
  return error === 'forbidden' ? 403 : error === 'not_found' ? 404 : error === 'invalid_transition' ? 409 : 400
}

export async function GET() {
  const id = await sessionUserId()
  const actorId = await requirePlatformAdmin(id)
  if (!actorId) return Response.json({ error: 'forbidden' }, { status: id ? 403 : 401 })
  const demos = await listDemoEventsForAdmin(actorId)
  return Response.json({ demos }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const id = await sessionUserId()
  const requestId = request.headers.get('x-request-id') ?? undefined
  const result = await createDemoEvent(id, await request.json().catch(() => null), requestId)
  if (result.ok) return Response.json(result, { status: 201 })
  return Response.json({ error: result.error }, { status: result.error === 'forbidden' && !id ? 401 : status(result.error) })
}
